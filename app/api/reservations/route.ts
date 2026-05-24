import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { createId } from '@/lib/cuid';

const createReservationSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive(),
});

async function checkIdempotency(key: string, endpoint: string) {
  return prisma.idempotencyKey.findUnique({ where: { key } });
}

async function saveIdempotency(
  key: string,
  endpoint: string,
  responseBody: Prisma.InputJsonValue,
  statusCode: number
) {
  await prisma.idempotencyKey.create({
    data: {
      id: createId(),
      key,
      endpoint,
      responseBody,
      statusCode,
    },
  });
}

export async function POST(req: NextRequest) {
  const endpoint = '/api/reservations';
  const idempotencyKey = req.headers.get('Idempotency-Key');

  try {
    if (idempotencyKey) {
      const existing = await checkIdempotency(idempotencyKey, endpoint);
      if (existing) {
        return NextResponse.json(existing.responseBody, { status: existing.statusCode });
      }
    }

    const body = await req.json();
    const parsed = createReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { productId, warehouseId, quantity } = parsed.data;

    type InventoryRow = { id: string; totalUnits: number; reservedUnits: number };

    const reservation = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<InventoryRow[]>`
        SELECT id, "totalUnits", "reservedUnits"
        FROM "Inventory"
        WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        FOR UPDATE
      `;

      if (rows.length === 0) {
        throw new Error('INVENTORY_NOT_FOUND');
      }

      const inv = rows[0];
      const available = inv.totalUnits - inv.reservedUnits;

      if (available < quantity) {
        throw new Error('INSUFFICIENT_STOCK');
      }

      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reservedUnits" = "reservedUnits" + ${quantity},
            "updatedAt" = now()
        WHERE id = ${inv.id}
      `;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
      const reservationId = createId();

      await tx.$executeRaw`
        INSERT INTO "Reservation" (id, "productId", "warehouseId", quantity, status, "expiresAt", "createdAt", "updatedAt")
        VALUES (${reservationId}, ${productId}, ${warehouseId}, ${quantity}, 'PENDING'::"ReservationStatus", ${expiresAt}, ${now}, ${now})
      `;

      return tx.reservation.findUnique({
        where: { id: reservationId },
        include: { product: true, warehouse: true },
      });
    });

    const responseBody = reservation;
    const statusCode = 201;

    if (idempotencyKey && reservation) {
      await saveIdempotency(idempotencyKey, endpoint, responseBody as Prisma.InputJsonValue, statusCode);
    }

    return NextResponse.json(responseBody, { status: statusCode });
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message === 'INSUFFICIENT_STOCK') {
        return NextResponse.json({ error: 'Insufficient stock available' }, { status: 409 });
      }
      if (error.message === 'INVENTORY_NOT_FOUND') {
        return NextResponse.json({ error: 'Inventory record not found' }, { status: 404 });
      }
    }
    console.error('POST /api/reservations error:', error);
    return NextResponse.json({ error: 'Failed to create reservation' }, { status: 500 });
  }
}
