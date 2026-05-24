/*
  # Inventory Reservation System - Database Schema

  Creates all tables for race-condition-safe inventory reservation.

  ## Tables
  - Product: id, name, sku (unique), description, price, imageUrl
  - Warehouse: id, name, location
  - Inventory: productId + warehouseId (unique), totalUnits, reservedUnits
  - Reservation: productId, warehouseId, quantity, status (PENDING/CONFIRMED/RELEASED), expiresAt
  - IdempotencyKey: key (unique), endpoint, responseBody, statusCode

  ## Security
  - RLS enabled on all tables
  - Public read access for storefront (products, warehouses, inventory, reservations)
  - Service role full access for API routes
*/

-- Create enum for reservation status
DO $$ BEGIN
  CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

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
  CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
  CONSTRAINT "Inventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE
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
  CONSTRAINT "Reservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
  CONSTRAINT "Reservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE
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

-- Drop existing policies if they exist
DO $$ BEGIN
  DROP POLICY IF EXISTS "Anyone can read products" ON "Product";
  DROP POLICY IF EXISTS "Anyone can read warehouses" ON "Warehouse";
  DROP POLICY IF EXISTS "Anyone can read inventory" ON "Inventory";
  DROP POLICY IF EXISTS "Anyone can read reservations" ON "Reservation";
  DROP POLICY IF EXISTS "Service role full access to products" ON "Product";
  DROP POLICY IF EXISTS "Service role full access to warehouses" ON "Warehouse";
  DROP POLICY IF EXISTS "Service role full access to inventory" ON "Inventory";
  DROP POLICY IF EXISTS "Service role full access to reservations" ON "Reservation";
  DROP POLICY IF EXISTS "Service role full access to idempotency keys" ON "IdempotencyKey";
END $$;

-- Allow public read access for storefront
CREATE POLICY "Anyone can read products"
  ON "Product" FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read warehouses"
  ON "Warehouse" FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read inventory"
  ON "Inventory" FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can read reservations"
  ON "Reservation" FOR SELECT
  TO anon, authenticated
  USING (true);

-- Service role bypass for all operations (API routes)
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
