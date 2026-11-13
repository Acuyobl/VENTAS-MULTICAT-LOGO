import { Module } from '@nestjs/common';
import { RoutinesController } from './routines.controller';
import { RoutinesScheduler } from './routines.scheduler';
import { RoutinesService } from './routines.service';

/**
 * Rutinas programadas: CRUD de configuración, ejecución manual y tick en
 * proceso cada 60 s. `PrismaService` y `ConfigService` llegan por los módulos
 * globales del `AppModule`.
 */
@Module({
  controllers: [RoutinesController],
  providers: [RoutinesService, RoutinesScheduler],
  exports: [RoutinesService],
})
export class RoutinesModule {}
