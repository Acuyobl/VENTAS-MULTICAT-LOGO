import { Controller, Get, Query } from '@nestjs/common';
import {
  reportRangeQuerySchema,
  type AuthenticatedUser,
  type FinanceReport,
  type ReconciliationReport,
  type ReportRangeQuery,
} from '@ventascatalogo/contracts';
import { ReportsService } from './reports.service';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('reports')
@Audience('staff')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('finance')
  @RequirePermissions('finance:read')
  finance(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<FinanceReport> {
    return this.reports.finance(user.organizationId, query);
  }

  @Get('reconciliation')
  @RequirePermissions('finance:read')
  reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<ReconciliationReport> {
    return this.reports.reconciliation(user.organizationId, query);
  }
}
