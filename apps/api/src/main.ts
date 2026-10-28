import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { traceMiddleware } from './common/middleware/trace.middleware';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(
  this: bigint,
): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  app.useLogger(logger);

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);
  app.use(cookieParser());
  app.use(traceMiddleware);

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('VentasCatálogo API')
    .setDescription('API de dos caras: backoffice staff y tienda/portal customer.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('vc_staff_at')
    .addTag('auth')
    .addTag('catalogs')
    .addTag('products')
    .addTag('users')
    .addTag('health')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
  });

  const port = config.get<number>('API_PORT', 3001);
  await app.listen(port, '0.0.0.0');
  logger.log({ port, prefix, docs: `http://localhost:${port}/api/docs` }, 'api_started');
}

void bootstrap().catch((error: unknown) => {
  // Fail-fast de arranque: la configuración inválida (p. ej. DEV_AUTH_HELPERS con
  // NODE_ENV=production) aborta el proceso con un mensaje claro.
  const message = error instanceof Error ? error.message : String(error);
  console.error(`API no iniciada: ${message}`);
  process.exit(1);
});
