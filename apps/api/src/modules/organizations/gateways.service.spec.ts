import { describe, expect, it } from 'vitest';
import type { PaymentGatewayConfig } from '@prisma/client';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../audit/audit.service';
import { decryptSecret, encryptSecret } from '../../common/utils/crypto';
import { GatewaysRepository } from './gateways.repository';
import { GatewaysService } from './gateways.service';

const ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const user = {
  id: '01920000-0000-7000-8000-000000000001',
  organizationId: '01920000-0000-7000-8000-000000000002',
} as unknown as AuthenticatedUser;

function configWith(): ConfigService {
  return {
    get: (key: string, fallback?: unknown) =>
      key === 'ENCRYPTION_KEY' ? ENCRYPTION_KEY : fallback,
  } as unknown as ConfigService;
}

function gatewayRow(overrides: Partial<PaymentGatewayConfig> = {}): PaymentGatewayConfig {
  return {
    id: '01920000-0000-7000-8000-000000000010',
    organizationId: user.organizationId,
    provider: 'STRIPE',
    mode: 'TEST',
    enabled: false,
    publicKey: null,
    secretEnc: null,
    webhookSecretEnc: null,
    maskedKey: null,
    createdAt: new Date('2026-10-28T12:00:00.000Z'),
    updatedAt: new Date('2026-10-28T12:00:00.000Z'),
    ...overrides,
  };
}

function buildService(options: {
  existing?: PaymentGatewayConfig | null;
  saved?: PaymentGatewayConfig;
}) {
  const audits: Array<Record<string, unknown>> = [];
  const repo = {
    find: async () => options.existing ?? null,
    upsert: async () => options.saved ?? gatewayRow(),
    setEnabled: async (_id: string, enabled: boolean) =>
      gatewayRow({ enabled, secretEnc: 'v1:x:y:z', maskedKey: '****1234' }),
    list: async () => [gatewayRow({ secretEnc: 'v1:x:y:z', maskedKey: '****1234' })],
  } as unknown as GatewaysRepository;
  const audit = {
    write: async (entry: Record<string, unknown>) => {
      audits.push(entry);
    },
  } as unknown as AuditService;
  return { service: new GatewaysService(repo, audit, configWith()), audits };
}

describe('GatewaysService', () => {
  it('habilitar sin secreto nuevo ni previo → 422 gateway_secret_required', async () => {
    const { service } = buildService({ existing: null });
    await expect(
      service.upsert(user, 'STRIPE', { mode: 'TEST', enabled: true }, { traceId: 'test-trace' }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'gateway_secret_required' },
    });
  });

  it('cifra el secreto, guarda máscara y audita sin exponerlo', async () => {
    const saved = gatewayRow({
      secretEnc: encryptSecret('sk_test_abcdef', ENCRYPTION_KEY),
      maskedKey: '****cdef',
      enabled: true,
      publicKey: 'pk_test_123',
    });
    const { service, audits } = buildService({ existing: null, saved });

    const result = await service.upsert(
      user,
      'STRIPE',
      {
        mode: 'TEST',
        enabled: true,
        publicKey: 'pk_test_123',
        secretKey: 'sk_test_abcdef',
        webhookSecret: 'whsec_123456',
      },
      { traceId: 'test-trace' },
    );

    expect(result).toMatchObject({
      provider: 'STRIPE',
      enabled: true,
      maskedKey: '****cdef',
      hasSecret: true,
    });
    expect(decryptSecret(saved.secretEnc!, ENCRYPTION_KEY)).toBe('sk_test_abcdef');

    const audit = audits[0] as { action: string; after: Record<string, unknown> };
    expect(audit.action).toBe('payment.gateway_updated');
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('sk_test_abcdef');
    expect(serialized).not.toContain('whsec_123456');
    expect(audit.after).toMatchObject({ maskedKey: '****cdef', hasSecret: true });
  });

  it('PATCH deshabilitar conserva secretos; habilitar sin secreto previo falla', async () => {
    const { service } = buildService({
      existing: gatewayRow({ secretEnc: 'v1:x:y:z', maskedKey: '****1234' }),
    });
    const disabled = await service.setEnabled(user, 'STRIPE', false, { traceId: 'test-trace' });
    expect(disabled.enabled).toBe(false);

    const withoutSecret = buildService({ existing: gatewayRow({ secretEnc: null }) });
    await expect(
      withoutSecret.service.setEnabled(user, 'STRIPE', true, { traceId: 'test-trace' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('el listado nunca devuelve secretos: solo hasSecret y maskedKey', async () => {
    const { service } = buildService({});
    const list = await service.list(user.organizationId);
    expect(list.items[0]).toMatchObject({ hasSecret: true, maskedKey: '****1234' });
    expect(JSON.stringify(list)).not.toContain('v1:x:y:z');
  });
});
