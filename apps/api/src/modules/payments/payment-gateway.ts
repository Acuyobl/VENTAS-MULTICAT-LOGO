import type { Currency, PaymentProvider } from '@ventascatalogo/contracts';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { SandboxGateway } from './gateways/sandbox.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import type { ParsedPaymentEvent } from './stripe-events';

export interface CreatePaymentLinkInput {
  orderId: string;
  orderNumber: string;
  amountMinor: bigint;
  currency: Currency;
  token: string;
  expiresAt: Date;
  organizationId?: string;
  secretKey?: string;
}

export interface CreatedPaymentLink {
  url: string;
  externalId: string | null;
}

/** Contrato que implementa cada pasarela; el resto de la API no conoce detalles. */
export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createLink(input: CreatePaymentLinkInput): Promise<CreatedPaymentLink>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(rawBody: Buffer): ParsedPaymentEvent;
}

/** Mapea el key de env/frontend (`sandbox`, `stripe`) al enum de Prisma. */
export function providerFromKey(key: string): PaymentProvider | null {
  switch (key.trim().toLowerCase()) {
    case 'sandbox':
      return 'SANDBOX';
    case 'stripe':
      return 'STRIPE';
    default:
      return null;
  }
}

@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways: Map<PaymentProvider, PaymentGateway>;

  constructor(sandbox: SandboxGateway, stripe: StripeGateway) {
    this.gateways = new Map<PaymentProvider, PaymentGateway>([
      [sandbox.provider, sandbox],
      [stripe.provider, stripe],
    ]);
  }

  get(provider: PaymentProvider): PaymentGateway | null {
    return this.gateways.get(provider) ?? null;
  }

  findByKey(key: string): PaymentGateway | null {
    const provider = providerFromKey(key);
    return provider ? this.get(provider) : null;
  }

  require(provider: PaymentProvider): PaymentGateway {
    const gateway = this.get(provider);
    if (!gateway) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider,
        reason: 'gateway_not_configured',
      });
    }
    return gateway;
  }
}
