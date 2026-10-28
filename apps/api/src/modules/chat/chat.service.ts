import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ChatMessage as ChatMessageDto,
  ChatMessageListResponse,
  ConversationListResponse,
  CustomerChat,
} from '@ventascatalogo/contracts';
import type { ChatConversation, ChatMessage } from '@prisma/client';
import { ChatRepository, type ConversationWithMeta } from './chat.repository';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly audit: AuditService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async listConversations(
    organizationId: string,
    status?: string,
  ): Promise<ConversationListResponse> {
    const conversations = await this.repo.listConversations(organizationId, status);
    const unread = await this.repo.unreadCounts(conversations.map((row) => row.id));
    return {
      items: conversations.map((conversation) => toConversationSummary(conversation, unread)),
    };
  }

  async getMessages(
    organizationId: string,
    conversationId: string,
  ): Promise<ChatMessageListResponse> {
    const conversation = await this.repo.findConversation(organizationId, conversationId);
    if (!conversation) {
      throw new AppException('NOT_FOUND', 404, { resource: 'conversation' });
    }
    const messages = await this.repo.listMessages(conversation.id);
    // Abrir la conversación marca como leídos los mensajes del cliente.
    await this.repo.markCustomerMessagesRead(conversation.id);
    return {
      conversationId: conversation.id,
      items: messages.map(toChatMessage),
    };
  }

  /** Chat del portal: devuelve (o crea) la conversación WEB del cliente logueado. */
  async getCustomerChat(user: AuthenticatedUser): Promise<CustomerChat> {
    const { conversation, customerName } = await this.ensureCustomerConversation(user);
    const messages = await this.repo.listMessages(conversation.id);
    const staffNames = await this.repo.findUserNames(
      messages.map((message) => message.senderUserId).filter((id): id is string => Boolean(id)),
    );
    return {
      conversationId: conversation.id,
      channel: 'WEB',
      items: messages.map((message) => toCustomerChatMessage(message, customerName, staffNames)),
    };
  }

  /** Mensaje del cliente desde el portal; el staff lo ve como no leído. */
  async sendCustomerMessage(
    user: AuthenticatedUser,
    body: string,
    meta: AuditMeta,
  ): Promise<ChatMessageDto> {
    const { conversation, customerName } = await this.ensureCustomerConversation(user);
    const message = await this.repo.createCustomerMessage({
      conversationId: conversation.id,
      body,
    });
    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'chat.message_sent',
      entityType: 'chat_message',
      entityId: message.id,
      after: {
        conversationId: conversation.id,
        body,
        channel: 'WEB',
        customerId: conversation.customerId,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });
    return toCustomerChatMessage(message, customerName, new Map());
  }

  private async ensureCustomerConversation(user: AuthenticatedUser): Promise<{
    conversation: ChatConversation;
    customerName: string;
  }> {
    const account = await this.repo.findCustomerAccount(user.id, user.organizationId);
    if (!account) {
      throw new AppException('VALIDATION_FAILED', 409, { reason: 'customer_profile_missing' });
    }
    const customerName = account.customer.name;
    const existing = await this.repo.findOpenWebConversation(
      user.organizationId,
      account.customerId,
    );
    if (existing) return { conversation: existing, customerName };

    const catalog = await this.repo.findFirstActiveCatalog(user.organizationId);
    if (!catalog) {
      throw new AppException('NOT_FOUND', 404, { reason: 'no_catalog' });
    }
    const conversation = await this.repo.createWebConversation({
      organizationId: user.organizationId,
      catalogId: catalog.id,
      customerId: account.customerId,
      subject: 'Consulta desde el portal',
    });
    return { conversation, customerName };
  }
  async sendStaffMessage(
    user: AuthenticatedUser,
    conversationId: string,
    body: string,
    meta: AuditMeta,
  ): Promise<ChatMessageDto> {
    const conversation = await this.repo.findConversation(user.organizationId, conversationId);
    if (!conversation) {
      throw new AppException('NOT_FOUND', 404, { resource: 'conversation' });
    }

    const channel = conversation.channel === 'WHATSAPP' ? 'WHATSAPP' : 'WEB';
    let waMessageId: string | null = null;
    if (channel === 'WHATSAPP') {
      const phone =
        conversation.externalId ?? (await this.repo.findCustomerPhone(conversation.customerId));
      if (!phone) {
        throw new AppException('VALIDATION_FAILED', 422, {
          reason: 'customer_phone_missing',
          conversationId: conversation.id,
        });
      }
      if (!this.whatsapp.isConfigured()) {
        // Sin credenciales no se guarda el mensaje: el staff puede reintentar.
        throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
          provider: 'WHATSAPP',
          reason: 'whatsapp_not_configured',
        });
      }
      const sent = await this.whatsapp.sendText(phone, body);
      if (!sent.ok) {
        throw new AppException('INTERNAL_ERROR', 502, {
          reason: 'whatsapp_send_failed',
          error: sent.error,
        });
      }
      waMessageId = sent.messageId;
    }

    const message = await this.repo.createStaffMessage({
      conversationId: conversation.id,
      senderUserId: user.id,
      body,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: channel === 'WHATSAPP' ? 'chat.message_sent_channel' : 'chat.message_sent',
      entityType: 'chat_message',
      entityId: message.id,
      after: {
        conversationId: conversation.id,
        body,
        channel,
        ...(waMessageId ? { waMessageId } : {}),
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
      traceId: meta.traceId,
    });

    return toChatMessage(message);
  }
}

const PREVIEW_LENGTH = 120;

export function toConversationSummary(
  conversation: ConversationWithMeta,
  unread: Map<string, number>,
): ConversationListResponse['items'][number] {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    customerId: conversation.customerId,
    customerName: conversation.customerName,
    subject: conversation.subject,
    status: conversation.status as ConversationListResponse['items'][number]['status'],
    channel: conversation.channel === 'WHATSAPP' ? 'WHATSAPP' : 'WEB',
    lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
    unreadCount: unread.get(conversation.id) ?? 0,
    lastMessagePreview: lastMessage ? lastMessage.body.slice(0, PREVIEW_LENGTH) : null,
  };
}

export function toChatMessage(message: ChatMessage): ChatMessageDto {
  return {
    id: message.id,
    senderType: message.senderType as ChatMessageDto['senderType'],
    senderName: null,
    body: message.body,
    readAt: message.readAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

/** Nombre visible del remitente: staff → usuario, cliente → su nombre, sistema → marca. */
export function toCustomerChatMessage(
  message: ChatMessage,
  customerName: string,
  staffNames: Map<string, string>,
): ChatMessageDto {
  const senderName =
    message.senderType === 'STAFF'
      ? message.senderUserId
        ? (staffNames.get(message.senderUserId) ?? null)
        : null
      : message.senderType === 'CUSTOMER'
        ? customerName
        : 'VentasCatálogo';
  return {
    ...toChatMessage(message),
    senderName,
  };
}
