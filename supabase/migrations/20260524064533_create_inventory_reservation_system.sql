/*
  # Inventory Reservation System - Initial Schema

  ## Summary
  Creates all tables needed for a race-condition-safe inventory reservation system
  that temporarily holds stock during checkout.

  ## New Tables

  ### Product
  - `id` - unique identifier (text, cuid)
  - `name` - product display name
  - `sku` - unique stock-keeping unit identifier
  - `description` - product description
  - `price` - price in INR (float)
  - `imageUrl` - product image URL
  - `createdAt`, `updatedAt` - timestamps

  ### Warehouse
  - `id` - unique identifier
  - `name` - warehouse name
  - `location` - physical location string
  - `createdAt`, `updatedAt` - timestamps

  ### Inventory
  - `id` - unique identifier
  - `productId` + `warehouseId` - unique pair (composite unique constraint)
  - `totalUnits` - total physical units in stock
  - `reservedUnits` - units currently held by PENDING reservations
  - Note: availableUnits = totalUnits - reservedUnits (computed on read)

  ### Reservation
  - `id` - unique identifier
  - `productId`, `warehouseId`, `quantity` - what is being reserved
  - `status` - PENDING / CONFIRMED / RELEASED enum
  - `expiresAt` - when the hold expires (10 minutes from creation)
  - `confirmedAt`, `releasedAt` - nullable completion timestamps

  ### IdempotencyKey
  - `key` - client-supplied unique key (unique constraint)
  - `endpoint` - which endpoint processed this key
  - `responseBody` - stored JSON response to replay
  - `statusCode` - HTTP status to replay

  ## Security
  - RLS enabled on all tables
  - Service role can perform all operations (API routes use service role)
  - Public users can read products, warehouses, and inventory (for the storefront)
*/

-- Create enum for reservation status
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED');

-- Product table
CREATE TABLE IF NOT EXISTS "Product" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "name"        TEXT NOT NULL,
  "sku"         TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price"       DOUBLE PRECISION NOT NULL,
  "imageUrl"    TEXT NOT NULL,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Product_sku_key" UNIQUE ("sku")
);

-- Warehouse table
CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "location"  TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory table
CREATE TABLE IF NOT EXISTS "Inventory" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "productId"     TEXT NOT NULL,
  "warehouseId"   TEXT NOT NULL,
  "totalUnits"    INTEGER NOT NULL DEFAULT 0,
  "reservedUnits" INTEGER NOT NULL DEFAULT 0,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Inventory_productId_warehouseId_key" UNIQUE ("productId", "warehouseId"),
  CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id"),
  CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
);

-- Reservation table
CREATE TABLE IF NOT EXISTS "Reservation" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "productId"   TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "quantity"    INTEGER NOT NULL,
  "status"      "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"   TIMESTAMPTZ NOT NULL,
  "confirmedAt" TIMESTAMPTZ,
  "releasedAt"  TIMESTAMPTZ,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "Reservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id"),
  CONSTRAINT "Reservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
);

-- IdempotencyKey table
CREATE TABLE IF NOT EXISTS "IdempotencyKey" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "key"          TEXT NOT NULL,
  "endpoint"     TEXT NOT NULL,
  "responseBody" JSONB NOT NULL,
  "statusCode"   INTEGER NOT NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "IdempotencyKey_key_key" UNIQUE ("key")
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX IF NOT EXISTS "Inventory_warehouseId_idx" ON "Inventory"("warehouseId");
CREATE INDEX IF NOT EXISTS "Reservation_productId_idx" ON "Reservation"("productId");
CREATE INDEX IF NOT EXISTS "Reservation_status_idx" ON "Reservation"("status");
CREATE INDEX IF NOT EXISTS "Reservation_expiresAt_idx" ON "Reservation"("expiresAt");

-- Enable RLS on all tables
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IdempotencyKey" ENABLE ROW LEVEL SECURITY;

-- Allow public read access to products (storefront)
CREATE POLICY "Anyone can read products"
  ON "Product" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow public read access to warehouses
CREATE POLICY "Anyone can read warehouses"
  ON "Warehouse" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow public read access to inventory
CREATE POLICY "Anyone can read inventory"
  ON "Inventory" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow public read access to reservations (needed for checkout page)
CREATE POLICY "Anyone can read reservations"
  ON "Reservation" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Service role bypass for all write operations (API routes use service role key)
CREATE POLICY "Service role full access to products"
  ON "Product" FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to warehouses"
  ON "Warehouse" FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to inventory"
  ON "Inventory" FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to reservations"
  ON "Reservation" FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to idempotency keys"
  ON "IdempotencyKey" FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
