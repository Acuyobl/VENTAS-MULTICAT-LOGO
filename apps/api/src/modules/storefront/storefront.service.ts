import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  OrderSummary,
  StorefrontCheckoutInput,
  StorefrontCheckoutResponse,
  StorefrontClaimResponse,
  StorefrontOrder,
} from '@ventascatalogo/contracts';
import { StorefrontRepository } from './storefront.repository';
import type { StorefrontOrderWithRelations } from './storefront.mappers';
import { toCheckoutResponse, toStorefrontOrder } from './storefront.mappers';
import { generateOrderToken, hashOrderToken, isOrderTokenExpired, orderTokenExpiry } from './token';
import { guestCustomerLookup, normalizeGuestEmail, normalizeGuestPhone } from './guest-customer';
import { buildQuoteLines, type QuoteProductSnapshot } from '../sales/quote-calculator';
import { toOrderSummary } from '../sales/sales.mappers';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

export interface MyOrdersQuery {
  cursor?: string;
  limit: number;
}

@Injectable()
export class StorefrontService {
  constructor(
    private readonly repo: StorefrontRepository,
    private readonly audit: AuditService,
  ) {}

  /** Checkout de invitado: crea el pedido y devuelve el token en claro UNA vez. */
  async checkout(
    input: StorefrontCheckoutInput,
    meta: AuditMeta,
  ): Promise<StorefrontCheckoutResponse> {
    const catalog = await this.repo.findPublicCatalog(input.catalogSlug);
    if (!catalog || !catalog.activeVersion) {
      throw new AppException('CATALOG_NOT_FOUND', 404);
    }
    const version = catalog.activeVersion;
    if (version.status === 'ARCHIVED') {
      throw new AppException('CATALOG_ARCHIVED', 409, {
        catalogId: catalog.id,
        catalogVersionId: version.id,
      });
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await this.repo.findProducts(version.id, productIds);
    const productsById = new Map<string, QuoteProductSnapshot>(
      products.map((product) => [product.id, product]),
    );
    const { lines, totals } = buildQuoteLines(
      input.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      productsById,
      { taxRateBp: version.taxRateBp, taxIncluded: version.taxIncluded },
    );

    const lookup = guestCustomerLookup(input.customer);
    const email = normalizeGuestEmail(input.customer.email);
    const phone = normalizeGuestPhone(input.customer.phone);
    let customer = lookup
      ? await this.repo.findCustomerForGuest(catalog.organizationId, lookup)
      : null;
    if (!customer) {
      customer = await this.repo.createGuestCustomer(catalog.organizationId, {
        fullName: input.customer.fullName,
        email,
        phone,
      });
    }

    const { token, tokenHash } = generateOrderToken();
    const order = await this.repo.createOrder({
      organizationId: catalog.organizationId,
      catalogId: catalog.id,
      catalogVersionId: version.id,
      customerId: customer.id,
      currency: version.currency,
      taxRateBp: version.taxRateBp,
      taxIncluded: version.taxIncluded,
      notes: input.notes ?? null,
      lines,
      totals,
      tokenHash,
      tokenExpiresAt: orderTokenExpiry(),
    });

    await this.audit.write({
      organizationId: catalog.organizationId,
      actorUserId: null,
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      after: {
        number: order.number,
        status: order.status,
        source: 'storefront',
        customerId: customer.id,
        totalMinor: order.totalMinor.toString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toCheckoutResponse(order, token);
  }

  /** Consulta pública del pedido por token (hash) con expiración de 30 días. */
  async getByToken(token: string): Promise<StorefrontOrder> {
    const order = await this.requireOrderByToken(token);
    return toStorefrontOrder(order);
  }

  /**
   * Reclamo del pedido invitado: solo el dueño del email puede reasignarlo a su
   * cuenta. Un email distinto o un pedido ya reclamado por otro responde 404.
   */
  async claim(
    user: AuthenticatedUser,
    token: string,
    meta: AuditMeta,
  ): Promise<StorefrontClaimResponse> {
    const order = await this.requireOrderByToken(token);

    const account = await this.repo.findAccountCustomer(user.id, user.organizationId);
    if (!account) throw new AppException('NOT_FOUND', 404, { resource: 'customer' });

    const guestEmail = normalizeGuestEmail(order.customer.email);
    if (!guestEmail) {
      throw new AppException(
        'VALIDATION_FAILED',
        409,
        { reason: 'claim_email_missing' },
        'El pedido no tiene email de contacto; no se puede reclamar automáticamente.',
      );
    }
    if (normalizeGuestEmail(user.email) !== guestEmail) {
      // 404: no revelamos que el pedido existe para otro email.
      throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    }

    if (order.customerId === account.customerId) {
      if (!order.claimedAt) await this.repo.markClaimedIfNeeded(order.id, new Date());
      return { orderId: order.id, claimed: true };
    }
    if (order.claimedAt) {
      throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    }

    await this.repo.claimOrder(order.id, account.customerId, new Date());
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'order.claimed',
      entityType: 'order',
      entityId: order.id,
      before: { customerId: order.customerId },
      after: { customerId: account.customerId },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return { orderId: order.id, claimed: true };
  }

  async listMyOrders(
    user: AuthenticatedUser,
    query: MyOrdersQuery,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    const customerId = await this.requireAccountCustomerId(user);
    const page = await this.repo.listForCustomer(user.organizationId, customerId, query);
    return {
      items: page.items.map((order) => toOrderSummary(order, { includeItems: true })),
      nextCursor: page.nextCursor,
    };
  }

  async getMyOrder(user: AuthenticatedUser, orderId: string): Promise<OrderSummary> {
    const customerId = await this.requireAccountCustomerId(user);
    const order = await this.repo.findForCustomer(user.organizationId, customerId, orderId);
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    return toOrderSummary(order, { includeItems: true });
  }

  private async requireOrderByToken(token: string): Promise<StorefrontOrderWithRelations> {
    const order = await this.repo.findByTokenHash(hashOrderToken(token));
    if (!order) throw new AppException('NOT_FOUND', 404, { resource: 'order' });
    if (isOrderTokenExpired(order.publicTokenExpiresAt)) {
      throw new AppException(
        'VALIDATION_FAILED',
        409,
        { reason: 'order_token_expired' },
        'El enlace del pedido expiró. Pedí uno nuevo desde la tienda.',
      );
    }
    return order;
  }

  private async requireAccountCustomerId(user: AuthenticatedUser): Promise<string> {
    const account = await this.repo.findAccountCustomer(user.id, user.organizationId);
    if (!account) throw new AppException('NOT_FOUND', 404, { resource: 'customer' });
    return account.customerId;
  }
}
