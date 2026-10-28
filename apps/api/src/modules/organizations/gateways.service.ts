import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthenticatedUser,
  GatewayConfig,
  GatewayConfigListResponse,
  GatewayConfigUpdateInput,
} from '@ventascatalogo/contracts';
import type { PaymentGatewayConfig, PaymentProvider } from '@prisma/client';
import { GatewaysRepository } from './gateways.repository';
import { encryptSecret } from '../../common/utils/crypto';
import { maskSecret } from '../expenses/expense-calculations';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class GatewaysService {
  constructor(
    private readonly repo: GatewaysRepository,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(organizationId: string): Promise<GatewayConfigListResponse> {
    const configs = await this.repo.list(organizationId);
    return { items: configs.map(toGatewayConfig) };
  }

  async upsert(
    user: AuthenticatedUser,
    provider: PaymentProvider,
    input: GatewayConfigUpdateInput,
    meta: AuditMeta,
  ): Promise<GatewayConfig> {
    const existing = await this.repo.find(user.organizationId, provider);
    const secretKey = input.secretKey?.trim() ?? '';
    const webhookSecret = input.webhookSecret?.trim() ?? '';
    const hasNewSecret = secretKey.length > 0;

    if (input.enabled && !hasNewSecret && !existing?.secretEnc) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'gateway_secret_required',
        provider,
      });
    }

    const encryptionKey = this.config.get<string>('ENCRYPTION_KEY', '');
    const secretEnc = hasNewSecret
      ? encryptSecret(secretKey, encryptionKey)
      : (existing?.secretEnc ?? null);
    const webhookSecretEnc = webhookSecret
      ? encryptSecret(webhookSecret, encryptionKey)
      : (existing?.webhookSecretEnc ?? null);
    const maskedKey = hasNewSecret ? maskSecret(secretKey) : (existing?.maskedKey ?? null);
    const publicKey =
      input.publicKey !== undefined ? input.publicKey : (existing?.publicKey ?? null);

    const saved = await this.repo.upsert({
      organizationId: user.organizationId,
      provider,
      mode: input.mode,
      enabled: input.enabled,
      publicKey,
      secretEnc,
      webhookSecretEnc,
      maskedKey,
    });

    await this.writeAudit(user, saved, existing, meta, 'payment.gateway_updated');
    return toGatewayConfig(saved);
  }

  async setEnabled(
    user: AuthenticatedUser,
    provider: PaymentProvider,
    enabled: boolean,
    meta: AuditMeta,
  ): Promise<GatewayConfig> {
    const existing = await this.repo.find(user.organizationId, provider);
    if (!existing) {
      throw new AppException('NOT_FOUND', 404, { resource: 'payment_gateway' });
    }
    if (enabled && !existing.secretEnc) {
      throw new AppException('VALIDATION_FAILED', 422, {
        reason: 'gateway_secret_required',
        provider,
      });
    }
    const saved = await this.repo.setEnabled(existing.id, enabled);
    await this.writeAudit(user, saved, existing, meta, 'payment.gateway_updated');
    return toGatewayConfig(saved);
  }

  /** Auditoría con before/after SIN secretos (solo hasSecret y máscara). */
  private async writeAudit(
    user: AuthenticatedUser,
    saved: PaymentGatewayConfig,
    before: PaymentGatewayConfig | null,
    meta: AuditMeta,
    action: string,
  ): Promise<void> {
    const describe = (config: PaymentGatewayConfig | null) =>
      config
        ? {
            provider: config.provider,
            mode: config.mode,
            enabled: config.enabled,
            publicKey: config.publicKey,
            maskedKey: config.maskedKey,
            hasSecret: Boolean(config.secretEnc),
          }
        : null;
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action,
      entityType: 'payment_gateway',
      entityId: saved.id,
      before: describe(before),
      after: describe(saved),
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
  }
}

export function toGatewayConfig(config: PaymentGatewayConfig): GatewayConfig {
  return {
    provider: config.provider,
    mode: config.mode as GatewayConfig['mode'],
    enabled: config.enabled,
    publicKey: config.publicKey,
    maskedKey: config.maskedKey,
    hasSecret: Boolean(config.secretEnc),
    updatedAt: config.updatedAt.toISOString(),
  };
}
