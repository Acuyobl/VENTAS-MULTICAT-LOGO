import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ExpenseCategory,
  ExpenseCreateInput,
  ExpenseListQuery,
  ExpenseListResponse,
  ExpenseSummary,
} from '@ventascatalogo/contracts';
import type { Expense } from '@prisma/client';
import { ExpensesRepository } from './expenses.repository';
import { aggregateExpenses } from './expense-calculations';
import { resolveReportRange, startOfLocalDay, localDateString } from '../reports/report-range';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

const NOON_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly repo: ExpensesRepository,
    private readonly audit: AuditService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: ExpenseCreateInput,
    meta: AuditMeta,
  ): Promise<ExpenseSummary> {
    const catalog = await this.repo.findCatalog(user.organizationId, input.catalogId);
    if (!catalog) throw new AppException('NOT_FOUND', 404, { resource: 'catalog' });

    const expense = await this.repo.create({
      organizationId: user.organizationId,
      catalogId: catalog.id,
      category: input.category,
      description: input.description,
      amountMinor: input.amountMinor,
      currency: input.currency,
      taxMinor: input.taxMinor ?? 0n,
      incurredAt: input.incurredAt
        ? new Date(input.incurredAt)
        : new Date(startOfLocalDay(localDateString()).getTime() + NOON_MS),
      paymentMethod: input.paymentMethod ?? null,
      createdByUserId: user.id,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      after: {
        catalogId: expense.catalogId,
        category: expense.category,
        amountMinor: expense.amountMinor.toString(),
        currency: expense.currency,
        incurredAt: expense.incurredAt.toISOString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toExpenseSummary(expense);
  }

  async list(user: AuthenticatedUser, query: ExpenseListQuery): Promise<ExpenseListResponse> {
    const range = resolveReportRange({ from: query.from, to: query.to });
    const filter = {
      organizationId: user.organizationId,
      start: range.start,
      end: range.end,
      catalogId: query.catalogId,
      category: query.category,
    };
    const [page, rows] = await Promise.all([
      this.repo.list(filter, { cursor: query.cursor, limit: query.limit }),
      this.repo.totals(filter),
    ]);
    const totals = aggregateExpenses(rows);
    return {
      items: page.items.map(toExpenseSummary),
      nextCursor: page.nextCursor,
      totals: {
        count: totals.count,
        amountMinor: totals.amountMinor.toString(),
        taxMinor: totals.taxMinor.toString(),
        byCategory: totals.byCategory.map((entry) => ({
          category: entry.category as ExpenseCategory,
          count: entry.count,
          amountMinor: entry.amountMinor.toString(),
        })),
      },
    };
  }

  async remove(
    user: AuthenticatedUser,
    expenseId: string,
    meta: AuditMeta,
  ): Promise<{ id: string; deleted: true }> {
    const expense = await this.repo.find(user.organizationId, expenseId);
    if (!expense) throw new AppException('NOT_FOUND', 404, { resource: 'expense' });

    await this.repo.softDelete(expense.id);
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'expense.deleted',
      entityType: 'expense',
      entityId: expense.id,
      before: {
        category: expense.category,
        amountMinor: expense.amountMinor.toString(),
        incurredAt: expense.incurredAt.toISOString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return { id: expense.id, deleted: true };
  }
}

export function toExpenseSummary(expense: Expense): ExpenseSummary {
  return {
    id: expense.id,
    catalogId: expense.catalogId,
    category: expense.category as ExpenseCategory,
    description: expense.description,
    amountMinor: expense.amountMinor.toString(),
    currency: expense.currency,
    taxMinor: expense.taxMinor.toString(),
    incurredAt: expense.incurredAt.toISOString(),
    paymentMethod: expense.paymentMethod,
    status: expense.status,
    createdAt: expense.createdAt.toISOString(),
  };
}
