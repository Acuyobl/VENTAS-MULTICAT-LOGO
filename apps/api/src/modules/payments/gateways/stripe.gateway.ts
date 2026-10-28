import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PaymentProvider } from '@ventascatalogo/contracts';
import { AppException } from '../../../common/errors/app-exception';
import type {
  CreatePaymentLinkInput,
  CreatedPaymentLink,
  PaymentGateway,
} from '../payment-gateway';
import { parseStripeWebhookEvent, type ParsedPaymentEvent } from '../stripe-events';
import { verifyStripeSignature } from '../stripe-signature';

const STRIPE_API = 'https://api.stripe.com/v1';

/**
 * Adaptador Stripe sin SDK: Checkout Session vía `fetch` y webhook HMAC-SHA256.
 * La `STRIPE_SECRET_KEY` solo se usa server-side y nunca se loguea.
 */
@Injectable()
export class StripeGateway implements PaymentGateway {
  readonly provider: PaymentProvider = 'STRIPE';
  private readonly logger = new Logger(StripeGateway.name);

  constructor(private readonly config: ConfigService) {}

  async createLink(input: CreatePaymentLinkInput): Promise<CreatedPaymentLink> {
    const secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    if (!secretKey) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: this.provider,
        reason: 'gateway_not_configured',
      });
    }

    const webUrl = this.config
      .get<string>('WEB_PUBLIC_URL', 'http://localhost:3000')
      .replace(/\/+$/, '');
    const returnUrl = `${webUrl}/pago/${input.token}`;
    const body = new URLSearchParams({
      mode: 'payment',
      success_url: returnUrl,
      cancel_url: returnUrl,
      client_reference_id: input.orderId,
      'metadata[orderId]': input.orderId,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': input.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': input.amountMinor.toString(),
      'line_items[0][price_data][product_data][name]': `Pedido ${input.orderNumber}`,
    });

    let response: Response;
    try {
      response = await fetch(`${STRIPE_API}/checkout/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch (error) {
      this.logger.error({ err: error }, 'stripe_create_link_network_error');
      throw new AppException('PAYMENT_PROVIDER_UNAVAILABLE', 502, {
        provider: this.provider,
      });
    }

    if (!response.ok) {
      this.logger.error({ status: response.status }, 'stripe_create_link_failed');
      throw new AppException('PAYMENT_PROVIDER_UNAVAILABLE', 502, {
        provider: this.provider,
        status: response.status,
      });
    }

    const session = (await response.json()) as { id?: string; url?: string };
    if (!session.url) {
      throw new AppException('PAYMENT_PROVIDER_UNAVAILABLE', 502, {
        provider: this.provider,
        reason: 'missing_checkout_url',
      });
    }
    return { url: session.url, externalId: session.id ?? null };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
    if (!secret) return false;
    const header = headers['stripe-signature'];
    const signature = Array.isArray(header) ? header[0] : header;
    return verifyStripeSignature(signature, rawBody, secret);
  }

  parseWebhook(rawBody: Buffer): ParsedPaymentEvent {
    return parseStripeWebhookEvent(rawBody);
  }
}
