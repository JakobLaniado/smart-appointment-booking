-- Enable btree_gist extension (required for GiST exclusion constraint on text columns)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Add GiST exclusion constraint to prevent overlapping confirmed bookings
-- for the same provider. Uses '[)' bounds (start-inclusive, end-exclusive)
-- so adjacent bookings ending/starting at the same instant don't conflict.
-- Note: Prisma DateTime maps to TIMESTAMP(3) so we use tsrange, not tstzrange.

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (
    "providerId" WITH =,
    tsrange("startTime", "endTime", '[)') WITH &&
  )
  WHERE (status = 'CONFIRMED');