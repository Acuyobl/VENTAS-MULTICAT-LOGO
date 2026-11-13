import { Module } from '@nestjs/common';
import { AiGovernanceService } from './ai-governance.service';
import { AiUsageController } from './ai-usage.controller';

/**
 * Gobernanza de IA: consumo del mes, presupuesto y freno previo a gastar.
 * `PrismaService` llega por el `PrismaModule` global.
 */
@Module({
  controllers: [AiUsageController],
  providers: [AiGovernanceService],
  exports: [AiGovernanceService],
})
export class AiGovernanceModule {}
