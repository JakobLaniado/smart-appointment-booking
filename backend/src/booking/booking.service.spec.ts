import { Test, TestingModule } from "@nestjs/testing";
import { BookingService } from "./booking.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import { ConflictException, NotFoundException, ForbiddenException } from "@nestjs/common";

describe("BookingService", () => {
  let service: BookingService;
  let prisma: { [key: string]: any };
  let redis: { [key: string]: any };

  beforeEach(async () => {
    prisma = {
      provider: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      booking: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      idempotencyRecord: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn(prisma)),
      $executeRaw: jest.fn(),
    };

    redis = {
      setHold: jest.fn(),
      getHold: jest.fn(),
      deleteHold: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);
  });

  describe("holdSlot", () => {
    it("should create a hold when provider exists and slot is free", async () => {
      prisma.provider.findUnique.mockResolvedValue({
        id: "prov-1",
        bufferMinutes: 15,
      });
      prisma.booking.findFirst.mockResolvedValue(null);
      redis.setHold.mockResolvedValue(undefined);

      const result = await service.holdSlot("cust-1", {
        providerId: "prov-1",
        startTime: "2025-03-03T10:00:00Z",
        durationMinutes: 30,
      });

      expect(result.holdId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(redis.setHold).toHaveBeenCalledTimes(1);
    });

    it("should throw NotFoundException when provider not found", async () => {
      prisma.provider.findUnique.mockResolvedValue(null);

      await expect(
        service.holdSlot("cust-1", {
          providerId: "nonexistent",
          startTime: "2025-03-03T10:00:00Z",
          durationMinutes: 30,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when slot has buffer conflict", async () => {
      prisma.provider.findUnique.mockResolvedValue({
        id: "prov-1",
        bufferMinutes: 15,
      });
      prisma.booking.findFirst.mockResolvedValue({
        id: "existing-booking",
      });

      await expect(
        service.holdSlot("cust-1", {
          providerId: "prov-1",
          startTime: "2025-03-03T10:00:00Z",
          durationMinutes: 30,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("confirmBooking", () => {
    it("should throw ConflictException when hold is expired", async () => {
      redis.getHold.mockResolvedValue(null);

      await expect(
        service.confirmBooking("cust-1", { holdId: "expired-hold" }, "idem-1"),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw ForbiddenException when hold belongs to another user", async () => {
      redis.getHold.mockResolvedValue({
        providerId: "prov-1",
        customerId: "other-user",
        startTime: "2025-03-03T10:00:00Z",
        endTime: "2025-03-03T10:30:00Z",
      });

      await expect(
        service.confirmBooking(
          "cust-1",
          { holdId: "hold-1" },
          "idem-1",
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should create booking when hold is valid", async () => {
      const mockBooking = {
        id: "booking-1",
        providerId: "prov-1",
        customerId: "cust-1",
        startTime: new Date("2025-03-03T10:00:00Z"),
        endTime: new Date("2025-03-03T10:30:00Z"),
        status: "CONFIRMED",
        notes: null,
        cancelReason: null,
        createdAt: new Date(),
        provider: { id: "prov-1", user: { name: "Dr. Smith" } },
        customer: { name: "John", email: "john@test.com" },
      };

      redis.getHold.mockResolvedValue({
        providerId: "prov-1",
        customerId: "cust-1",
        startTime: "2025-03-03T10:00:00Z",
        endTime: "2025-03-03T10:30:00Z",
        notes: null,
      });
      prisma.provider.findUniqueOrThrow.mockResolvedValue({
        id: "prov-1",
        bufferMinutes: 15,
      });
      prisma.booking.findFirst.mockResolvedValue(null); // no conflicts
      prisma.booking.create.mockResolvedValue(mockBooking);
      redis.deleteHold.mockResolvedValue(undefined);

      const result = await service.confirmBooking(
        "cust-1",
        { holdId: "hold-1" },
        "idem-1",
      );

      expect(result.id).toBe("booking-1");
      expect(result.status).toBe("CONFIRMED");
      expect(redis.deleteHold).toHaveBeenCalledWith("hold-1");
    });
  });

  describe("cancelBooking", () => {
    it("should throw NotFoundException when booking not found", async () => {
      prisma.idempotencyRecord.findUnique.mockResolvedValue(null);
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.cancelBooking("user-1", "nonexistent", {}, "idem-1"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user has no access", async () => {
      prisma.idempotencyRecord.findUnique.mockResolvedValue(null);
      prisma.booking.findUnique.mockResolvedValue({
        id: "booking-1",
        providerId: "prov-1",
        customerId: "cust-2",
        status: "CONFIRMED",
        provider: { userId: "provider-user-1", user: { name: "Dr. Smith" } },
        customer: { id: "cust-2", name: "Jane", email: "jane@test.com" },
      });

      await expect(
        service.cancelBooking("unrelated-user", "booking-1", {}, "idem-1"),
      ).rejects.toThrow(ForbiddenException);
    });

    it("should return existing booking if already cancelled", async () => {
      const cancelled = {
        id: "booking-1",
        providerId: "prov-1",
        customerId: "cust-1",
        startTime: new Date(),
        endTime: new Date(),
        status: "CANCELLED",
        notes: null,
        cancelReason: "Changed plans",
        createdAt: new Date(),
        provider: { id: "prov-1", user: { name: "Dr. Smith" } },
        customer: { name: "John", email: "john@test.com" },
      };
      prisma.idempotencyRecord.findUnique.mockResolvedValue(null);
      prisma.booking.findUnique.mockResolvedValue(cancelled);

      const result = await service.cancelBooking(
        "cust-1",
        "booking-1",
        {},
        "idem-1",
      );
      expect(result.status).toBe("CANCELLED");
    });

    it("should return cached response on duplicate idempotency key", async () => {
      const cached = { id: "booking-1", status: "CANCELLED" };
      prisma.idempotencyRecord.findUnique.mockResolvedValue({
        key: "idem-1",
        response: cached,
      });

      const result = await service.cancelBooking(
        "cust-1",
        "booking-1",
        {},
        "idem-1",
      );
      expect(result).toEqual(cached);
    });
  });

  describe("listBookings", () => {
    it("should return paginated bookings for customer", async () => {
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      const result = await service.listBookings("cust-1", "CUSTOMER", {});
      expect(result.bookings).toEqual([]);
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
    });

    it("should resolve provider ID for provider role", async () => {
      prisma.provider.findUnique.mockResolvedValue({ id: "prov-1" });
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.count.mockResolvedValue(0);

      await service.listBookings("user-1", "PROVIDER", {});
      expect(prisma.provider.findUnique).toHaveBeenCalledWith({
        where: { userId: "user-1" },
      });
    });
  });

  describe("getBooking", () => {
    it("should throw NotFoundException when booking not found", async () => {
      prisma.booking.findUnique.mockResolvedValue(null);

      await expect(
        service.getBooking("user-1", "nonexistent"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ForbiddenException when user has no access", async () => {
      prisma.booking.findUnique.mockResolvedValue({
        id: "booking-1",
        provider: { userId: "provider-user" },
        customer: { id: "cust-1" },
      });

      await expect(
        service.getBooking("unrelated-user", "booking-1"),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
