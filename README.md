# StockHold — Inventory Reservation System

A race-condition-safe inventory reservation system built with Next.js 14 App Router, Prisma ORM, and Supabase.

## How to Get the Supabase DATABASE_URL

1. Open your project on [supabase.com](https://supabase.com)
2. Go to **Settings → Database → Connection string**
3. Select the **URI** tab
4. Use the **Transaction** pooler (port 6543) as `DATABASE_URL`
5. Use the **Session** pooler or direct (port 5432) as `DIRECT_URL`
6. Replace `[YOUR-PASSWORD]` with your database password

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables and fill in values
cp .env.example .env

# 3. Push the Prisma schema to your database
npx prisma db push

# 4. Seed the database with sample products, warehouses, and inventory
npm run db:seed

# 5. Start the development server
npm run dev
```

## How the Expiry Mechanism Works

Reservation expiry uses a two-layer approach to ensure no stock is permanently stuck in a "reserved" state:

**Layer 1 — Vercel Cron (proactive)**
`vercel.json` configures a cron job that calls `GET /api/cron/expire` every minute. The endpoint finds all `PENDING` reservations where `expiresAt < NOW()`, sets their status to `RELEASED`, and decrements `reservedUnits` in the Inventory table. Protected by `Authorization: Bearer <CRON_SECRET>`.

**Layer 2 — Lazy cleanup on read (reactive)**
`GET /api/reservations/:id` checks if the returned reservation is `PENDING` and past its `expiresAt`. If so, it releases the reservation inline before responding with HTTP 410. This catches cases where the cron hasn't run yet and the user is still on the checkout page.

## How Concurrency Safety Works (SELECT FOR UPDATE)

When creating a reservation, the critical section uses a PostgreSQL row-level lock:

```sql
SELECT id, "totalUnits", "reservedUnits"
FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` acquires an exclusive lock on the selected row for the duration of the transaction. If two requests arrive simultaneously for the last unit:

- Request A acquires the lock, reads `availableUnits = 1`, reserves it, increments `reservedUnits`, commits.
- Request B was blocked waiting for the lock. When it finally reads, `availableUnits = 0`. It throws `INSUFFICIENT_STOCK` → HTTP 409.

This serializes concurrent requests without application-level mutexes or optimistic retry loops. The database guarantees exactly-once semantics for the last unit.

## Trade-offs Made

| Decision | Trade-off |
|----------|-----------|
| `SELECT FOR UPDATE` locking | Maximum safety at the cost of serialized writes per inventory row. Under extreme concurrency on a single SKU, requests queue behind the lock. Acceptable for typical e-commerce throughput. |
| `reservedUnits` counter | Avoids a `COUNT(*)` query on reservations every time. Requires careful increment/decrement hygiene (handled with `GREATEST(0, ...)` guards). |
| Confirm decrements `totalUnits` | Treats confirmed sales as permanently reducing stock. Simpler than a separate "sold" state. Re-stocking requires an admin operation. |
| 10-minute hold window | Long enough for 3DS/UPI/wallet redirects, short enough that popular items don't stay locked indefinitely. |
| Idempotency on reserve + confirm | Prevents double-reservation if the client retries due to network timeout. The key is client-generated and scoped to a single attempt. |
| Lazy expiry on GET | Ensures the checkout page always shows accurate status without depending on the cron. Adds ~1 DB write on the read path for expired reservations only. |

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/products` | List all products with inventory per warehouse |
| GET | `/api/warehouses` | List all warehouses |
| POST | `/api/reservations` | Create a reservation (race-condition safe) |
| GET | `/api/reservations/:id` | Get reservation with lazy expiry check |
| POST | `/api/reservations/:id/confirm` | Confirm purchase (returns 410 if expired) |
| POST | `/api/reservations/:id/release` | Cancel reservation early |
| GET | `/api/cron/expire` | Protected cron endpoint to batch-release expired holds |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Supabase connection string (Transaction pooler, port 6543) |
| `DIRECT_URL` | Direct connection for migrations (port 5432) |
| `CRON_SECRET` | Random secret to protect the cron endpoint |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
