import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {

    // Lazy expiry cleanup
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() }
      }
    })

    for (const r of expired) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: r.id },
          data: { status: "RELEASED", releasedAt: new Date() }
        }),
        prisma.inventory.updateMany({
          where: { productId: r.productId, warehouseId: r.warehouseId },
          data: { reservedUnits: { decrement: r.quantity } }
        })
      ])
    }

    // Original code unchanged below
    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: { warehouse: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const productsWithAvailable = products.map((product) => ({
      ...product,
      inventories: product.inventories.map((inv) => ({
        ...inv,
        availableUnits: inv.totalUnits - inv.reservedUnits,
      })),
    }));

    return NextResponse.json(productsWithAvailable);
  } catch (error) {
    console.error('GET /api/products error:', error);
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}