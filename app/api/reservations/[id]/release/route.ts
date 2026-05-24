import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const reservation = await prisma.reservation.findUnique({ where: { id } });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    if (reservation.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot release a reservation with status ${reservation.status}` },
        { status: 409 }
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
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
      return tx.reservation.findUnique({
        where: { id },
        include: { product: true, warehouse: true },
      });
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('POST /api/reservations/[id]/release error:', error);
    return NextResponse.json({ error: 'Failed to release reservation' }, { status: 500 });
  }
}
