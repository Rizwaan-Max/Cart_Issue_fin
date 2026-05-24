import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { createId } from '@/lib/cuid';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const endpoint = `/api/reservations/${id}/confirm`;
  const idempotencyKey = req.headers.get('Idempotency-Key');

  try {
    if (idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existing) {
        return NextResponse.json(existing.responseBody, { status: existing.statusCode });
      }
    }

    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status === 'CONFIRMED') {
      return NextResponse.json(reservation, { status: 200 });
    }

    if (reservation.status === 'RELEASED') {
      return NextResponse.json({ error: 'Reservation was already released' }, { status: 409 });
    }

    // Check expiry
    if (reservation.expiresAt < new Date()) {
      // Release the reservation inline
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          UPDATE "Reservation"
          SET status = 'RELEASED'::"ReservationStatus",
              "releasedAt" = now(),
              "updatedAt" = now()
          WHERE id = ${id} AND status = 'PENDING'
        `;
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${reservation.quantity}),
              "updatedAt" = now()
          WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
        `;
      });
      return NextResponse.json({ error: 'Reservation has expired' }, { status: 410 });
    }

    // Confirm: decrement reservedUnits AND totalUnits (stock is permanently sold)
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "Reservation"
        SET status = 'CONFIRMED'::"ReservationStatus",
            "confirmedAt" = now(),
            "updatedAt" = now()
        WHERE id = ${id} AND status = 'PENDING'
      `;
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${reservation.quantity}),
            "totalUnits" = GREATEST(0, "totalUnits" - ${reservation.quantity}),
            "updatedAt" = now()
        WHERE "productId" = ${reservation.productId} AND "warehouseId" = ${reservation.warehouseId}
      `;
      return tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });
    });

    const statusCode = 200;

    if (idempotencyKey && updated) {
      await prisma.idempotencyKey.create({
        data: {
          id: createId(),
          key: idempotencyKey,
          endpoint,
          responseBody: updated as unknown as Prisma.InputJsonValue,
          statusCode,
        },
      });
    }

    return NextResponse.json(updated, { status: statusCode });
  } catch (error) {
    console.error('POST /api/reservations/[id]/confirm error:', error);
    return NextResponse.json({ error: 'Failed to confirm reservation' }, { status: 500 });
  }
}
