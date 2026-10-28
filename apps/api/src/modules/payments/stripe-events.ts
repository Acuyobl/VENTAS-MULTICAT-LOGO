import type { Currency } from '@ventascatalogo/contracts';

/** Evento de pasarela normalizado, independiente del proveedor. */
export interface ParsedPaymentEvent {
  externalEventId: string;
  type: string;
  kind: 'payment_succeeded' | 'ignored';
  orderId: string | null;
  providerPaymentId: string | null;
  amountMinor: bigint | null;
  currency: Currency | null;
}

interface StripeEventObject {
  id?: string;
  amount_total?: number;
  amount_received?: number;
  amount?: number;
  currency?: string;
  payment_intent?: string;
  client_reference_id?: string;
  metadata?: Record<string, string | undefined> | null;
}

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: StripeEventObject };
}

function toCurrency(value: string | undefined): Currency | null {
  const upper = (value ?? '').toUpperCase();
  return upper === 'CRC' || upper === 'USD' ? upper : null;
}

/**
 * Parsea los eventos que usa el checkout de Stripe sin depender del SDK:
 * `checkout.session.completed` y `payment_intent.succeeded`. El `orderId` viaja en
 * `metadata.orderId` (o `client_reference_id`).
 */
export function parseStripeWebhookEvent(payload: Buffer | string): ParsedPaymentEvent {
  const raw = typeof payload === 'string' ? payload : payload.toString('utf8');
  const event = JSON.parse(raw) as StripeEvent;
  const object = event.data?.object ?? {};
  const externalEventId = event.id ?? object.id ?? '';
  const type = event.type ?? 'unknown';

  const handled = type === 'checkout.session.completed' || type === 'payment_intent.succeeded';
  const orderId = object.metadata?.orderId ?? object.client_reference_id ?? null;
  const amount = object.amount_total ?? object.amount_received ?? object.amount ?? null;
  const providerPaymentId = object.payment_intent ?? object.id ?? null;

  return {
    externalEventId,
    type,
    kind: handled && orderId ? 'payment_succeeded' : 'ignored',
    orderId,
    providerPaymentId,
    amountMinor: amount === null ? null : BigInt(amount),
    currency: toCurrency(object.currency),
  };
}
