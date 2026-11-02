import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { verifyWhatsappSignature } from './whatsapp-signature';
import {
  DEFAULT_WHATSAPP_API_VERSION,
  WHATSAPP_MEDIA_MAX_BYTES,
  downloadWhatsappMedia,
  parseInboundMedia,
  whatsappAttachmentKey,
  type DownloadedWhatsappMedia,
  type InboundMediaMessage,
} from './whatsapp-media';

interface CloudApiMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
}

interface CloudApiPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: CloudApiMessage[];
      };
    }>;
  }>;
}

export type WhatsappMediaDownloader = (
  media: InboundMediaMessage,
  options: { accessToken: string; apiVersion: string; maxBytes: number },
) => Promise<DownloadedWhatsappMedia | null>;

const defaultDownloader: WhatsappMediaDownloader = (media, options) =>
  downloadWhatsappMedia(media.mediaId, {
    accessToken: options.accessToken,
    apiVersion: options.apiVersion,
    maxBytes: options.maxBytes,
    filename: media.filename,
    mimeType: media.mimeType,
  });

@Injectable()
export class WhatsappInboundService {
  private readonly logger = new Logger(WhatsappInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {}

  /** Sin `WHATSAPP_APP_SECRET` configurado no se exige firma (modo demo). */
  verifySignature(header: string | undefined, rawBody: Buffer | undefined): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET', '');
    if (!secret) return true;
    if (!rawBody) return false;
    return verifyWhatsappSignature(header, rawBody, secret);
  }

  /** Procesa mensajes de texto y media (imagen/documento) del webhook. */
  async process(
    payload: CloudApiPayload,
    downloader: WhatsappMediaDownloader = defaultDownloader,
  ): Promise<number> {
    const orgSlug = this.config.get<string>('WHATSAPP_ORG_SLUG', 'demo');
    const organization = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: { id: true },
    });
    if (!organization) return 0;

    const catalog = await this.prisma.catalog.findFirst({
      where: { organizationId: organization.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!catalog) return 0;

    const entries = payload.entry ?? [];
    let processed = 0;
    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const contactName = value.contacts?.[0]?.profile?.name?.trim() || null;
        for (const message of value.messages ?? []) {
          if (!message.from || !message.id) continue;
          const { conversation } = await this.ensureConversation({
            organizationId: organization.id,
            catalogId: catalog.id,
            from: message.from,
            contactName,
          });

          if (message.type === 'text' && message.text?.body) {
            const body = message.text.body.trim();
            if (!body) continue;
            await this.createMessage(conversation.id, body, null);
            processed += 1;
            continue;
          }

          const media = parseInboundMedia(message);
          if (!media) continue;

          const downloaded = await this.downloadMedia(media, downloader);
          let attachmentKey: string | null = null;
          if (downloaded) {
            const key = whatsappAttachmentKey(organization.id, message.id, downloaded.extension);
            try {
              await this.storage.putDocument(key, downloaded.buffer, downloaded.mimeType);
              attachmentKey = key;
            } catch (error) {
              this.logger.warn({ err: error, messageId: media.id }, 'whatsapp_media_store_failed');
            }
          }

          const filename = media.filename ?? downloaded?.filename ?? 'Archivo';
          const body = attachmentKey
            ? media.caption?.trim() || `📎 ${filename}`
            : `⚠️ No pudimos adjuntar "${filename}": formato no soportado, archivo demasiado grande o fallo de descarga. Enviá otro archivo o escribí el pedido como texto.`;
          await this.createMessage(conversation.id, body, attachmentKey);
          processed += 1;
        }
      }
    }
    return processed;
  }

  private async downloadMedia(
    media: InboundMediaMessage,
    downloader: WhatsappMediaDownloader,
  ): Promise<DownloadedWhatsappMedia | null> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN', '');
    if (!accessToken) return null;
    const apiVersion =
      this.config.get<string>('WHATSAPP_API_VERSION') || DEFAULT_WHATSAPP_API_VERSION;
    const maxBytes =
      Number(this.config.get<string | number>('WHATSAPP_MEDIA_MAX_BYTES')) ||
      WHATSAPP_MEDIA_MAX_BYTES;
    try {
      return await downloader(media, { accessToken, apiVersion, maxBytes });
    } catch (error) {
      this.logger.warn({ err: error, messageId: media.id }, 'whatsapp_media_download_error');
      return null;
    }
  }

  private async createMessage(
    conversationId: string,
    body: string,
    attachmentKey: string | null,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const created = await tx.chatMessage.create({
        data: { conversationId, senderType: 'CUSTOMER', body, attachmentKey },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt, channel: 'WHATSAPP' },
      });
    });
  }

  private async ensureConversation(input: {
    organizationId: string;
    catalogId: string;
    from: string;
    contactName: string | null;
  }) {
    const phone = `+${input.from.replace(/[^0-9]/g, '')}`;
    const customer =
      (await this.prisma.customer.findFirst({
        where: {
          organizationId: input.organizationId,
          deletedAt: null,
          OR: [{ phone }, { phone: input.from }],
        },
      })) ??
      (await this.prisma.customer.create({
        data: {
          organizationId: input.organizationId,
          type: 'PERSON',
          name: input.contactName ?? phone,
          phone,
        },
      }));

    const conversation =
      (await this.prisma.chatConversation.findFirst({
        where: {
          organizationId: input.organizationId,
          catalogId: input.catalogId,
          customerId: customer.id,
          status: 'OPEN',
        },
        orderBy: { createdAt: 'desc' },
      })) ??
      (await this.prisma.chatConversation.create({
        data: {
          organizationId: input.organizationId,
          catalogId: input.catalogId,
          customerId: customer.id,
          subject: 'WhatsApp',
          status: 'OPEN',
          channel: 'WHATSAPP',
          externalId: input.from,
        },
      }));

    if (conversation.externalId !== input.from || conversation.channel !== 'WHATSAPP') {
      await this.prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { externalId: input.from, channel: 'WHATSAPP' },
      });
    }
    return { customer, conversation };
  }
}
