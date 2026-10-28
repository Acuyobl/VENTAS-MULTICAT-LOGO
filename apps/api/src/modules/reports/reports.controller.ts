import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  reportRangeQuerySchema,
  type AuthenticatedUser,
  type FinanceReport,
  type ProfitReport,
  type ReconciliationReport,
  type ReportRangeQuery,
} from '@ventascatalogo/contracts';
import { ReportsService } from './reports.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
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

  @Get('profit')
  @RequirePermissions('finance:read')
  profit(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
  ): Promise<ProfitReport> {
    return this.reports.profit(user.organizationId, query);
  }

  @Get('finance/export.csv')
  @RequirePermissions('finance:read')
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(reportRangeQuerySchema)) query: ReportRangeQuery,
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const { csv, filename } = await this.reports.exportFinanceCsv(user, query, salesMetaFrom(req));
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
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
