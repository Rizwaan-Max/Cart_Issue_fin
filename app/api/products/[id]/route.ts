import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    // Lazy expiry cleanup
    const expired = await prisma.reservation.findMany({
      where: {
        status: 'PENDING',
        expiresAt: { lt: new Date() },
      },
    });

    for (const r of expired) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: r.id },
          data: { status: 'RELEASED', releasedAt: new Date() },
        }),
        prisma.inventory.updateMany({
          where: { productId: r.productId, warehouseId: r.warehouseId },
          data: { reservedUnits: { decrement: r.quantity } },
        }),
      ]);
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        inventories: {
          include: { warehouse: true },
        },
      },
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const productWithAvailable = {
      ...product,
      inventories: product.inventories.map((inv) => ({
        ...inv,
        availableUnits: inv.totalUnits - inv.reservedUnits,
      })),
    };

    return NextResponse.json(productWithAvailable);
  } catch (error) {
    console.error(`GET /api/products/${id} error:`, error);
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 });
  }
}
