import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappBaileysService } from './whatsapp-baileys.service';

export interface WhatsappSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

/**
 * Cliente de WhatsApp unificado:
 * 1. Soporta conexión por código QR (Baileys) vinculada en tiempo real.
 * 2. Si no hay sesión QR activa, recurre a Meta Cloud API si cuenta con tokens.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly baileys?: WhatsappBaileysService,
  ) {}

  isConfigured(organizationId?: string): boolean {
    if (organizationId && this.baileys?.isConnected(organizationId)) {
      return true;
    }
    return Boolean(
      this.config.get<string>('WHATSAPP_ACCESS_TOKEN') &&
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID'),
    );
  }

  async sendText(to: string, body: string, organizationId?: string): Promise<WhatsappSendResult> {
    // 1. Intento por sesión QR activa (Baileys)
    if (organizationId && this.baileys?.isConnected(organizationId)) {
      return this.baileys.sendMessage(organizationId, to, body);
    }

    // 2. Fallback a WhatsApp Cloud API (Meta)
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
