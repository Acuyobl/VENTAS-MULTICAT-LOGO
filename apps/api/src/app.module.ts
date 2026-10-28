import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './modules/audit/audit.module';
import { EmailModule } from './modules/email/email.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogsModule } from './modules/catalogs/catalogs.module';
import { ProductsModule } from './modules/products/products.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesModule } from './modules/sales/sales.module';
import { StorefrontModule } from './modules/storefront/storefront.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { AiModule } from './modules/ai/ai.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { ChatModule } from './modules/chat/chat.module';
import { ReportsModule } from './modules/reports/reports.module';
import { HealthModule } from './modules/health/health.module';
import { StorageModule } from './modules/storage/storage.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { validateEnv } from './config/env.schema';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { EncodingGuardInterceptor } from './common/interceptors/encoding-guard.interceptor';
import { AudienceGuard } from './common/guards/audience.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isDev = config.get<string>('NODE_ENV') !== 'production';
        return {
          pinoHttp: {
            level: config.get<string>('LOG_LEVEL', 'info'),
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
            ],
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { singleLine: true, colorize: true, translateTime: 'SYS:HH:MM:ss' },
                }
              : undefined,
          },
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('RATE_LIMIT_WINDOW_MS', 60_000),
            limit: config.get<number>('RATE_LIMIT_MAX', 120),
          },
        ],
      }),
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
    EmailModule,
    UsersModule,
    AuthModule,
    CatalogsModule,
    ProductsModule,
    CustomersModule,
    SalesModule,
    StorefrontModule,
    PaymentsModule,
    OrganizationsModule,
    ReportsModule,
    AiModule,
    ChatModule,
    ExpensesModule,
    HealthModule,
    OutboxModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AudienceGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: EncodingGuardInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
