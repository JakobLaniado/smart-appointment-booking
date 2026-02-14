import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { HoldSlotDto } from './dto/hold-slot.dto.js';
import { ConfirmBookingDto } from './dto/confirm-booking.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto.js';
import { ListBookingsDto } from './dto/list-bookings.dto.js';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

const HOLD_TTL_SECONDS = 300; // 5 minutes

const ALLOWED_SORT_FIELDS = new Set([
  'startTime',
  'endTime',
  'createdAt',
  'status',
]);

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async holdSlot(customerId: string, dto: HoldSlotDto) {
    // Validate provider exists
    const provider = await this.prisma.provider.findUnique({
      where: { id: dto.providerId },
    });
    if (!provider) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: `Provider ${dto.providerId} not found`,
      });
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(
      startTime.getTime() + dto.durationMinutes * 60 * 1000,
    );

    // Optimistic check for buffer conflicts (fast-fail before Redis write)
    const conflicting = await this.prisma.booking.findFirst({
      where: this.buildBufferConflictWhere(
        dto.providerId,
        startTime,
        endTime,
        provider.bufferMinutes,
      ),
    });
    if (conflicting) {
      throw new ConflictException({
        code: 'SLOT_UNAVAILABLE',
        message:
          'This time slot conflicts with an existing booking (including buffer time)',
      });
    }

    // Create Redis hold
    const holdId = randomUUID();
    const expiresAt = new Date(Date.now() + HOLD_TTL_SECONDS * 1000);

    await this.redis.setHold(
      holdId,
      {
        providerId: dto.providerId,
        customerId,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        notes: dto.notes,
      },
      HOLD_TTL_SECONDS,
    );

    return { holdId, expiresAt: expiresAt.toISOString() };
  }

  async confirmBooking(
    customerId: string,
    dto: ConfirmBookingDto,
    idempotencyKey: string,
  ) {
    // 1. Check idempotency — return existing booking if already confirmed
    const existingBooking = await this.prisma.booking.findFirst({
      where: { idempotencyKey },
      include: {
        provider: {
          include: { user: { select: { name: true } } },
        },
        customer: { select: { name: true, email: true } },
      },
    });
    if (existingBooking) {
      return this.formatBooking(existingBooking);
    }

    // 2. Get hold from Redis
    const hold = await this.redis.getHold(dto.holdId);
    if (!hold) {
      throw new ConflictException({
        code: 'HOLD_EXPIRED',
        message:
          'Hold has expired. Please create a new hold before confirming.',
      });
    }

    // 2. Verify hold ownership
    if (hold.customerId !== customerId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'This hold belongs to another user',
      });
    }

    const startTime = new Date(hold.startTime);
    const endTime = new Date(hold.endTime);

    // 3. Get provider for buffer
    const provider = await this.prisma.provider.findUniqueOrThrow({
      where: { id: hold.providerId },
    });

    // 4. Insert booking with advisory lock inside a transaction.
    //    Buffer conflict check is INSIDE the transaction AFTER the lock
    //    to prevent TOCTOU race conditions.
    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // Advisory lock on provider to serialize concurrent confirms
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            ('x' || substr(md5(${hold.providerId}), 1, 16))::bit(64)::bigint
          )
        `;

        // Re-check buffer conflicts AFTER acquiring lock
        const conflicting = await tx.booking.findFirst({
          where: this.buildBufferConflictWhere(
            hold.providerId,
            startTime,
            endTime,
            provider.bufferMinutes,
          ),
        });
        if (conflicting) {
          throw new ConflictException({
            code: 'SLOT_UNAVAILABLE',
            message:
              'This time slot conflicts with an existing booking (including buffer time)',
          });
        }

        return tx.booking.create({
          data: {
            providerId: hold.providerId,
            customerId,
            startTime,
            endTime,
            status: 'CONFIRMED',
            notes: hold.notes,
            idempotencyKey,
          },
          include: {
            provider: {
              include: { user: { select: { name: true } } },
            },
            customer: { select: { name: true, email: true } },
          },
        });
      });

      // Delete hold on success
      await this.redis.deleteHold(dto.holdId);

      return this.formatBooking(booking);
    } catch (error) {
      // Re-throw NestJS HTTP exceptions directly
      if (error instanceof ConflictException) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Unique constraint on idempotencyKey — return existing booking
        if (error.code === 'P2002') {
          const existing = await this.prisma.booking.findFirst({
            where: { idempotencyKey },
            include: {
              provider: {
                include: { user: { select: { name: true } } },
              },
              customer: { select: { name: true, email: true } },
            },
          });
          if (existing) {
            return this.formatBooking(existing);
          }
        }
        // Exclusion constraint violation — overlap
        if (
          error.code === 'P2010' ||
          (error.message && error.message.includes('booking_no_overlap'))
        ) {
          throw new ConflictException({
            code: 'SLOT_UNAVAILABLE',
            message: 'This time slot is no longer available',
          });
        }
      }
      // Check for raw exclusion constraint error
      if (
        error instanceof Error &&
        error.message?.includes('booking_no_overlap')
      ) {
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'This time slot is no longer available',
        });
      }
      throw error;
    }
  }

  async listBookings(userId: string, role: string, dto: ListBookingsDto) {
    const where: Prisma.BookingWhereInput = {};

    if (role === 'PROVIDER') {
      const provider = await this.prisma.provider.findUnique({
        where: { userId },
      });
      if (!provider) {
        throw new ForbiddenException({
          code: 'NOT_A_PROVIDER',
          message: 'User does not have a provider profile',
        });
      }
      where.providerId = provider.id;
    } else {
      where.customerId = userId;
    }

    if (dto.status) where.status = dto.status;
    if (dto.dateFrom || dto.dateTo) {
      where.startTime = {};
      if (dto.dateFrom) where.startTime.gte = new Date(dto.dateFrom);
      if (dto.dateTo) where.startTime.lte = new Date(dto.dateTo);
    }

    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const sortField = ALLOWED_SORT_FIELDS.has(dto.sortBy ?? '')
      ? (dto.sortBy as string)
      : 'startTime';

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          provider: {
            include: { user: { select: { name: true } } },
          },
          customer: { select: { name: true, email: true } },
        },
        orderBy: { [sortField]: dto.order ?? 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      bookings: bookings.map((b) => this.formatBooking(b)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getBooking(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: {
          include: { user: { select: { name: true } } },
        },
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found`,
      });
    }

    // Only provider or customer can see the booking
    const isProvider = booking.provider.userId === userId;
    const isCustomer = booking.customer.id === userId;
    if (!isProvider && !isCustomer) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this booking',
      });
    }

    return this.formatBooking(booking);
  }

  async cancelBooking(
    userId: string,
    bookingId: string,
    dto: CancelBookingDto,
    idempotencyKey: string,
  ) {
    // Check idempotency record first
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (existingRecord) {
      return existingRecord.response;
    }

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        provider: {
          include: { user: { select: { name: true } } },
        },
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found`,
      });
    }

    if (booking.status === 'CANCELLED') {
      return this.formatBooking(booking);
    }

    // Both provider and customer can cancel
    const isProvider = booking.provider.userId === userId;
    const isCustomer = booking.customer.id === userId;
    if (!isProvider && !isCustomer) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this booking',
      });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancelReason: dto.reason,
        },
        include: {
          provider: {
            include: { user: { select: { name: true } } },
          },
          customer: { select: { id: true, name: true, email: true } },
        },
      });

      const formatted = this.formatBooking(cancelled);

      await tx.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          bookingId,
          operation: 'cancel',
          response: formatted as unknown as Prisma.InputJsonValue,
        },
      });

      return formatted;
    });

    return result;
  }

  async rescheduleBooking(
    userId: string,
    bookingId: string,
    dto: RescheduleBookingDto,
    idempotencyKey: string,
  ) {
    // Check idempotency record first
    const existingRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (existingRecord) {
      return existingRecord.response;
    }

    const oldBooking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: { provider: true },
    });

    if (!oldBooking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking ${bookingId} not found`,
      });
    }

    if (oldBooking.status === 'CANCELLED') {
      throw new BadRequestException({
        code: 'BOOKING_CANCELLED',
        message: 'Cannot reschedule a cancelled booking',
      });
    }

    // Only customer can reschedule
    if (oldBooking.customerId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Only the customer can reschedule a booking',
      });
    }

    const newStartTime = new Date(dto.newStartTime);
    const newEndTime = new Date(
      newStartTime.getTime() + dto.durationMinutes * 60 * 1000,
    );

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Advisory lock
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            ('x' || substr(md5(${oldBooking.providerId}), 1, 16))::bit(64)::bigint
          )
        `;

        // Check buffer conflicts INSIDE the lock (prevents TOCTOU races)
        const conflicting = await tx.booking.findFirst({
          where: this.buildBufferConflictWhere(
            oldBooking.providerId,
            newStartTime,
            newEndTime,
            oldBooking.provider.bufferMinutes,
            bookingId,
          ),
        });
        if (conflicting) {
          throw new ConflictException({
            code: 'SLOT_UNAVAILABLE',
            message:
              'The new time slot conflicts with an existing booking (including buffer time)',
          });
        }

        // Insert new booking first
        const newBooking = await tx.booking.create({
          data: {
            providerId: oldBooking.providerId,
            customerId: userId,
            startTime: newStartTime,
            endTime: newEndTime,
            status: 'CONFIRMED',
            notes: oldBooking.notes,
            idempotencyKey,
          },
          include: {
            provider: {
              include: { user: { select: { name: true } } },
            },
            customer: { select: { id: true, name: true, email: true } },
          },
        });

        // Then cancel old booking
        await tx.booking.update({
          where: { id: bookingId },
          data: {
            status: 'CANCELLED',
            cancelReason: 'Rescheduled',
          },
        });

        const formatted = {
          newBooking: this.formatBooking(newBooking),
          cancelledBookingId: bookingId,
        };

        await tx.idempotencyRecord.create({
          data: {
            key: idempotencyKey,
            bookingId: newBooking.id,
            operation: 'reschedule',
            response: formatted as unknown as Prisma.InputJsonValue,
          },
        });

        return formatted;
      });

      return result;
    } catch (error) {
      // Re-throw NestJS HTTP exceptions directly
      if (error instanceof ConflictException) throw error;

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const existing = await this.prisma.idempotencyRecord.findUnique({
            where: { key: idempotencyKey },
          });
          if (existing) return existing.response;
        }
      }
      if (
        error instanceof Error &&
        error.message?.includes('booking_no_overlap')
      ) {
        throw new ConflictException({
          code: 'SLOT_UNAVAILABLE',
          message: 'The new time slot is no longer available',
        });
      }
      throw error;
    }
  }

  /** Build a Prisma where clause for buffer conflict detection. */
  private buildBufferConflictWhere(
    providerId: string,
    startTime: Date,
    endTime: Date,
    bufferMinutes: number,
    excludeBookingId?: string,
  ): Prisma.BookingWhereInput {
    const bufferedStart = new Date(
      startTime.getTime() - bufferMinutes * 60 * 1000,
    );
    const bufferedEnd = new Date(endTime.getTime() + bufferMinutes * 60 * 1000);

    return {
      providerId,
      status: 'CONFIRMED',
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      startTime: { lt: bufferedEnd },
      endTime: { gt: bufferedStart },
    };
  }

  private formatBooking(booking: {
    id: string;
    providerId: string;
    customerId: string;
    startTime: Date;
    endTime: Date;
    status: string;
    notes: string | null;
    cancelReason: string | null;
    createdAt: Date;
    provider: { id: string; user: { name: string } };
    customer: { name: string; email: string };
  }) {
    return {
      id: booking.id,
      providerId: booking.providerId,
      providerName: booking.provider.user.name,
      customerId: booking.customerId,
      customerName: booking.customer.name,
      customerEmail: booking.customer.email,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      status: booking.status,
      notes: booking.notes,
      cancelReason: booking.cancelReason,
      createdAt: booking.createdAt.toISOString(),
    };
  }
}
