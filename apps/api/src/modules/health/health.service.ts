import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

export interface HealthCheckResult {
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  liveness(): { status: 'ok'; version: string; uptimeSeconds: number } {
    return {
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  async readiness(): Promise<HealthCheckResult> {
    const [database, redis, storage] = await Promise.all([
      this.timed(() => this.prisma.ping()),
      this.timed(() => this.checkRedis()),
      this.timed(() => this.storage.ping()),
    ]);

    const checks = {
      database: database ? ('up' as const) : ('down' as const),
      redis: redis ? ('up' as const) : ('down' as const),
      storage: storage ? ('up' as const) : ('down' as const),
      queues: redis ? ('up' as const) : ('down' as const),
    };
    const ok = Object.values(checks).every((value) => value === 'up');
    return { status: ok ? 'ok' : 'degraded', checks };
  }

  private async timed(check: () => Promise<boolean>): Promise<boolean> {
    try {
      return await Promise.race([
        check(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
      ]);
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    const client = new Redis(this.config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      connectTimeout: 1500,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      return (await client.ping()) === 'PONG';
    } finally {
      client.disconnect();
    }
  }
}
