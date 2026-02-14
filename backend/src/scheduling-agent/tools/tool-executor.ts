import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { AvailabilityService } from "../../availability/availability.service.js";
import { BookingService } from "../../booking/booking.service.js";
import { ProviderService } from "../../provider/provider.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { customerToolNames, providerToolNames } from "./tool-definitions.js";
import { toolSchemas } from "./tool-schemas.js";

export interface ToolContext {
  userId: string;
  role: "CUSTOMER" | "PROVIDER";
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
      if (
        context.role === "CUSTOMER" &&
        !customerToolNames.has(toolName)
      ) {
        return {
          success: false,
          error: `Tool "${toolName}" is not available for customers`,
        };
      }
      if (
        context.role === "PROVIDER" &&
        !providerToolNames.has(toolName)
      ) {
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
          error: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        };
      }

      const input = parsed.data as Record<string, unknown>;

      // 3. Execute
      const result = await this.dispatch(toolName, input, context);

      this.logger.log({
        msg: "Tool executed",
        toolName,
        userId: context.userId,
        durationMs: Date.now() - start,
      });

      return { success: true, data: result };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.warn({
        msg: "Tool execution failed",
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
    input: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<unknown> {
    switch (toolName) {
      // ─── Customer + Shared ──────────────────────────────
      case "find_available_slots":
        return this.availabilityService.querySlots(
          input["providerId"] as string,
          {
            startDate: input["startDate"] as string,
            endDate: input["endDate"] as string,
            durationMinutes: input["durationMinutes"] as number,
            timeOfDay: input["timeOfDay"] as
              | "morning"
              | "afternoon"
              | "evening"
              | undefined,
            preferredDays: input["preferredDays"] as number[] | undefined,
            maxResults: (input["maxResults"] as number) ?? 3,
          },
        );

      case "get_provider_availability":
        return this.providerService.findById(
          input["providerId"] as string,
        );

      case "hold_slot":
        return this.bookingService.holdSlot(ctx.userId, {
          providerId: input["providerId"] as string,
          startTime: input["startTime"] as string,
          durationMinutes: input["durationMinutes"] as number,
          notes: input["notes"] as string | undefined,
        });

      case "confirm_booking":
        return this.bookingService.confirmBooking(
          ctx.userId,
          { holdId: input["holdId"] as string },
          randomUUID(),
        );

      case "get_my_bookings":
        return this.bookingService.listBookings(ctx.userId, ctx.role, {
          status: input["status"] as "CONFIRMED" | "CANCELLED" | undefined,
          dateFrom: input["dateFrom"] as string | undefined,
          dateTo: input["dateTo"] as string | undefined,
          page: input["page"] as number | undefined,
          limit: input["limit"] as number | undefined,
        });

      case "cancel_booking":
        return this.bookingService.cancelBooking(
          ctx.userId,
          input["bookingId"] as string,
          { reason: input["reason"] as string | undefined },
          randomUUID(),
        );

      case "reschedule_booking":
        return this.bookingService.rescheduleBooking(
          ctx.userId,
          input["bookingId"] as string,
          {
            newStartTime: input["newStartTime"] as string,
            durationMinutes: input["durationMinutes"] as number,
          },
          randomUUID(),
        );

      // ─── Provider ───────────────────────────────────────
      case "get_my_availability":
        return this.getProviderSchedule(ctx, input);

      case "preview_schedule_change":
        return this.previewChange(ctx, input);

      case "apply_schedule_change":
        return this.applyChange(ctx, input);

      case "block_time_range":
        return this.availabilityService.createOverride(ctx.userId, {
          startTime: input["startTime"] as string,
          endTime: input["endTime"] as string,
          type: "BLOCK",
          reason: input["reason"] as string | undefined,
        });

      case "add_availability":
        return this.addAvailability(ctx, input);

      default:
        throw new Error(`Unhandled tool: ${toolName}`);
    }
  }

  private async getProviderSchedule(
    ctx: ToolContext,
    input: Record<string, unknown>,
  ) {
    const recurring = await this.availabilityService.listRecurring(
      ctx.userId,
    );
    const overrides = await this.availabilityService.listOverrides(
      ctx.userId,
      input["dateFrom"] as string | undefined,
      input["dateTo"] as string | undefined,
    );
    const bookings = await this.bookingService.listBookings(
      ctx.userId,
      "PROVIDER",
      {
        status: "CONFIRMED",
        dateFrom: input["dateFrom"] as string | undefined,
        dateTo: input["dateTo"] as string | undefined,
      },
    );

    return { recurring, overrides, bookings };
  }

  private async previewChange(
    ctx: ToolContext,
    input: Record<string, unknown>,
  ) {
    const action = input["action"] as "BLOCK" | "OPEN";
    const startTime = new Date(input["startTime"] as string);
    const endTime = new Date(input["endTime"] as string);

    // Find any bookings that would be affected by a BLOCK
    let affectedBookings: unknown[] = [];
    if (action === "BLOCK" && ctx.providerId) {
      const bookings = await this.prisma.booking.findMany({
        where: {
          providerId: ctx.providerId,
          status: "CONFIRMED",
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
      action,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      reason: input["reason"],
      affectedBookings,
      message:
        affectedBookings.length > 0
          ? `This would affect ${affectedBookings.length} existing booking(s). Please confirm with the provider before applying.`
          : "No existing bookings would be affected. Safe to apply.",
    };
  }

  private async applyChange(
    ctx: ToolContext,
    input: Record<string, unknown>,
  ) {
    const action = input["action"] as "BLOCK" | "OPEN";
    const override = await this.availabilityService.createOverride(
      ctx.userId,
      {
        startTime: input["startTime"] as string,
        endTime: input["endTime"] as string,
        type: action,
        reason: input["reason"] as string | undefined,
      },
    );

    return {
      applied: true,
      override,
      message: `Successfully ${action === "BLOCK" ? "blocked" : "opened"} the time range.`,
    };
  }

  private async addAvailability(
    ctx: ToolContext,
    input: Record<string, unknown>,
  ) {
    const type = input["type"] as "recurring" | "one_time";

    if (type === "recurring") {
      const dayOfWeek = input["dayOfWeek"] as number | undefined;
      if (dayOfWeek === undefined) {
        throw new Error("dayOfWeek is required for recurring availability");
      }
      return this.availabilityService.createRecurring(ctx.userId, {
        dayOfWeek,
        startTime: input["startTime"] as string,
        endTime: input["endTime"] as string,
      });
    }

    // one_time → OPEN override
    return this.availabilityService.createOverride(ctx.userId, {
      startTime: input["startTime"] as string,
      endTime: input["endTime"] as string,
      type: "OPEN",
    });
  }
}
