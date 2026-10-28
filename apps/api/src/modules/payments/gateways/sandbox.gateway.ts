import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProvider } from '@ventascatalogo/contracts';
import { AppException } from '../../../common/errors/app-exception';
import type {
  CreatePaymentLinkInput,
  CreatedPaymentLink,
  PaymentGateway,
} from '../payment-gateway';
import type { ParsedPaymentEvent } from '../stripe-events';

/**
 * Pasarela sandbox SOLO para desarrollo: el "cobro" se confirma desde
 * `POST /payments/sandbox/:token/confirm` sin dinero real. Con
 * `PAYMENTS_SANDBOX_ENABLED=false` (o en producción) se comporta como no
 * configurada.
 */
@Injectable()
export class SandboxGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'SANDBOX';

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    const value = this.config.get<boolean | string>('PAYMENTS_SANDBOX_ENABLED', false);
    return value === true || value === 'true';
  }

  async createLink(input: CreatePaymentLinkInput): Promise<CreatedPaymentLink> {
    if (!this.isEnabled()) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: this.provider,
        reason: 'sandbox_disabled',
      });
    }
    const webUrl = this.config
      .get<string>('WEB_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    return { url: `${webUrl}/pago/${input.token}`, externalId: null };
  }

  verifyWebhook(): boolean {
    // Sandbox no recibe webhooks: la confirmación es explícita por endpoint.
    return false;
  }

  parseWebhook(): ParsedPaymentEvent {
    throw new AppException('VALIDATION_FAILED', 400, {
      reason: 'webhook_not_supported',
      provider: this.provider,
    });
  }
}
