import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
    }

    // Lazy expiry: if PENDING and past expiresAt, release it inline
    if (reservation.status === 'PENDING' && reservation.expiresAt < new Date()) {
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

    return NextResponse.json({
      ...reservation,
    });
  } catch (error) {
    console.error('GET /api/reservations/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch reservation' }, { status: 500 });
  }
}
