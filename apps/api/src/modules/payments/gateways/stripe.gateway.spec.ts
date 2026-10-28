import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app-exception';
import { StripeGateway } from './stripe.gateway';
import { computeStripeSignature } from '../stripe-signature';

function configWith(values: Record<string, unknown> = {}): ConfigService {
  const data: Record<string, unknown> = {
    STRIPE_SECRET_KEY: 'sk_test_123',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    WEB_PUBLIC_URL: 'http://localhost:3000',
    ...values,
  };
  return {
    get: (key: string, fallback?: unknown) => data[key] ?? fallback,
  } as unknown as ConfigService;
}

const LINK_INPUT = {
  orderId: '01920000-0000-7000-8000-000000000001',
  orderNumber: 'PED-2026-000001',
  amountMinor: 22_600n,
  currency: 'CRC' as const,
  token: 'token-publico-de-pago-123',
  expiresAt: new Date('2026-01-01T13:00:00.000Z'),
};

describe('StripeGateway', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('crea la Checkout Session con la API de Stripe y devuelve la URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const gateway = new StripeGateway(configWith());

    const result = await gateway.createLink(LINK_INPUT);

    expect(result).toEqual({
      url: 'https://checkout.stripe.com/c/pay/cs_test_1',
      externalId: 'cs_test_1',
    });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer sk_test_123');
    const body = String(options.body);
    expect(body).toContain('metadata%5BorderId%5D=01920000-0000-7000-8000-000000000001');
    expect(body).toContain('%5Bunit_amount%5D=22600');
  });

  it('sin STRIPE_SECRET_KEY responde INTEGRATION_NOT_CONFIGURED', async () => {
    const gateway = new StripeGateway(configWith({ STRIPE_SECRET_KEY: '' }));

    const error = await gateway.createLink(LINK_INPUT).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('INTEGRATION_NOT_CONFIGURED');
    expect((error as AppException).getStatus()).toBe(409);
  });

  it('si Stripe no responde responde PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const gateway = new StripeGateway(configWith());

    await expect(gateway.createLink(LINK_INPUT)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });

  it('un status no-2xx también es PAYMENT_PROVIDER_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));
    const gateway = new StripeGateway(configWith());

    await expect(gateway.createLink(LINK_INPUT)).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_UNAVAILABLE',
    });
  });

  it('verifica la firma con STRIPE_WEBHOOK_SECRET y parsea el evento', () => {
    const gateway = new StripeGateway(configWith());
    const payload = Buffer.from(
      JSON.stringify({
        id: 'evt_1',
        type: 'checkout.session.completed',
        data: {
          object: { id: 'cs_1', amount_total: 1000, currency: 'crc', metadata: { orderId: 'o-1' } },
        },
      }),
      'utf8',
    );
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeStripeSignature('whsec_test', timestamp, payload);
    const headers = { 'stripe-signature': `t=${timestamp},v1=${signature}` };

    expect(gateway.verifyWebhook(payload, headers)).toBe(true);
    expect(gateway.verifyWebhook(payload, { 'stripe-signature': 't=1,v1=deadbeef' })).toBe(false);
    expect(gateway.parseWebhook(payload)).toMatchObject({
      externalEventId: 'evt_1',
      orderId: 'o-1',
      amountMinor: 1000n,
    });
  });
});
