import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import "dotenv/config";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function cuid() {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 14);
  return `c${timestamp}${rand}`;
}

async function main() {
  console.log('Seeding database...');

  // Clear existing data (in dependency order)
  await prisma.idempotencyKey.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Warehouses
  const mumbai = await prisma.warehouse.create({
    data: { id: cuid(), name: 'Mumbai Central', location: 'Mumbai, Maharashtra' },
  });
  const delhi = await prisma.warehouse.create({
    data: { id: cuid(), name: 'Delhi North', location: 'New Delhi, Delhi' },
  });
  const bangalore = await prisma.warehouse.create({
    data: { id: cuid(), name: 'Bangalore Tech Park', location: 'Bengaluru, Karnataka' },
  });

  console.log('Created 3 warehouses');

  // Products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'Sony WH-1000XM5 Headphones',
        sku: 'SONY-WH1000XM5-BLK',
        description:
          'Industry-leading noise canceling with 30-hour battery life and exceptional sound quality. Perfect for travel and work-from-home.',
        price: 29990,
        imageUrl: 'https://images.pexels.com/photos/3945667/pexels-photo-3945667.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'Apple AirPods Pro (2nd Gen)',
        sku: 'APPLE-APP2-WHT',
        description:
          'Active Noise Cancellation, Adaptive Transparency, and Personalized Spatial Audio. Up to 30 hours of listening time with case.',
        price: 24900,
        imageUrl: 'https://images.pexels.com/photos/7156886/pexels-photo-7156886.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'Canon EOS R50 Mirrorless Camera',
        sku: 'CANON-EOSR50-BLK',
        description:
          '24.2 MP APS-C sensor, 4K video, dual-pixel autofocus, ideal for content creators and photography enthusiasts.',
        price: 74990,
        imageUrl: 'https://images.pexels.com/photos/90946/pexels-photo-90946.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'Samsung 65" QLED 4K TV',
        sku: 'SAMSUNG-QN65Q80C',
        description:
          'Quantum Dot technology delivers brilliant color and contrast. Smart TV with built-in streaming apps and voice assistant.',
        price: 119990,
        imageUrl: 'https://images.pexels.com/photos/1201996/pexels-photo-1201996.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'Dyson V15 Detect Vacuum',
        sku: 'DYSON-V15-DETECT',
        description:
          'Laser reveals microscopic dust. Intelligent suction auto-adjusts to the floor type, powered by the most powerful Dyson motor.',
        price: 59900,
        imageUrl: 'https://images.pexels.com/photos/38325/vacuum-cleaner-carpet-cleaner-housework-38325.jpeg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
    prisma.product.create({
      data: {
        id: cuid(),
        name: 'ASUS ROG Zephyrus G14 Laptop',
        sku: 'ASUS-ROG-G14-2024',
        description:
          'AMD Ryzen 9, RTX 4060, 14" 2.5K 165Hz display. The ultimate ultraportable gaming laptop for power users.',
        price: 129990,
        imageUrl: 'https://images.pexels.com/photos/7974/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=800',
      },
    }),
  ]);

  console.log(`Created ${products.length} products`);

  // Inventory — varied stock levels
  const inventoryData = [
    // Sony Headphones: good stock in Mumbai, low in Delhi, out in Bangalore
    { product: products[0], warehouse: mumbai, total: 15, reserved: 2 },
    { product: products[0], warehouse: delhi, total: 2, reserved: 1 },
    { product: products[0], warehouse: bangalore, total: 0, reserved: 0 },

    // AirPods Pro: plenty everywhere
    { product: products[1], warehouse: mumbai, total: 25, reserved: 5 },
    { product: products[1], warehouse: delhi, total: 18, reserved: 3 },
    { product: products[1], warehouse: bangalore, total: 12, reserved: 1 },

    // Canon Camera: scarce — only 1 unit total (demo 409)
    { product: products[2], warehouse: mumbai, total: 1, reserved: 0 },
    { product: products[2], warehouse: delhi, total: 0, reserved: 0 },
    { product: products[2], warehouse: bangalore, total: 3, reserved: 0 },

    // Samsung TV: limited availability
    { product: products[3], warehouse: mumbai, total: 4, reserved: 1 },
    { product: products[3], warehouse: delhi, total: 2, reserved: 0 },
    { product: products[3], warehouse: bangalore, total: 0, reserved: 0 },

    // Dyson Vacuum: moderate stock
    { product: products[4], warehouse: mumbai, total: 8, reserved: 0 },
    { product: products[4], warehouse: delhi, total: 6, reserved: 2 },
    { product: products[4], warehouse: bangalore, total: 5, reserved: 0 },

    // ASUS ROG Laptop: very limited (1 in Mumbai, out elsewhere — demo 409)
    { product: products[5], warehouse: mumbai, total: 1, reserved: 0 },
    { product: products[5], warehouse: delhi, total: 0, reserved: 0 },
    { product: products[5], warehouse: bangalore, total: 2, reserved: 0 },
  ];

  for (const item of inventoryData) {
    await prisma.inventory.create({
      data: {
        id: cuid(),
        productId: item.product.id,
        warehouseId: item.warehouse.id,
        totalUnits: item.total,
        reservedUnits: item.reserved,
      },
    });
  }

  console.log(`Created ${inventoryData.length} inventory records`);
  console.log('Seeding complete!');
  console.log('');
  console.log('Demo scenarios:');
  console.log('  - Canon EOS R50 (Mumbai): 1 unit — try reserving simultaneously to trigger 409');
  console.log('  - ASUS ROG Laptop (Mumbai): 1 unit — same as above');
  console.log('  - Sony Headphones (Bangalore): 0 units — out of stock');
  console.log('  - Samsung TV (Bangalore): 0 units — out of stock');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
