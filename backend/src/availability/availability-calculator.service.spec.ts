import { AvailabilityCalculatorService } from "./availability-calculator.service.js";
import type {
  RecurringAvailability,
  AvailabilityOverride,
  Booking,
} from "@prisma/client";

// Helper: get the next Monday (or further future Monday) as YYYY-MM-DD
function getNextMonday(): string {
  const now = new Date();
  // Go at least 2 days into the future to avoid "1hr minimum" cutoff
  const future = new Date(now.getTime() + 3 * 86400000);
  const day = future.getUTCDay(); // 0=Sun..6=Sat
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
  const monday = new Date(
    future.getTime() + daysUntilMonday * 86400000,
  );
  return monday.toISOString().split("T")[0]!;
}

function getNextTuesday(): string {
  const mon = getNextMonday();
  const d = new Date(mon);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0]!;
}

describe("AvailabilityCalculatorService", () => {
  let service: AvailabilityCalculatorService;
  let futureMonday: string;
  let futureTuesday: string;

  beforeEach(() => {
    service = new AvailabilityCalculatorService();
    futureMonday = getNextMonday();
    futureTuesday = getNextTuesday();
  });

  const makeRecurring = (
    overrides: Partial<RecurringAvailability> = {},
  ): RecurringAvailability => ({
    id: "rec-1",
    providerId: "prov-1",
    dayOfWeek: 1, // Monday
    startTime: "09:00",
    endTime: "17:00",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeBooking = (
    startISO: string,
    endISO: string,
    overrides: Partial<Booking> = {},
  ): Booking => ({
    id: "book-1",
    providerId: "prov-1",
    customerId: "cust-1",
    startTime: new Date(startISO),
    endTime: new Date(endISO),
    status: "CONFIRMED",
    notes: null,
    cancelReason: null,
    idempotencyKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const makeOverride = (
    overrides: Partial<AvailabilityOverride> = {},
  ): AvailabilityOverride => ({
    id: "ovr-1",
    providerId: "prov-1",
    startTime: new Date(`${getNextMonday()}T12:00:00Z`),
    endTime: new Date(`${getNextMonday()}T13:00:00Z`),
    type: "BLOCK",
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe("calculateSlots", () => {
    it("should return empty array when no recurring availability", () => {
      const slots = service.calculateSlots(
        [],
        [],
        [],
        "UTC",
        15,
        futureMonday,
        futureMonday,
        30,
      );
      expect(slots).toEqual([]);
    });

    it("should generate slots from recurring availability", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const slots = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        60,
        {},
        100,
      );
      expect(slots.length).toBeGreaterThan(0);
      for (const slot of slots) {
        expect(slot.startTime).toBeDefined();
        expect(slot.endTime).toBeDefined();
        expect(slot.score).toBeGreaterThanOrEqual(0);
      }
    });

    it("should subtract bookings with buffer", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const bookingStart = `${futureMonday}T14:00:00Z`;
      const bookingEnd = `${futureMonday}T15:00:00Z`;
      const booking = makeBooking(bookingStart, bookingEnd);

      const slotsWithBooking = service.calculateSlots(
        recurring,
        [],
        [booking],
        "UTC",
        15,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      const slotsWithout = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        15,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      expect(slotsWithBooking.length).toBeLessThan(slotsWithout.length);
    });

    it("should apply BLOCK overrides", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const blockOverride = makeOverride({
        type: "BLOCK",
        startTime: new Date(`${futureMonday}T12:00:00Z`),
        endTime: new Date(`${futureMonday}T14:00:00Z`),
      });
      const slotsWithBlock = service.calculateSlots(
        recurring,
        [blockOverride],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      const slotsWithout = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      expect(slotsWithBlock.length).toBeLessThan(slotsWithout.length);
    });

    it("should apply OPEN overrides to add extra windows", () => {
      const openOverride = makeOverride({
        type: "OPEN",
        startTime: new Date(`${futureMonday}T18:00:00Z`),
        endTime: new Date(`${futureMonday}T20:00:00Z`),
      });
      const slots = service.calculateSlots(
        [],
        [openOverride],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      expect(slots.length).toBeGreaterThan(0);
    });

    it("should skip cancelled bookings", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const bookingStart = `${futureMonday}T14:00:00Z`;
      const bookingEnd = `${futureMonday}T15:00:00Z`;
      const cancelledBooking = makeBooking(bookingStart, bookingEnd, {
        status: "CANCELLED",
      });

      const slotsWithCancelled = service.calculateSlots(
        recurring,
        [],
        [cancelledBooking],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      const slotsWithout = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        100,
      );
      expect(slotsWithCancelled.length).toEqual(slotsWithout.length);
    });

    it("should skip inactive recurring rules", () => {
      const inactive = makeRecurring({ isActive: false });
      const slots = service.calculateSlots(
        [inactive],
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
      );
      expect(slots).toEqual([]);
    });

    it("should respect maxResults", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const slots = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        {},
        3,
      );
      expect(slots.length).toBeLessThanOrEqual(3);
    });
  });

  describe("scoring", () => {
    it("should score morning preference higher for morning slots", () => {
      const recurring = [makeRecurring({ dayOfWeek: 1 })];
      const slots = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureMonday,
        30,
        { timeOfDay: "morning" },
        100,
      );
      if (slots.length > 0) {
        const topSlot = slots[0]!;
        const hour = new Date(topSlot.startTime).getUTCHours();
        expect(hour).toBeGreaterThanOrEqual(9);
        expect(hour).toBeLessThan(12);
      }
    });

    it("should score preferred day higher", () => {
      const recurring = [
        makeRecurring({ dayOfWeek: 1 }), // Monday
        makeRecurring({ id: "rec-2", dayOfWeek: 2 }), // Tuesday
      ];
      const slots = service.calculateSlots(
        recurring,
        [],
        [],
        "UTC",
        0,
        futureMonday,
        futureTuesday,
        30,
        { preferredDays: [1] }, // Prefer Monday
        100,
      );
      if (slots.length > 0) {
        const topSlot = slots[0]!;
        const day = new Date(topSlot.startTime).getUTCDay();
        expect(day).toBe(1); // Monday = 1 in JS Date
      }
    });
  });
});
