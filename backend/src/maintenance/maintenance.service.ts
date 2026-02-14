import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Delete idempotency records older than 48 hours. Runs daily at 3 AM. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupIdempotencyRecords() {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const result = await this.prisma.idempotencyRecord.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(
      `Cleaned up ${result.count} expired idempotency records (older than ${cutoff.toISOString()})`,
    );
  }
}
