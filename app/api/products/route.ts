import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
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
