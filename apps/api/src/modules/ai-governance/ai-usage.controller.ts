import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  aiBudgetUpdateSchema,
  type AiBudgetUpdateInput,
  type AiUsage,
  type AuthenticatedUser,
} from '@ventascatalogo/contracts';
import { AiGovernanceService, type AiBudgetPolicyDto } from './ai-governance.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/** Consumo y presupuesto de IA de la organización. */
@Controller('ai')
@Audience('staff')
export class AiUsageController {
  constructor(private readonly governance: AiGovernanceService) {}

  @Get('usage')
  @RequirePermissions('ai:usage_read')
  usage(@CurrentUser() user: AuthenticatedUser): Promise<AiUsage> {
    return this.governance.getUsage(user.organizationId);
  }

  @Get('budget')
  @RequirePermissions('ai:usage_read')
  budget(@CurrentUser() user: AuthenticatedUser): Promise<AiBudgetPolicyDto> {
    return this.governance.getBudget(user.organizationId);
  }

  @Patch('budget')
  @RequirePermissions('ai:budget_manage')
  updateBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(aiBudgetUpdateSchema)) body: AiBudgetUpdateInput,
  ): Promise<AiBudgetPolicyDto> {
    return this.governance.updateBudget(user.organizationId, body, user.id);
  }
}
