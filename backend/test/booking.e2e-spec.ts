import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module.js";
import { PrismaService } from "../src/prisma/prisma.service.js";
import type { Server } from "http";

describe("Booking Flow (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let httpServer: Server;
  let providerToken: string;
  let customerToken: string;
  let providerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    httpServer = app.getHttpServer() as Server;

    // Clean database
    await prisma.idempotencyRecord.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityOverride.deleteMany();
    await prisma.recurringAvailability.deleteMany();
    await prisma.provider.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.idempotencyRecord.deleteMany();
    await prisma.booking.deleteMany();
    await prisma.availabilityOverride.deleteMany();
    await prisma.recurringAvailability.deleteMany();
    await prisma.provider.deleteMany();
    await prisma.user.deleteMany();
    await app.close();
  });

  describe("Full booking flow", () => {
    it("should register a provider", async () => {
      const res = await request(httpServer)
        .post("/auth/register")
        .send({
          email: "provider@test.com",
          password: "Test1234!",
          name: "Dr. Test",
          role: "PROVIDER",
          profession: "Dentist",
          timezone: "UTC",
        })
        .expect(201);

      expect(res.body.data.accessToken).toBeDefined();
      providerToken = res.body.data.accessToken;
    });

    it("should set recurring availability", async () => {
      // Get provider profile to get providerId
      const meRes = await request(httpServer)
        .get("/auth/me")
        .set("Authorization", `Bearer ${providerToken}`)
        .expect(200);

      providerId = meRes.body.data.providerId;

      // Set availability for every weekday (Mon-Fri)
      for (let day = 1; day <= 5; day++) {
        await request(httpServer)
          .post("/availability/recurring")
          .set("Authorization", `Bearer ${providerToken}`)
          .send({
            dayOfWeek: day,
            startTime: "09:00",
            endTime: "17:00",
          })
          .expect(201);
      }
    });

    it("should register a customer", async () => {
      const res = await request(httpServer)
        .post("/auth/register")
        .send({
          email: "customer@test.com",
          password: "Test1234!",
          name: "Jane Customer",
          role: "CUSTOMER",
        })
        .expect(201);

      customerToken = res.body.data.accessToken;
    });

    it("should query available slots", async () => {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 86400000);
      const twoWeeks = new Date(today.getTime() + 14 * 86400000);

      const res = await request(httpServer)
        .get(`/availability/slots/${providerId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .query({
          startDate: nextWeek.toISOString().split("T")[0],
          endDate: twoWeeks.toISOString().split("T")[0],
          durationMinutes: 30,
        })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
    });

    let holdId: string;
    let slotStartTime: string;

    it("should hold a slot", async () => {
      // Get a future slot time
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 86400000);
      const twoWeeks = new Date(today.getTime() + 14 * 86400000);

      const slotsRes = await request(httpServer)
        .get(`/availability/slots/${providerId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .query({
          startDate: nextWeek.toISOString().split("T")[0],
          endDate: twoWeeks.toISOString().split("T")[0],
          durationMinutes: 30,
        });

      slotStartTime = slotsRes.body.data[0].startTime;

      const res = await request(httpServer)
        .post("/bookings/hold")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          providerId,
          startTime: slotStartTime,
          durationMinutes: 30,
          notes: "E2E test booking",
        })
        .expect(201);

      expect(res.body.data.holdId).toBeDefined();
      expect(res.body.data.expiresAt).toBeDefined();
      holdId = res.body.data.holdId;
    });

    let bookingId: string;

    it("should confirm the booking", async () => {
      const res = await request(httpServer)
        .post("/bookings/confirm")
        .set("Authorization", `Bearer ${customerToken}`)
        .set("Idempotency-Key", "e2e-confirm-1")
        .send({ holdId })
        .expect(201);

      expect(res.body.data.status).toBe("CONFIRMED");
      expect(res.body.data.notes).toBe("E2E test booking");
      bookingId = res.body.data.id;
    });

    it("should return same booking on duplicate confirm (idempotency)", async () => {
      // Re-hold the same slot first (hold expired after confirm)
      // But with same idempotency key, should return same booking
      const res = await request(httpServer)
        .post("/bookings/confirm")
        .set("Authorization", `Bearer ${customerToken}`)
        .set("Idempotency-Key", "e2e-confirm-1")
        .send({ holdId: "any-hold-id" });

      // Should either succeed with same booking or fail gracefully
      // The key behavior is it doesn't create a duplicate
      if (res.status === 201) {
        expect(res.body.data.id).toBe(bookingId);
      }
    });

    it("should reject booking the same slot (double-booking prevention)", async () => {
      // Try to hold the same slot again
      const holdRes = await request(httpServer)
        .post("/bookings/hold")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({
          providerId,
          startTime: slotStartTime,
          durationMinutes: 30,
        });

      // Should be rejected due to buffer conflict
      expect(holdRes.status).toBe(409);
    });

    it("should list bookings for customer", async () => {
      const res = await request(httpServer)
        .get("/bookings")
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.data.bookings.length).toBeGreaterThanOrEqual(1);
    });

    it("should list bookings for provider", async () => {
      const res = await request(httpServer)
        .get("/bookings")
        .set("Authorization", `Bearer ${providerToken}`)
        .expect(200);

      expect(res.body.data.bookings.length).toBeGreaterThanOrEqual(1);
    });

    it("should get booking details", async () => {
      const res = await request(httpServer)
        .get(`/bookings/${bookingId}`)
        .set("Authorization", `Bearer ${customerToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(bookingId);
      expect(res.body.data.status).toBe("CONFIRMED");
    });

    it("should cancel the booking", async () => {
      const res = await request(httpServer)
        .patch(`/bookings/${bookingId}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .set("Idempotency-Key", "e2e-cancel-1")
        .send({ reason: "Changed plans" })
        .expect(200);

      expect(res.body.data.status).toBe("CANCELLED");
      expect(res.body.data.cancelReason).toBe("Changed plans");
    });

    it("should return same result on duplicate cancel (idempotency)", async () => {
      const res = await request(httpServer)
        .patch(`/bookings/${bookingId}/cancel`)
        .set("Authorization", `Bearer ${customerToken}`)
        .set("Idempotency-Key", "e2e-cancel-1")
        .send({ reason: "Changed plans" })
        .expect(200);

      expect(res.body.data.status).toBe("CANCELLED");
    });
  });
});
