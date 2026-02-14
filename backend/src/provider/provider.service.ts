import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';

@Injectable()
export class ProviderService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const providers = await this.prisma.provider.findMany({
      include: { user: { select: { name: true, email: true } } },
    });
    return providers.map((p) => ({
      id: p.id,
      name: p.user.name,
      email: p.user.email,
      profession: p.profession,
      timezone: p.timezone,
      bufferMinutes: p.bufferMinutes,
    }));
  }

  async findById(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        user: { select: { name: true, email: true } },
        recurringAvailability: { where: { isActive: true } },
      },
    });
    if (!provider) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: `Provider ${id} not found`,
      });
    }
    return {
      id: provider.id,
      name: provider.user.name,
      email: provider.user.email,
      profession: provider.profession,
      timezone: provider.timezone,
      bufferMinutes: provider.bufferMinutes,
      availability: provider.recurringAvailability.map((a) => ({
        id: a.id,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    };
  }

  async findByUserId(userId: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
      include: {
        user: { select: { name: true, email: true } },
        recurringAvailability: { where: { isActive: true } },
      },
    });
    if (!provider) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider profile not found for this user',
      });
    }
    return {
      id: provider.id,
      name: provider.user.name,
      email: provider.user.email,
      profession: provider.profession,
      timezone: provider.timezone,
      bufferMinutes: provider.bufferMinutes,
      availability: provider.recurringAvailability.map((a) => ({
        id: a.id,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
      })),
    };
  }

  async update(userId: string, dto: UpdateProviderDto) {
    const provider = await this.prisma.provider.findUnique({
      where: { userId },
    });
    if (!provider) {
      throw new NotFoundException({
        code: 'PROVIDER_NOT_FOUND',
        message: 'Provider profile not found for this user',
      });
    }

    const updated = await this.prisma.provider.update({
      where: { id: provider.id },
      data: dto,
      include: { user: { select: { name: true, email: true } } },
    });

    return {
      id: updated.id,
      name: updated.user.name,
      email: updated.user.email,
      profession: updated.profession,
      timezone: updated.timezone,
      bufferMinutes: updated.bufferMinutes,
    };
  }
}
