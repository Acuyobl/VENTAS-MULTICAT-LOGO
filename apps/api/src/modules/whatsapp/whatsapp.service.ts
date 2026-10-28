import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsappSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

/**
 * Cliente mínimo de WhatsApp Cloud API (Meta) sin SDK. Si faltan credenciales
 * (`WHATSAPP_ACCESS_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`) el remitente queda como
 * no configurado y los endpoints deben responder 409 `INTEGRATION_NOT_CONFIGURED`.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('WHATSAPP_ACCESS_TOKEN') &&
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
    );
  }

  async sendText(to: string, body: string): Promise<WhatsappSendResult> {
    const token = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneNumberId) {
      return { ok: false, messageId: null, error: 'whatsapp_not_configured' };
    }
    const version = this.config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: false, body },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) {
        const error = `whatsapp_http_${response.status}: ${payload.error?.message ?? 'error'}`;
        this.logger.error({ to, status: response.status }, 'whatsapp_send_failed');
        return { ok: false, messageId: null, error: error.slice(0, 300) };
      }
      return { ok: true, messageId: payload.messages?.[0]?.id ?? null, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'whatsapp_error';
      this.logger.error({ err: error, to }, 'whatsapp_send_exception');
      return { ok: false, messageId: null, error: message.slice(0, 300) };
    }
  }
}
