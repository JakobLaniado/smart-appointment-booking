import { Injectable, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { AvailabilityCalculatorService } from "./availability-calculator.service.js";
import { CreateRecurringDto } from "./dto/create-recurring.dto.js";
import { CreateOverrideDto } from "./dto/create-override.dto.js";
import { QuerySlotsDto } from "./dto/query-slots.dto.js";

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculator: AvailabilityCalculatorService,
  ) {}

  async createRecurring(userId: string, dto: CreateRecurringDto) {
    const provider = await this.getProviderByUserId(userId);
    return this.prisma.recurringAvailability.create({
      data: {
        providerId: provider.id,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
  }

  async listRecurring(userId: string) {
    const provider = await this.getProviderByUserId(userId);
    return this.prisma.recurringAvailability.findMany({
      where: { providerId: provider.id, isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    });
  }

  async deleteRecurring(userId: string, id: string) {
    const provider = await this.getProviderByUserId(userId);
    const rule = await this.prisma.recurringAvailability.findUnique({
      where: { id },
    });
    if (!rule || rule.providerId !== provider.id) {
      throw new NotFoundException({
        code: "RECURRING_NOT_FOUND",
        message: "Recurring availability rule not found",
      });
    }
    await this.prisma.recurringAvailability.delete({ where: { id } });
    return { deleted: true };
  }

  async createOverride(userId: string, dto: CreateOverrideDto) {
    const provider = await this.getProviderByUserId(userId);
    return this.prisma.availabilityOverride.create({
      data: {
        providerId: provider.id,
        startTime: new Date(dto.startTime),
        endTime: new Date(dto.endTime),
        type: dto.type,
        reason: dto.reason,
      },
    });
  }

  async listOverrides(
    userId: string,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const provider = await this.getProviderByUserId(userId);
    return this.prisma.availabilityOverride.findMany({
      where: {
        providerId: provider.id,
        ...(dateFrom || dateTo
          ? {
              startTime: {
                ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
                ...(dateTo ? { lte: new Date(dateTo) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startTime: "asc" },
    });
  }

  async deleteOverride(userId: string, id: string) {
    const provider = await this.getProviderByUserId(userId);
    const override = await this.prisma.availabilityOverride.findUnique({
      where: { id },
    });
    if (!override || override.providerId !== provider.id) {
      throw new NotFoundException({
        code: "OVERRIDE_NOT_FOUND",
        message: "Availability override not found",
      });
    }
    await this.prisma.availabilityOverride.delete({ where: { id } });
    return { deleted: true };
  }

  async querySlots(providerId: string, dto: QuerySlotsDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { id: providerId },
    });
    if (!provider) {
      throw new NotFoundException({
        code: "PROVIDER_NOT_FOUND",
        message: `Provider ${providerId} not found`,
      });
    }

    const [recurring, overrides, bookings] = await Promise.all([
      this.prisma.recurringAvailability.findMany({
        where: { providerId, isActive: true },
      }),
      this.prisma.availabilityOverride.findMany({
        where: {
          providerId,
          startTime: { lte: new Date(dto.endDate) },
          endTime: { gte: new Date(dto.startDate) },
        },
      }),
      this.prisma.booking.findMany({
        where: {
          providerId,
          status: "CONFIRMED",
          startTime: { lte: new Date(dto.endDate) },
          endTime: { gte: new Date(dto.startDate) },
        },
      }),
    ]);

    return this.calculator.calculateSlots(
      recurring,
      overrides,
      bookings,
      provider.timezone,
      provider.bufferMinutes,
      dto.startDate,
      dto.endDate,
      dto.durationMinutes,
      {
        timeOfDay: dto.timeOfDay,
        preferredDays: dto.preferredDays,
        notBefore: dto.notBefore,
        notAfter: dto.notAfter,
      },
      dto.maxResults,
    );
  }

  private async getProviderByUserId(userId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
    });
    if (!provider) {
      throw new ForbiddenException({
        code: "NOT_A_PROVIDER",
        message: "User does not have a provider profile",
      });
    }
    return provider;
  }
}
