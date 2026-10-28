import { Injectable } from '@nestjs/common';
import type { Customer, Order, OrderItem, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { nextBusinessNumber } from '../sales/number-sequence';
import type { BuiltQuoteLine } from '../sales/quote-calculator';
import type { GuestCustomerLookup } from './guest-customer';

export type StorefrontOrder = Order & { customer: Customer; items: OrderItem[] };

export interface StorefrontOrderInput {
  organizationId: string;
  catalogId: string;
  catalogVersionId: string;
  customerId: string;
  currency: 'CRC' | 'USD';
  taxRateBp: number;
  taxIncluded: boolean;
  notes: string | null;
  lines: BuiltQuoteLine[];
  totals: {
    subtotalMinor: bigint;
    discountMinor: bigint;
    taxMinor: bigint;
    totalMinor: bigint;
  };
  tokenHash: string;
  tokenExpiresAt: Date;
}

@Injectable()
export class StorefrontRepository {
  constructor(private readonly prisma: PrismaService) {}

  findPublicCatalog(slug: string) {
    return this.prisma.catalog.findFirst({
      where: { slug, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        organizationId: true,
        activeVersion: true,
      },
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

  findCustomerForGuest(
    organizationId: string,
    lookup: GuestCustomerLookup,
  ): Promise<Customer | null> {
    return this.prisma.customer.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        ...(lookup.by === 'email'
          ? { email: { equals: lookup.value, mode: 'insensitive' } }
          : { phone: lookup.value }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  createGuestCustomer(
    organizationId: string,
    input: {
      fullName: string;
      email: string | null;
      phone: string | null;
    },
  ): Promise<Customer> {
    return this.prisma.customer.create({
      data: {
        organizationId,
        type: 'PERSON',
        name: input.fullName,
        email: input.email,
        phone: input.phone,
      },
    });
  }

  /** Crea el pedido con número secuencial por organización (misma secuencia `PED-`). */
  async createOrder(input: StorefrontOrderInput): Promise<StorefrontOrder> {
    return this.prisma.$transaction(async (tx) => {
      const number = await nextBusinessNumber(tx, 'order', input.organizationId);
      return tx.order.create({
        data: {
          organizationId: input.organizationId,
          catalogId: input.catalogId,
          catalogVersionId: input.catalogVersionId,
          customerId: input.customerId,
          sellerUserId: null,
          number,
          status: 'PENDING_PAYMENT',
          currency: input.currency,
          subtotalMinor: input.totals.subtotalMinor,
          discountMinor: input.totals.discountMinor,
          taxMinor: input.totals.taxMinor,
          totalMinor: input.totals.totalMinor,
          paidMinor: 0n,
          taxRateBp: input.taxRateBp,
          taxIncluded: input.taxIncluded,
          notes: input.notes,
          publicToken: input.tokenHash,
          publicTokenExpiresAt: input.tokenExpiresAt,
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
        include: { customer: true, items: true },
      });
    });
  }

  /** Búsqueda por SHA-256: el token en claro nunca se guarda ni se consulta. */
  findByTokenHash(tokenHash: string): Promise<StorefrontOrder | null> {
    return this.prisma.order.findFirst({
      where: { publicToken: tokenHash, deletedAt: null },
      include: { customer: true, items: true },
    });
  }

  findAccountCustomer(userId: string, organizationId: string) {
    return this.prisma.customerAccount.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
      include: { customer: true },
    });
  }

  claimOrder(orderId: string, customerId: string, claimedAt: Date): Promise<StorefrontOrder> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { customerId, claimedAt },
      include: { customer: true, items: true },
    });
  }

  markClaimedIfNeeded(orderId: string, claimedAt: Date): Promise<StorefrontOrder> {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { claimedAt },
      include: { customer: true, items: true },
    });
  }

  /**
   * Portal del cliente: `customerId` es **obligatorio** en la firma y en el
   * `where`, no una decisión opcional del controlador.
   */
  async listForCustomer(
    organizationId: string,
    customerId: string,
    query: { cursor?: string; limit: number },
  ): Promise<{ items: StorefrontOrder[]; nextCursor: string | null }> {
    const where: Prisma.OrderWhereInput = {
      organizationId,
      customerId,
      deletedAt: null,
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    };
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
      include: { customer: true, items: true },
    });
    const hasNext = rows.length > query.limit;
    const page = hasNext ? rows.slice(0, query.limit) : rows;
    return {
      items: page,
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  findForCustomer(
    organizationId: string,
    customerId: string,
    orderId: string,
  ): Promise<StorefrontOrder | null> {
    return this.prisma.order.findFirst({
      where: { id: orderId, organizationId, customerId, deletedAt: null },
      include: { customer: true, items: true },
    });
  }
}
