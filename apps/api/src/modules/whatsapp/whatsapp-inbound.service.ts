import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { verifyWhatsappSignature } from './whatsapp-signature';

interface CloudApiMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface CloudApiPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: CloudApiMessage[];
      };
    }>;
  }>;
}

@Injectable()
export class WhatsappInboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Sin `WHATSAPP_APP_SECRET` configurado no se exige firma (modo demo). */
  verifySignature(header: string | undefined, rawBody: Buffer | undefined): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET', '');
    if (!secret) return true;
    if (!rawBody) return false;
    return verifyWhatsappSignature(header, rawBody, secret);
  }

  /** Procesa cada mensaje de texto: cliente + conversación + mensaje CUSTOMER. */
  async process(payload: CloudApiPayload): Promise<number> {
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
        const messages = value.messages ?? [];
        const contactName = value.contacts?.[0]?.profile?.name?.trim() || null;
        for (const message of messages) {
          if (message.type !== 'text' || !message.text?.body || !message.from) continue;
          const body = message.text.body.trim();
          if (!body) continue;

          const phone = `+${message.from.replace(/[^0-9]/g, '')}`;
          const customer =
            (await this.prisma.customer.findFirst({
              where: {
                organizationId: organization.id,
                deletedAt: null,
                OR: [{ phone }, { phone: message.from }],
              },
            })) ??
            (await this.prisma.customer.create({
              data: {
                organizationId: organization.id,
                type: 'PERSON',
                name: contactName ?? phone,
                phone,
              },
            }));

          const conversation =
            (await this.prisma.chatConversation.findFirst({
              where: {
                organizationId: organization.id,
                catalogId: catalog.id,
                customerId: customer.id,
                status: 'OPEN',
              },
              orderBy: { createdAt: 'desc' },
            })) ??
            (await this.prisma.chatConversation.create({
              data: {
                organizationId: organization.id,
                catalogId: catalog.id,
                customerId: customer.id,
                subject: 'WhatsApp',
                status: 'OPEN',
                channel: 'WHATSAPP',
                externalId: message.from,
              },
            }));

          await this.prisma.$transaction(async (tx) => {
            const created = await tx.chatMessage.create({
              data: {
                conversationId: conversation.id,
                senderType: 'CUSTOMER',
                body,
              },
            });
            await tx.chatConversation.update({
              where: { id: conversation.id },
              data: {
                lastMessageAt: created.createdAt,
                channel: 'WHATSAPP',
                externalId: message.from,
              },
            });
          });
          processed += 1;
        }
      }
    }
    return processed;
  }
}
