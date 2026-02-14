# Concurrency & Idempotency

## Holds (Redis-only)

- `POST /bookings/hold` creates a Redis key: `booking:hold:{holdId}` with `EX 300` (5 min TTL)
- Hold data: `{ providerId, customerId, startTime, endTime, notes }`
- **No hold-overlap checking** — multiple customers can hold the same slot. The DB is the arbiter.
- Hold is a soft reservation, not a guarantee. It prevents the UX of confirming an already-gone slot.

## Confirm Flow

1. Check hold exists in Redis → `409 HOLD_EXPIRED` if gone
2. Verify `hold.customerId === currentUser.id` → `403 FORBIDDEN` if mismatch
3. **TOCTOU buffer re-check**: query PG for CONFIRMED bookings where `startTime - buffer < proposedEnd AND endTime + buffer > proposedStart` → `409 SLOT_UNAVAILABLE`
4. PG transaction:
   - `pg_advisory_xact_lock(('x' || substr(md5(providerId), 1, 16))::bit(64)::bigint)` — serializes per provider
   - `INSERT INTO Booking (...) VALUES (..., 'CONFIRMED', ..., idempotencyKey)`
   - Exclusion constraint fires on raw overlap → catch → `409 SLOT_UNAVAILABLE`
   - Unique idempotencyKey fires on duplicate → catch → fetch + return existing booking
5. Delete Redis hold
6. Return confirmed booking

## Reschedule Flow

Single PG transaction (with advisory lock):
1. **Insert new CONFIRMED booking first** (with idempotencyKey)
2. Cancel old booking (`status = CANCELLED`)
3. If insert fails → transaction rolls back → old booking unchanged

## Concurrency Layers

| Layer | Mechanism | What it prevents |
|-------|-----------|------------------|
| Redis hold TTL | `SET ... EX 300` | Stale holds (auto-cleanup) |
| App buffer check | PG query at hold + confirm + reschedule | Buffer violations |
| Advisory lock | `pg_advisory_xact_lock` per provider | Concurrent confirm races (reduces constraint errors) |
| Exclusion constraint | GiST on `(providerId, tstzrange(..., '[)'))` | **Hard overlap guarantee** (final safety net) |

## Buffer Enforcement

Buffer is **app-level only** — not in the exclusion constraint.

Enforced at 3 points:
1. **Hold creation**: reject if any CONFIRMED booking overlaps with buffer
2. **Confirm TOCTOU**: same check inside transaction (catches bookings created between hold and confirm)
3. **Reschedule**: same check for new time slot inside transaction

## Idempotency

| Operation | Mechanism | On duplicate |
|-----------|-----------|-------------|
| **Confirm** | `Booking.idempotencyKey` unique column | Catch unique violation → fetch + return existing booking |
| **Cancel** | `IdempotencyRecord` table | Check record exists → return cached response |
| **Reschedule** | `IdempotencyRecord` table | Check record exists → return cached response (new booking + old status) |

- `Idempotency-Key` header is **required** on confirm/cancel/reschedule (400 if missing)
- Confirm idempotency record is the Booking itself (INSERT catches duplicates)
- Cancel/reschedule idempotency uses `IdempotencyRecord` table (UPDATEs don't have unique constraint mechanism)
