import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AvailabilityService } from '../../availability/availability.service.js';
import { BookingService } from '../../booking/booking.service.js';
import { ProviderService } from '../../provider/provider.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { customerToolNames, providerToolNames } from './tool-definitions.js';
import {
  toolSchemas,
  type FindAvailableSlotsInput,
  type GetProviderAvailabilityInput,
  type HoldSlotInput,
  type ConfirmBookingInput,
  type GetMyBookingsInput,
  type CancelBookingInput,
  type RescheduleBookingInput,
  type GetMyAvailabilityInput,
  type ScheduleChangeInput,
  type BlockTimeRangeInput,
  type AddAvailabilityInput,
} from './tool-schemas.js';

export interface ToolContext {
  userId: string;
  role: 'CUSTOMER' | 'PROVIDER';
  providerId?: string; // set for providers (their own provider ID)
}

@Injectable()
export class ToolExecutor {
  private readonly logger = new Logger(ToolExecutor.name);

  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly bookingService: BookingService,
    private readonly providerService: ProviderService,
    private readonly prisma: PrismaService,
  ) {}

  async execute(
    toolName: string,
    rawInput: unknown,
    context: ToolContext,
  ): Promise<{ success: boolean; data?: unknown; error?: string }> {
    const start = Date.now();

    try {
      // 1. Role check
      if (context.role === 'CUSTOMER' && !customerToolNames.has(toolName)) {
        return {
          success: false,
          error: `Tool "${toolName}" is not available for customers`,
        };
      }
      if (context.role === 'PROVIDER' && !providerToolNames.has(toolName)) {
        return {
          success: false,
          error: `Tool "${toolName}" is not available for providers`,
        };
      }

      // 2. Zod validation
      const schema = toolSchemas[toolName];
      if (!schema) {
        return { success: false, error: `Unknown tool: ${toolName}` };
      }

      const parsed = schema.safeParse(rawInput);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
        };
      }

      // 3. Execute
      const result = await this.dispatch(toolName, parsed.data, context);

      this.logger.log({
        msg: 'Tool executed',
        toolName,
        userId: context.userId,
        durationMs: Date.now() - start,
      });

      return { success: true, data: result };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn({
        msg: 'Tool execution failed',
        toolName,
        userId: context.userId,
        error: message,
        durationMs: Date.now() - start,
      });
      return { success: false, error: message };
    }
  }

  private async dispatch(
    toolName: string,
    input: unknown,
    ctx: ToolContext,
  ): Promise<unknown> {
    switch (toolName) {
      // ─── Customer + Shared ──────────────────────────────
      case 'list_providers':
        return this.providerService.findAll();

      case 'find_available_slots': {
        const i = input as FindAvailableSlotsInput;
        return this.availabilityService.querySlots(i.providerId, {
          startDate: i.startDate,
          endDate: i.endDate,
          durationMinutes: i.durationMinutes,
          timeOfDay: i.timeOfDay,
          preferredDays: i.preferredDays,
          maxResults: i.maxResults ?? 3,
        });
      }

      case 'get_provider_availability': {
        const i = input as GetProviderAvailabilityInput;
        return this.providerService.findById(i.providerId);
      }

      case 'hold_slot': {
        const i = input as HoldSlotInput;
        return this.bookingService.holdSlot(ctx.userId, {
          providerId: i.providerId,
          startTime: i.startTime,
          durationMinutes: i.durationMinutes,
          notes: i.notes,
        });
      }

      case 'confirm_booking': {
        const i = input as ConfirmBookingInput;
        return this.bookingService.confirmBooking(
          ctx.userId,
          { holdId: i.holdId },
          randomUUID(),
        );
      }

      case 'get_my_bookings': {
        const i = input as GetMyBookingsInput;
        return this.bookingService.listBookings(ctx.userId, ctx.role, {
          status: i.status,
          dateFrom: i.dateFrom,
          dateTo: i.dateTo,
          page: i.page,
          limit: i.limit,
        });
      }

      case 'cancel_booking': {
        const i = input as CancelBookingInput;
        return this.bookingService.cancelBooking(
          ctx.userId,
          i.bookingId,
          { reason: i.reason },
          randomUUID(),
        );
      }

      case 'reschedule_booking': {
        const i = input as RescheduleBookingInput;
        return this.bookingService.rescheduleBooking(
          ctx.userId,
          i.bookingId,
          {
            newStartTime: i.newStartTime,
            durationMinutes: i.durationMinutes,
          },
          randomUUID(),
        );
      }

      // ─── Provider ───────────────────────────────────────
      case 'get_my_availability': {
        const i = input as GetMyAvailabilityInput;
        return this.getProviderSchedule(ctx, i);
      }

      case 'preview_schedule_change': {
        const i = input as ScheduleChangeInput;
        return this.previewChange(ctx, i);
      }

      case 'apply_schedule_change': {
        const i = input as ScheduleChangeInput;
        return this.applyChange(ctx, i);
      }

      case 'block_time_range': {
        const i = input as BlockTimeRangeInput;
        return this.availabilityService.createOverride(ctx.userId, {
          startTime: i.startTime,
          endTime: i.endTime,
          type: 'BLOCK',
          reason: i.reason,
        });
      }

      case 'add_availability': {
        const i = input as AddAvailabilityInput;
        return this.addAvailability(ctx, i);
      }

      default:
        throw new Error(`Unhandled tool: ${toolName}`);
    }
  }

  private async getProviderSchedule(
    ctx: ToolContext,
    input: GetMyAvailabilityInput,
  ) {
    const recurring = await this.availabilityService.listRecurring(ctx.userId);
    const overrides = await this.availabilityService.listOverrides(
      ctx.userId,
      input.dateFrom,
      input.dateTo,
    );
    const bookings = await this.bookingService.listBookings(
      ctx.userId,
      'PROVIDER',
      {
        status: 'CONFIRMED',
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      },
    );

    return { recurring, overrides, bookings };
  }

  private async previewChange(ctx: ToolContext, input: ScheduleChangeInput) {
    const startTime = new Date(input.startTime);
    const endTime = new Date(input.endTime);

    // Find any bookings that would be affected by a BLOCK
    let affectedBookings: {
      id: string;
      customerName: string;
      startTime: string;
      endTime: string;
    }[] = [];
    if (input.action === 'BLOCK' && ctx.providerId) {
      const bookings = await this.prisma.booking.findMany({
        where: {
          providerId: ctx.providerId,
          status: 'CONFIRMED',
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        include: {
          customer: { select: { name: true, email: true } },
        },
      });
      affectedBookings = bookings.map((b) => ({
        id: b.id,
        customerName: b.customer.name,
        startTime: b.startTime.toISOString(),
        endTime: b.endTime.toISOString(),
      }));
    }

    return {
      preview: true,
      action: input.action,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      reason: input.reason,
      affectedBookings,
      message:
        affectedBookings.length > 0
          ? `This would affect ${affectedBookings.length} existing booking(s). Please confirm with the provider before applying.`
          : 'No existing bookings would be affected. Safe to apply.',
    };
  }

  private async applyChange(ctx: ToolContext, input: ScheduleChangeInput) {
    const override = await this.availabilityService.createOverride(ctx.userId, {
      startTime: input.startTime,
      endTime: input.endTime,
      type: input.action,
      reason: input.reason,
    });

    return {
      applied: true,
      override,
      message: `Successfully ${input.action === 'BLOCK' ? 'blocked' : 'opened'} the time range.`,
    };
  }

  private async addAvailability(ctx: ToolContext, input: AddAvailabilityInput) {
    if (input.type === 'recurring') {
      if (input.dayOfWeek === undefined) {
        throw new Error('dayOfWeek is required for recurring availability');
      }
      return this.availabilityService.createRecurring(ctx.userId, {
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
      });
    }

    // one_time → OPEN override
    return this.availabilityService.createOverride(ctx.userId, {
      startTime: input.startTime,
      endTime: input.endTime,
      type: 'OPEN',
    });
  }
}
