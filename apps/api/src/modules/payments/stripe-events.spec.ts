import { describe, expect, it } from 'vitest';
import { parseStripeWebhookEvent } from './stripe-events';

describe('parseStripeWebhookEvent', () => {
  it('normaliza checkout.session.completed con metadata.orderId', () => {
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_checkout_1',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_1',
            payment_intent: 'pi_test_1',
            amount_total: 22600,
            currency: 'crc',
            metadata: { orderId: '01920000-0000-7000-8000-000000000001' },
          },
        },
      }),
      'utf8',
    );

    expect(parseStripeWebhookEvent(payload)).toEqual({
      externalEventId: 'evt_checkout_1',
      type: 'checkout.session.completed',
      kind: 'payment_succeeded',
      orderId: '01920000-0000-7000-8000-000000000001',
      providerPaymentId: 'pi_test_1',
      amountMinor: 22_600n,
      currency: 'CRC',
    });
  });

  it('normaliza payment_intent.succeeded con client_reference_id', () => {
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_intent_1',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_2',
            amount_received: 5000,
            currency: 'usd',
            client_reference_id: '01920000-0000-7000-8000-000000000002',
          },
        },
      }),
      'utf8',
    );

    expect(parseStripeWebhookEvent(payload)).toMatchObject({
      externalEventId: 'evt_intent_1',
      kind: 'payment_succeeded',
      orderId: '01920000-0000-7000-8000-000000000002',
      providerPaymentId: 'pi_test_2',
      amountMinor: 5_000n,
      currency: 'USD',
    });
  });

  it('marca como ignored los eventos que no son cobros', () => {
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_ignored',
        type: 'customer.created',
        data: { object: { id: 'cus_1' } },
      }),
      'utf8',
    );

    const event = parseStripeWebhookEvent(payload);
    expect(event.kind).toBe('ignored');
    expect(event.orderId).toBeNull();
    expect(event.amountMinor).toBeNull();
  });

  it('marca como ignored un cobro sin orderId (no se puede aplicar)', () => {
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_no_order',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_2', amount_total: 1000, currency: 'crc' } },
      }),
      'utf8',
    );
    expect(parseStripeWebhookEvent(payload).kind).toBe('ignored');
  });
});
