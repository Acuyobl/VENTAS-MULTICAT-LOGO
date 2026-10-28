import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app-exception';
import { SandboxGateway } from './sandbox.gateway';

function configWith(values: Record<string, unknown> = {}): ConfigService {
  const data: Record<string, unknown> = {
    PAYMENTS_SANDBOX_ENABLED: true,
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
  token: 'token-sandbox-123',
  expiresAt: new Date('2026-01-01T13:00:00.000Z'),
};

describe('SandboxGateway', () => {
  it('crea un link interno /pago/{token} cuando el flag está encendido', async () => {
    const gateway = new SandboxGateway(configWith());

    const result = await gateway.createLink(LINK_INPUT);

    expect(result.url).toBe('http://localhost:3000/pago/token-sandbox-123');
    expect(result.externalId).toBeNull();
    expect(gateway.isEnabled()).toBe(true);
  });

  it('con el flag apagado se comporta como pasarela no configurada', async () => {
    const gateway = new SandboxGateway(configWith({ PAYMENTS_SANDBOX_ENABLED: false }));

    const error = await gateway.createLink(LINK_INPUT).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('INTEGRATION_NOT_CONFIGURED');
    expect((error as AppException).getResponse()).toMatchObject({
      details: { provider: 'SANDBOX', reason: 'sandbox_disabled' },
    });
  });

  it('no acepta webhooks ni los parsea', () => {
    const gateway = new SandboxGateway(configWith());
    expect(gateway.verifyWebhook()).toBe(false);
    expect(() => gateway.parseWebhook()).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('acepta el flag como string "true"', () => {
    expect(new SandboxGateway(configWith({ PAYMENTS_SANDBOX_ENABLED: 'true' })).isEnabled()).toBe(
      true,
    );
  });
});
