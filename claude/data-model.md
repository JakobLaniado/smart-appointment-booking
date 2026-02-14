# Data Model

## Enums

```
UserRole:     CUSTOMER | PROVIDER
OverrideType: BLOCK | OPEN
BookingStatus: CONFIRMED | CANCELLED
```

## Models

### User
- `id` (cuid), `email` (unique), `password` (bcrypt), `name`, `role` (UserRole)
- Relations: `provider?`, `bookingsAsCustomer[]`

### Provider
- `id` (cuid), `userId` (unique FK → User), `profession`, `timezone` (IANA), `bufferMinutes` (default 15)
- Relations: `user`, `recurringAvailability[]`, `availabilityOverrides[]`, `bookings[]`

### RecurringAvailability
- `id`, `providerId` FK, `dayOfWeek` (0=Sun..6=Sat), `startTime` ("HH:mm"), `endTime` ("HH:mm"), `isActive`
- Index: `[providerId, dayOfWeek]`

### AvailabilityOverride
- `id`, `providerId` FK, `startTime` (DateTime/UTC), `endTime` (DateTime/UTC), `type` (BLOCK|OPEN), `reason?`
- Index: `[providerId, startTime, endTime]`

### Booking
- `id`, `providerId` FK, `customerId` FK, `startTime` (DateTime/UTC), `endTime` (DateTime/UTC)
- `status` (CONFIRMED|CANCELLED), `notes?`, `cancelReason?`, `idempotencyKey?` (unique)
- Indexes: `[providerId, startTime, endTime]`, `[customerId]`, `[status]`

### IdempotencyRecord
- `key` (PK — the header value), `bookingId`, `operation` ("confirm"|"cancel"|"reschedule"), `response` (Json)
- Index: `[bookingId]`
- Used for cancel/reschedule idempotency (UPDATEs). Confirm idempotency uses `Booking.idempotencyKey` directly.

## Exclusion Constraint

```sql
ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "providerId" WITH =,
    tstzrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (status = 'CONFIRMED');
```

- Requires `btree_gist` extension
- `[)` = start-inclusive, end-exclusive (adjacent bookings don't conflict)
- Only applies to CONFIRMED bookings
- Buffer is NOT enforced here — app-level only
