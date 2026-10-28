import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  OrderSummary,
  QuoteCreateInput,
  QuoteListQuery,
  QuoteSummary,
} from '@ventascatalogo/contracts';
import type { CatalogVersion } from '@prisma/client';
import { QuotesRepository } from './quotes.repository';
import { buildQuoteLines, type QuoteProductSnapshot } from './quote-calculator';
import { buildQuotePdf } from './quote-pdf';
import { toOrderSummary, toQuoteSummary } from './sales.mappers';
import { AppException } from '../../common/errors/app-exception';
import { StorageService } from '../storage/storage.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import type { AuditMeta } from '../../common/audit/audit.types';

export const QUOTE_DEFAULT_VALID_DAYS = 15;
export const QUOTE_MAX_VALID_DAYS = 90;
export const QUOTE_PDF_URL_TTL_SECONDS = 300;

@Injectable()
export class QuotesService {
  constructor(
    private readonly repo: QuotesRepository,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async create(
    user: AuthenticatedUser,
    input: QuoteCreateInput,
    meta: AuditMeta,
  ): Promise<QuoteSummary> {
    const organizationId = user.organizationId;

    const catalog = await this.repo.findCatalog(organizationId, input.catalogId);
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404);
    const version = catalog.activeVersion;
    if (!version) {
      throw new AppException('NO_ACTIVE_VERSION', 409, { catalogId: input.catalogId });
    }
    this.assertVersionUsable(version);

    const customer = await this.repo.findCustomer(organizationId, input.customerId);
    if (!customer) throw new AppException('NOT_FOUND', 404, { resource: 'customer' });

    const validUntil = this.resolveValidUntil(input.validUntil);

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await this.repo.findProducts(version.id, productIds);
    const productsById = new Map<string, QuoteProductSnapshot>(
      products.map((product) => [product.id, product]),
    );

    const { lines, totals } = buildQuoteLines(input.items, productsById, {
      taxRateBp: version.taxRateBp,
      taxIncluded: version.taxIncluded,
    });

    const quote = await this.repo.create({
      organizationId,
      sellerUserId: user.id,
      catalogId: catalog.id,
      catalogVersionId: version.id,
      customerId: customer.id,
      currency: version.currency,
      taxRateBp: version.taxRateBp,
      taxIncluded: version.taxIncluded,
      validUntil,
      notes: input.notes ?? null,
      lines,
      totals,
    });

    await this.audit.write({
      organizationId,
      actorUserId: user.id,
      action: 'quote.created',
      entityType: 'quote',
      entityId: quote.id,
      after: {
        number: quote.number,
        status: quote.status,
        customerId: quote.customerId,
        catalogId: quote.catalogId,
        catalogVersionId: quote.catalogVersionId,
        totalMinor: quote.totalMinor.toString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    await this.outbox.append({
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: 'quote.created',
      payload: {
        quoteId: quote.id,
        number: quote.number,
        organizationId,
        customerId: quote.customerId,
        currency: quote.currency,
        totalMinor: quote.totalMinor.toString(),
      },
    });

    return toQuoteSummary(quote, null, { includeItems: true });
  }

  async list(
    user: AuthenticatedUser,
    query: QuoteListQuery,
  ): Promise<{ items: QuoteSummary[]; nextCursor: string | null }> {
    const page = await this.repo.list(user.organizationId, query);
    const items = await Promise.all(
      page.items.map(async (quote) => {
        const pdfUrl = quote.pdfKey
          ? await this.storage.presignDocumentSafe(quote.pdfKey, QUOTE_PDF_URL_TTL_SECONDS)
          : null;
        return toQuoteSummary({ ...quote, items: [] }, pdfUrl);
      }),
    );
    return { items, nextCursor: page.nextCursor };
  }

  async get(user: AuthenticatedUser, quoteId: string): Promise<QuoteSummary> {
    const quote = await this.repo.find(user.organizationId, quoteId);
    if (!quote) throw new AppException('NOT_FOUND', 404, { resource: 'quote' });
    const pdfUrl = quote.pdfKey
      ? await this.storage.presignDocumentSafe(quote.pdfKey, QUOTE_PDF_URL_TTL_SECONDS)
      : null;
    return toQuoteSummary(quote, pdfUrl, { includeItems: true });
  }

  /** Genera (o regenera) el PDF y marca la cotización como enviada. */
  async send(user: AuthenticatedUser, quoteId: string, meta: AuditMeta): Promise<QuoteSummary> {
    const quote = await this.repo.find(user.organizationId, quoteId);
    if (!quote) throw new AppException('NOT_FOUND', 404, { resource: 'quote' });
    if (quote.status === 'REJECTED') {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'quote_invalid_transition',
        from: quote.status,
        to: 'SENT',
      });
    }

    const organizationName = await this.repo.findOrganizationName(user.organizationId);
    const pdfBytes = await buildQuotePdf({
      number: quote.number,
      organizationName,
      customerName: quote.customer.name,
      customerEmail: quote.customer.email,
      customerPhone: quote.customer.phone,
      currency: quote.currency,
      createdAt: quote.createdAt,
      validUntil: quote.validUntil,
      items: quote.items.map((item) => ({
        sku: item.skuSnapshot,
        name: item.nameSnapshot,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        discountMinor: item.discountMinor,
        lineTotalMinor: item.lineTotalMinor,
      })),
      subtotalMinor: quote.subtotalMinor,
      discountMinor: quote.discountMinor,
      taxMinor: quote.taxMinor,
      totalMinor: quote.totalMinor,
      taxRateBp: quote.taxRateBp,
      taxIncluded: quote.taxIncluded,
      notes: quote.notes,
    });

    const pdfKey = `quotes/${user.organizationId}/${quote.id}.pdf`;
    await this.storage.putDocument(pdfKey, Buffer.from(pdfBytes), 'application/pdf');

    // Enviar no reabre una cotización ya cerrada: solo DRAFT/SENT pasan a SENT.
    const nextStatus = quote.status === 'DRAFT' || quote.status === 'SENT' ? 'SENT' : quote.status;
    const updated = await this.repo.updatePdf(quote.id, pdfKey, nextStatus);

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'quote.sent',
      entityType: 'quote',
      entityId: quote.id,
      before: { status: quote.status, pdfKey: quote.pdfKey },
      after: { status: nextStatus, pdfKey },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    const pdfUrl = await this.storage.presignDocument(pdfKey, QUOTE_PDF_URL_TTL_SECONDS);
    return toQuoteSummary({ ...updated, items: quote.items, customer: quote.customer }, pdfUrl, {
      includeItems: true,
    });
  }

  async pdf(user: AuthenticatedUser, quoteId: string): Promise<{ url: string }> {
    const quote = await this.repo.find(user.organizationId, quoteId);
    if (!quote) throw new AppException('NOT_FOUND', 404, { resource: 'quote' });
    if (!quote.pdfKey) throw new AppException('NOT_FOUND', 404, { resource: 'quotePdf' });
    return {
      url: await this.storage.presignDocument(quote.pdfKey, QUOTE_PDF_URL_TTL_SECONDS),
    };
  }

  async accept(user: AuthenticatedUser, quoteId: string, meta: AuditMeta): Promise<QuoteSummary> {
    const quote = await this.repo.find(user.organizationId, quoteId);
    if (!quote) throw new AppException('NOT_FOUND', 404, { resource: 'quote' });
    if (quote.status === 'CONVERTED') {
      const order = await this.repo.findOrderByQuote(user.organizationId, quote.id);
      throw new AppException('QUOTE_ALREADY_CONVERTED', 409, { orderId: order?.id ?? null });
    }
    if (quote.validUntil.getTime() < Date.now()) {
      throw new AppException('QUOTE_EXPIRED', 409, {
        number: quote.number,
        validUntil: quote.validUntil.toISOString(),
      });
    }
    if (quote.status !== 'SENT') {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'quote_invalid_transition',
        from: quote.status,
        to: 'ACCEPTED',
      });
    }

    const updated = await this.repo.updateStatus(quote.id, 'ACCEPTED');
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'quote.accepted',
      entityType: 'quote',
      entityId: quote.id,
      before: { status: quote.status },
      after: { status: 'ACCEPTED' },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toQuoteSummary({ ...updated, items: quote.items, customer: quote.customer }, null, {
      includeItems: true,
    });
  }

  /** Convierte la cotización aceptada en pedido sin recalcular nada. */
  async convert(user: AuthenticatedUser, quoteId: string, meta: AuditMeta): Promise<OrderSummary> {
    const quote = await this.repo.find(user.organizationId, quoteId);
    if (!quote) throw new AppException('NOT_FOUND', 404, { resource: 'quote' });

    if (quote.status === 'CONVERTED') {
      const order = await this.repo.findOrderByQuote(user.organizationId, quote.id);
      throw new AppException('QUOTE_ALREADY_CONVERTED', 409, { orderId: order?.id ?? null });
    }
    if (quote.validUntil.getTime() < Date.now()) {
      throw new AppException('QUOTE_EXPIRED', 409, {
        number: quote.number,
        validUntil: quote.validUntil.toISOString(),
      });
    }
    if (quote.status !== 'ACCEPTED') {
      throw new AppException('VALIDATION_FAILED', 409, {
        reason: 'quote_not_accepted',
        status: quote.status,
      });
    }

    const result = await this.repo.convert(user.organizationId, quote.id);
    if (result.kind === 'missing') {
      throw new AppException('NOT_FOUND', 404, { resource: 'quote' });
    }
    if (result.kind === 'already_converted') {
      throw new AppException('QUOTE_ALREADY_CONVERTED', 409, { orderId: result.orderId });
    }

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'quote.converted',
      entityType: 'quote',
      entityId: quote.id,
      after: { status: 'CONVERTED', orderId: result.order.id, orderNumber: result.order.number },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'order.created',
      entityType: 'order',
      entityId: result.order.id,
      after: {
        number: result.order.number,
        status: result.order.status,
        quoteId: quote.id,
        totalMinor: result.order.totalMinor.toString(),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toOrderSummary(result.order, { includeItems: true });
  }

  private assertVersionUsable(version: CatalogVersion): void {
    if (version.status === 'ARCHIVED') {
      throw new AppException('CATALOG_ARCHIVED', 409, {
        catalogId: version.catalogId,
        catalogVersionId: version.id,
      });
    }
  }

  private resolveValidUntil(raw: string | undefined): Date {
    const now = new Date();
    const defaultDate = new Date(now.getTime() + QUOTE_DEFAULT_VALID_DAYS * 24 * 60 * 60 * 1000);
    if (!raw) return defaultDate;

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { validUntil: ['Fecha inválida.'] },
      });
    }
    if (parsed.getTime() < now.getTime()) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: { validUntil: ['La fecha de vencimiento no puede estar en el pasado.'] },
      });
    }
    const maxDate = new Date(now.getTime() + QUOTE_MAX_VALID_DAYS * 24 * 60 * 60 * 1000);
    if (parsed.getTime() > maxDate.getTime()) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: {
          validUntil: [`La validez máxima es de ${QUOTE_MAX_VALID_DAYS} días.`],
        },
      });
    }
    return parsed;
  }
}
