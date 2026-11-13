import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoutinesService } from './routines.service';

const TICK_INTERVAL_MS = 60_000;

/**
 * Tick del planificador de rutinas. No se usa `@nestjs/schedule`: un
 * `setInterval` propio cada 60 s alcanza para resoluciones de minutos y evita
 * sumar una dependencia.
 *
 * - `ROUTINES_SCHEDULER_ENABLED=false` (o `0`) lo apaga por completo.
 * - El timer se marca `unref()` para no mantener vivo el proceso en tests/CLI.
 * - Un tick que todavía corre no se solapa con el siguiente; el claim de
 *   `runDue` evita además duplicados entre instancias de la API.
 */
@Injectable()
export class RoutinesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoutinesScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly routines: RoutinesService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('ROUTINES_SCHEDULER_ENABLED', 'true');
    if (raw.trim().toLowerCase() === 'false' || raw.trim() === '0') {
      this.logger.log('routines_scheduler_disabled');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_INTERVAL_MS);
    this.timer.unref();
    this.logger.log({ intervalMs: TICK_INTERVAL_MS }, 'routines_scheduler_started');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Un tick: procesa las rutinas vencidas y nunca propaga el error al timer. */
  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const executed = await this.routines.runDue();
      if (executed > 0) {
        this.logger.log({ executed }, 'routines_scheduler_tick');
      }
    } catch (error) {
      this.logger.error({ err: error }, 'routines_scheduler_tick_failed');
    } finally {
      this.ticking = false;
    }
  }
}
