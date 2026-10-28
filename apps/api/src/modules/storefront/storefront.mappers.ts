import type {
  OrderStatus,
  StorefrontCheckoutResponse,
  StorefrontOrder,
} from '@ventascatalogo/contracts';
import type { Customer, Order, OrderItem } from '@prisma/client';
import { toQuoteItemDto } from '../sales/sales.mappers';

export type StorefrontOrderWithRelations = Order & { customer: Customer; items: OrderItem[] };

export function toStorefrontOrder(order: StorefrontOrderWithRelations): StorefrontOrder {
  return {
    orderNumber: order.number,
    status: order.status,
    currency: order.currency,
    subtotalMinor: order.subtotalMinor.toString(),
    discountMinor: order.discountMinor.toString(),
    taxMinor: order.taxMinor.toString(),
    totalMinor: order.totalMinor.toString(),
    taxRateBp: order.taxRateBp,
    taxIncluded: order.taxIncluded,
    customerName: order.customer.name,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    expiresAt: order.publicTokenExpiresAt?.toISOString() ?? null,
    items: order.items.map(toQuoteItemDto),
  };
}

export function toCheckoutResponse(
  order: StorefrontOrderWithRelations,
  token: string,
): StorefrontCheckoutResponse {
  return {
    orderId: order.id,
    orderNumber: order.number,
    status: order.status as OrderStatus,
    totalMinor: order.totalMinor.toString(),
    currency: order.currency,
    token,
    expiresAt: (order.publicTokenExpiresAt ?? new Date()).toISOString(),
  };
}
