import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { traceMiddleware } from '../../src/common/middleware/trace.middleware';

// El servidor real serializa BigInt de Prisma con `.toString()` (main.ts).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(
  this: bigint,
): string {
  return this.toString();
};

/**
 * Construye la misma aplicación que `main.ts` pero sin `listen()`: Supertest
 * atiende el servidor HTTP efímero en proceso, así que los E2E no dependen del
 * `pnpm dev` de la API ni de un puerto fijo.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');

  app.setGlobalPrefix(prefix);
  app.use(cookieParser());
  app.use(traceMiddleware);
  await app.init();

  return app;
}

export function apiBaseUrl(app: INestApplication): string {
  const prefix = app.get(ConfigService).get<string>('API_PREFIX', 'api/v1');
  return `/${prefix.replace(/^\/+|\/+$/g, '')}`;
}
