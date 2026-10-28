import { Injectable } from '@nestjs/common';
import type { CatalogVersion, Customer, Prisma, Quote } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { QuoteListQuery } from '@ventascatalogo/contracts';
import { nextBusinessNumber } from './number-sequence';
import { randomToken } from '../../common/utils/crypto';
import type { BuiltQuoteLine } from './quote-calculator';
import type { OrderWithRelations, QuoteWithRelations } from './sales.mappers';

export interface QuoteCatalogInfo {
  id: string;
  name: string;
  organizationId: string;
  activeVersion: CatalogVersion | null;
}

export interface CreateQuoteInput {
  organizationId: string;
  sellerUserId: string;
  catalogId: string;
  catalogVersionId: string;
  customerId: string;
  currency: 'CRC' | 'USD';
  taxRateBp: number;
  taxIncluded: boolean;
  validUntil: Date;
  notes: string | null;
  lines: BuiltQuoteLine[];
  totals: {
    subtotalMinor: bigint;
    discountMinor: bigint;
    taxMinor: bigint;
    totalMinor: bigint;
  };
}

export type ConvertQuoteResult =
  | { kind: 'created'; order: OrderWithRelations; quote: Quote }
  | { kind: 'already_converted'; orderId: string | null }
  | { kind: 'missing' };

@Injectable()
export class QuotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCatalog(organizationId: string, catalogId: string): Promise<QuoteCatalogInfo | null> {
    return this.prisma.catalog.findFirst({
      where: { id: catalogId, organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        organizationId: true,
        activeVersion: true,
      },
    });
  }

  findCustomer(organizationId: string, customerId: string) {
    return this.prisma.customer.findFirst({
      where: { id: customerId, organizationId, deletedAt: null },
    });
  }

  findProducts(versionId: string, productIds: string[]) {
    return this.prisma.product.findMany({
      where: { catalogVersionId: versionId, id: { in: productIds }, deletedAt: null },
      select: {
        id: true,
        sku: true,
        name: true,
        priceMinor: true,
        stock: true,
        allowBackorder: true,
        isActive: true,
        deletedAt: true,
      },
    });
  }

  findOrganizationName(organizationId: string): Promise<string> {
    return this.prisma.organization
      .findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } })
      .then((organization) => organization.name);
  }

  async create(input: CreateQuoteInput): Promise<QuoteWithRelations> {
    return this.prisma.$transaction(async (tx) => {
      const number = await nextBusinessNumber(tx, 'quote', input.organizationId);
      return tx.quote.create({
        data: {
          organizationId: input.organizationId,
          catalogId: input.catalogId,
          catalogVersionId: input.catalogVersionId,
          customerId: input.customerId,
          sellerUserId: input.sellerUserId,
          number,
          status: 'DRAFT',
          currency: input.currency,
          subtotalMinor: input.totals.subtotalMinor,
          discountMinor: input.totals.discountMinor,
          taxMinor: input.totals.taxMinor,
          totalMinor: input.totals.totalMinor,
          taxRateBp: input.taxRateBp,
          taxIncluded: input.taxIncluded,
          validUntil: input.validUntil,
          notes: input.notes,
          publicToken: randomToken(32),
          items: {
            create: input.lines.map((line) => ({
              productId: line.productId,
              skuSnapshot: line.skuSnapshot,
              nameSnapshot: line.nameSnapshot,
              unitPriceMinor: line.unitPriceMinor,
              quantity: line.quantity,
              discountMinor: line.discountMinor,
              lineTotalMinor: line.lineTotalMinor,
            })),
          },
        },
        include: { items: true, customer: true },
      });
    });
  }

  async list(
    organizationId: string,
    query: QuoteListQuery,
  ): Promise<{ items: (Quote & { customer: Customer })[]; nextCursor: string | null }> {
    const where: Prisma.QuoteWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.catalogId ? { catalogId: query.catalogId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { number: { contains: query.q, mode: 'insensitive' } },
              { customer: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };

    const rows = await this.prisma.quote.findMany({
      where,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      include: { customer: true },
    });
    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page,
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  find(organizationId: string, quoteId: string): Promise<QuoteWithRelations | null> {
    return this.prisma.quote.findFirst({
      where: { id: quoteId, organizationId, deletedAt: null },
      include: { items: true, customer: true },
    });
  }

  findOrderByQuote(organizationId: string, quoteId: string) {
    return this.prisma.order.findFirst({
      where: { organizationId, quoteId },
      select: { id: true },
    });
  }

  updateStatus(quoteId: string, status: Quote['status']): Promise<Quote> {
    return this.prisma.quote.update({ where: { id: quoteId }, data: { status } });
  }

  updatePdf(quoteId: string, pdfKey: string, status: Quote['status']): Promise<Quote> {
    return this.prisma.quote.update({ where: { id: quoteId }, data: { pdfKey, status } });
  }

  /**
   * Conversión a pedido sin recalcular: copia snapshots y totales de la
   * cotización. Todo ocurre en una transacción; si dos conversiones compiten,
   * la segunda ve el pedido existente o el estado CONVERTED y se rechaza.
   */
  async convert(organizationId: string, quoteId: string): Promise<ConvertQuoteResult> {
    return this.prisma.$transaction(async (tx) => {
      const quote = await tx.quote.findFirst({
        where: { id: quoteId, organizationId, deletedAt: null },
        include: { items: true },
      });
      if (!quote) return { kind: 'missing' };

      const existingOrder = await tx.order.findFirst({
        where: { organizationId, quoteId: quote.id },
        select: { id: true },
      });
      if (existingOrder) return { kind: 'already_converted', orderId: existingOrder.id };
      if (quote.status === 'CONVERTED') return { kind: 'already_converted', orderId: null };

      const number = await nextBusinessNumber(tx, 'order', organizationId);
      await tx.quote.update({ where: { id: quote.id }, data: { status: 'CONVERTED' } });

      const order = await tx.order.create({
        data: {
          organizationId,
          catalogId: quote.catalogId,
          catalogVersionId: quote.catalogVersionId,
          customerId: quote.customerId,
          sellerUserId: quote.sellerUserId,
          quoteId: quote.id,
          number,
          status: 'PENDING_PAYMENT',
          currency: quote.currency,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          totalMinor: quote.totalMinor,
          paidMinor: 0n,
          taxRateBp: quote.taxRateBp,
          taxIncluded: quote.taxIncluded,
          notes: quote.notes,
          items: {
            create: quote.items.map((item) => ({
              productId: item.productId,
              skuSnapshot: item.skuSnapshot,
              nameSnapshot: item.nameSnapshot,
              unitPriceMinor: item.unitPriceMinor,
              quantity: item.quantity,
              discountMinor: item.discountMinor,
              lineTotalMinor: item.lineTotalMinor,
            })),
          },
        },
        include: { items: true, customer: true },
      });

      return { kind: 'created', order, quote };
    });
  }
}
