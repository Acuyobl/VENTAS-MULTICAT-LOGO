import type {
  OrderSummary,
  QuoteItem as QuoteItemDto,
  QuoteSummary,
} from '@ventascatalogo/contracts';
import type { Customer, Order, OrderItem, Quote, QuoteItem } from '@prisma/client';

export type QuoteWithRelations = Quote & { customer: Customer; items: QuoteItem[] };
export type OrderWithRelations = Order & { customer: Customer; items: OrderItem[] };

/** Campos comunes de una línea de cotización o de pedido (snapshot). */
export type CommercialLine = Pick<
  QuoteItem,
  | 'id'
  | 'productId'
  | 'skuSnapshot'
  | 'nameSnapshot'
  | 'unitPriceMinor'
  | 'quantity'
  | 'discountMinor'
  | 'lineTotalMinor'
>;

export function toQuoteItemDto(item: CommercialLine): QuoteItemDto {
  return {
    id: item.id,
    productId: item.productId,
    skuSnapshot: item.skuSnapshot,
    nameSnapshot: item.nameSnapshot,
    unitPriceMinor: item.unitPriceMinor.toString(),
    quantity: item.quantity,
    discountMinor: item.discountMinor.toString(),
    lineTotalMinor: item.lineTotalMinor.toString(),
  };
}

export function toQuoteSummary(
  quote: QuoteWithRelations,
  pdfUrl: string | null,
  options: { includeItems?: boolean } = {},
): QuoteSummary {
  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    catalogId: quote.catalogId,
    catalogVersionId: quote.catalogVersionId,
    customerId: quote.customerId,
    customerName: quote.customer.name,
    currency: quote.currency,
    subtotalMinor: quote.subtotalMinor.toString(),
    discountMinor: quote.discountMinor.toString(),
    taxMinor: quote.taxMinor.toString(),
    totalMinor: quote.totalMinor.toString(),
    taxRateBp: quote.taxRateBp,
    taxIncluded: quote.taxIncluded,
    validUntil: quote.validUntil.toISOString(),
    notes: quote.notes,
    pdfUrl,
    createdAt: quote.createdAt.toISOString(),
    ...(options.includeItems ? { items: quote.items.map(toQuoteItemDto) } : {}),
  };
}

export function toOrderSummary(
  order: OrderWithRelations,
  options: { includeItems?: boolean } = {},
): OrderSummary {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    catalogId: order.catalogId,
    catalogVersionId: order.catalogVersionId,
    customerId: order.customerId,
    customerName: order.customer.name,
    quoteId: order.quoteId,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor.toString(),
    discountMinor: order.discountMinor.toString(),
    taxMinor: order.taxMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    paidMinor: order.paidMinor.toString(),
    taxRateBp: order.taxRateBp,
    taxIncluded: order.taxIncluded,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    ...(options.includeItems ? { items: order.items.map(toQuoteItemDto) } : {}),
  };
}
