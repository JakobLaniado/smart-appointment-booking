import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

export interface HoldData {
  providerId: string;
  customerId: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get<string>("REDIS_HOST", "localhost"),
      port: this.configService.get<number>("REDIS_PORT", 6379),
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
  }

  onModuleInit() {
    this.logger.log("Redis connection established");
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async setHold(
    holdId: string,
    data: HoldData,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(
      `booking:hold:${holdId}`,
      JSON.stringify(data),
      "EX",
      ttlSeconds,
    );
  }

  async getHold(holdId: string): Promise<HoldData | null> {
    const raw = await this.client.get(`booking:hold:${holdId}`);
    if (!raw) return null;
    return JSON.parse(raw) as HoldData;
  }

  async deleteHold(holdId: string): Promise<void> {
    await this.client.del(`booking:hold:${holdId}`);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, "EX", ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  getClient(): Redis {
    return this.client;
  }
}
