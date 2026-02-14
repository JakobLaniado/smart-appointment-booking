import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.get<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    if (process.env['NODE_ENV'] !== 'test') {
      throw new Error('cleanDatabase is only allowed in test environment');
    }
    await this.$transaction([
      this.booking.deleteMany(),
      this.idempotencyRecord.deleteMany(),
      this.availabilityOverride.deleteMany(),
      this.recurringAvailability.deleteMany(),
      this.provider.deleteMany(),
      this.user.deleteMany(),
    ]);
  }
}
