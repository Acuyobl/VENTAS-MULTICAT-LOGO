import { Injectable } from '@nestjs/common';
import type { Catalog, Expense } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExpenseFilter {
  organizationId: string;
  start: Date;
  end: Date;
  catalogId?: string;
  category?: string;
}

export interface CreateExpenseData {
  organizationId: string;
  catalogId: string;
  category: string;
  description: string;
  amountMinor: bigint;
  currency: 'CRC' | 'USD';
  taxMinor: bigint;
  incurredAt: Date;
  paymentMethod: string | null;
  createdByUserId: string;
}

@Injectable()
export class ExpensesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCatalog(organizationId: string, catalogId: string): Promise<Catalog | null> {
    return this.prisma.catalog.findFirst({
      where: { id: catalogId, organizationId, deletedAt: null },
    });
  }

  create(data: CreateExpenseData): Promise<Expense> {
    return this.prisma.expense.create({ data });
  }

  find(organizationId: string, id: string): Promise<Expense | null> {
    return this.prisma.expense.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  async list(
    filter: ExpenseFilter,
    page: { cursor?: string; limit: number },
  ): Promise<{ items: Expense[]; nextCursor: string | null }> {
    const where = buildWhere(filter);
    const rows = await this.prisma.expense.findMany({
      where,
      orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
      take: page.limit + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > page.limit;
    const items = hasMore ? rows.slice(0, page.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
    };
  }

  totals(filter: ExpenseFilter) {
    return this.prisma.expense.findMany({
      where: buildWhere(filter),
      select: { category: true, amountMinor: true, taxMinor: true },
    });
  }

  softDelete(id: string): Promise<Expense> {
    return this.prisma.expense.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}

function buildWhere(filter: ExpenseFilter) {
  return {
    organizationId: filter.organizationId,
    deletedAt: null,
    incurredAt: { gte: filter.start, lte: filter.end },
    ...(filter.catalogId ? { catalogId: filter.catalogId } : {}),
    ...(filter.category ? { category: filter.category } : {}),
  };
}
