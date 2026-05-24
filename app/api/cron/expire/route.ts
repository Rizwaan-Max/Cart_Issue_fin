import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();

    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: now },
      },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    });

    if (expiredReservations.length === 0) {
      return NextResponse.json({ released: 0 });
    }

    await prisma.$transaction(async (tx) => {
      for (const res of expiredReservations) {
        await tx.$executeRaw`
          UPDATE "Reservation"
          SET status = 'RELEASED'::"ReservationStatus",
              "releasedAt" = now(),
              "updatedAt" = now()
          WHERE id = ${res.id} AND status = 'PENDING'
        `;
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "reservedUnits" = GREATEST(0, "reservedUnits" - ${res.quantity}),
              "updatedAt" = now()
          WHERE "productId" = ${res.productId} AND "warehouseId" = ${res.warehouseId}
        `;
      }
    });

    return NextResponse.json({ released: expiredReservations.length });
  } catch (error) {
    console.error('GET /api/cron/expire error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
