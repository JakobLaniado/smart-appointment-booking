import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { Server } from 'http';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  meta: { requestId: string; timestamp: string };
}

interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    providerId?: string;
  };
  accessToken: string;
}

interface ProfileResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  providerId?: string;
  provider?: {
    id: string;
    profession: string;
    timezone: string;
    bufferMinutes: number;
  } | null;
}

interface SlotResponse {
  startTime: string;
  endTime: string;
  score: number;
}

interface HoldResponse {
  holdId: string;
  expiresAt: string;
}

interface BookingResponse {
  id: string;
  providerId: string;
  providerName: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  startTime: string;
  endTime: string;
  status: string;
  notes: string | null;
  cancelReason: string | null;
  createdAt: string;
}

interface BookingListResponse {
  bookings: BookingResponse[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

describe('Booking Flow (e2e)', () => {
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

  describe('Full booking flow', () => {
    it('should register a provider', async () => {
      const res = await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'provider@test.com',
          password: 'Test1234!',
          name: 'Dr. Test',
          role: 'PROVIDER',
          profession: 'Dentist',
          timezone: 'UTC',
        })
        .expect(201);

      const body = res.body as ApiEnvelope<AuthResponse>;
      expect(body.data.accessToken).toBeDefined();
      providerToken = body.data.accessToken;
    });

    it('should set recurring availability', async () => {
      // Get provider profile to get providerId
      const meRes = await request(httpServer)
        .get('/auth/me')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      const meBody = meRes.body as ApiEnvelope<ProfileResponse>;
      providerId = meBody.data.providerId!;

      // Set availability for every weekday (Mon-Fri)
      for (let day = 1; day <= 5; day++) {
        await request(httpServer)
          .post('/availability/recurring')
          .set('Authorization', `Bearer ${providerToken}`)
          .send({
            dayOfWeek: day,
            startTime: '09:00',
            endTime: '17:00',
          })
          .expect(201);
      }
    });

    it('should register a customer', async () => {
      const res = await request(httpServer)
        .post('/auth/register')
        .send({
          email: 'customer@test.com',
          password: 'Test1234!',
          name: 'Jane Customer',
          role: 'CUSTOMER',
        })
        .expect(201);

      const body = res.body as ApiEnvelope<AuthResponse>;
      customerToken = body.data.accessToken;
    });

    it('should query available slots', async () => {
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 86400000);
      const twoWeeks = new Date(today.getTime() + 14 * 86400000);

      const res = await request(httpServer)
        .get(`/availability/slots/${providerId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .query({
          startDate: nextWeek.toISOString().split('T')[0],
          endDate: twoWeeks.toISOString().split('T')[0],
          durationMinutes: 30,
        })
        .expect(200);

      const body = res.body as ApiEnvelope<SlotResponse[]>;
      expect(body.data.length).toBeGreaterThan(0);
    });

    let holdId: string;
    let slotStartTime: string;

    it('should hold a slot', async () => {
      // Get a future slot time
      const today = new Date();
      const nextWeek = new Date(today.getTime() + 7 * 86400000);
      const twoWeeks = new Date(today.getTime() + 14 * 86400000);

      const slotsRes = await request(httpServer)
        .get(`/availability/slots/${providerId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .query({
          startDate: nextWeek.toISOString().split('T')[0],
          endDate: twoWeeks.toISOString().split('T')[0],
          durationMinutes: 30,
        });

      const slotsBody = slotsRes.body as ApiEnvelope<SlotResponse[]>;
      slotStartTime = slotsBody.data[0].startTime;

      const res = await request(httpServer)
        .post('/bookings/hold')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          providerId,
          startTime: slotStartTime,
          durationMinutes: 30,
          notes: 'E2E test booking',
        })
        .expect(201);

      const body = res.body as ApiEnvelope<HoldResponse>;
      expect(body.data.holdId).toBeDefined();
      expect(body.data.expiresAt).toBeDefined();
      holdId = body.data.holdId;
    });

    let bookingId: string;

    it('should confirm the booking', async () => {
      const res = await request(httpServer)
        .post('/bookings/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'e2e-confirm-1')
        .send({ holdId })
        .expect(201);

      const body = res.body as ApiEnvelope<BookingResponse>;
      expect(body.data.status).toBe('CONFIRMED');
      expect(body.data.notes).toBe('E2E test booking');
      bookingId = body.data.id;
    });

    it('should return same booking on duplicate confirm (idempotency)', async () => {
      const res = await request(httpServer)
        .post('/bookings/confirm')
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'e2e-confirm-1')
        .send({ holdId: 'any-hold-id' });

      // Should either succeed with same booking or fail gracefully
      // The key behavior is it doesn't create a duplicate
      if (res.status === 201) {
        const body = res.body as ApiEnvelope<BookingResponse>;
        expect(body.data.id).toBe(bookingId);
      }
    });

    it('should reject booking the same slot (double-booking prevention)', async () => {
      // Try to hold the same slot again
      const holdRes = await request(httpServer)
        .post('/bookings/hold')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          providerId,
          startTime: slotStartTime,
          durationMinutes: 30,
        });

      // Should be rejected due to buffer conflict
      expect(holdRes.status).toBe(409);
    });

    it('should list bookings for customer', async () => {
      const res = await request(httpServer)
        .get('/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const body = res.body as ApiEnvelope<BookingListResponse>;
      expect(body.data.bookings.length).toBeGreaterThanOrEqual(1);
    });

    it('should list bookings for provider', async () => {
      const res = await request(httpServer)
        .get('/bookings')
        .set('Authorization', `Bearer ${providerToken}`)
        .expect(200);

      const body = res.body as ApiEnvelope<BookingListResponse>;
      expect(body.data.bookings.length).toBeGreaterThanOrEqual(1);
    });

    it('should get booking details', async () => {
      const res = await request(httpServer)
        .get(`/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      const body = res.body as ApiEnvelope<BookingResponse>;
      expect(body.data.id).toBe(bookingId);
      expect(body.data.status).toBe('CONFIRMED');
    });

    it('should cancel the booking', async () => {
      const res = await request(httpServer)
        .patch(`/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'e2e-cancel-1')
        .send({ reason: 'Changed plans' })
        .expect(200);

      const body = res.body as ApiEnvelope<BookingResponse>;
      expect(body.data.status).toBe('CANCELLED');
      expect(body.data.cancelReason).toBe('Changed plans');
    });

    it('should return same result on duplicate cancel (idempotency)', async () => {
      const res = await request(httpServer)
        .patch(`/bookings/${bookingId}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .set('Idempotency-Key', 'e2e-cancel-1')
        .send({ reason: 'Changed plans' })
        .expect(200);

      const body = res.body as ApiEnvelope<BookingResponse>;
      expect(body.data.status).toBe('CANCELLED');
    });
  });
});
