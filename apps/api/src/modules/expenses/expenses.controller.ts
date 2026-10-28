import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  expenseCreateSchema,
  expenseListQuerySchema,
  type AuthenticatedUser,
  type ExpenseCreateInput,
  type ExpenseListQuery,
  type ExpenseListResponse,
  type ExpenseSummary,
} from '@ventascatalogo/contracts';
import { ExpensesService } from './expenses.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();

@Controller('expenses')
@Audience('staff')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('expense:write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(expenseCreateSchema)) body: ExpenseCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ExpenseSummary> {
    return this.expenses.create(user, body, salesMetaFrom(req));
  }

  @Get()
  @RequireAnyPermissions('finance:read', 'expense:write')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(expenseListQuerySchema)) query: ExpenseListQuery,
  ): Promise<ExpenseListResponse> {
    return this.expenses.list(user, query);
  }

  @Delete(':id')
  @RequirePermissions('expense:write')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Req() req: RequestWithTrace,
  ): Promise<{ id: string; deleted: true }> {
    return this.expenses.remove(user, id, salesMetaFrom(req));
  }
}
