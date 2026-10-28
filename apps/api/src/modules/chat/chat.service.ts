import { Injectable } from '@nestjs/common';
import type {
  AuthenticatedUser,
  ChatMessage as ChatMessageDto,
  ChatMessageListResponse,
  ConversationListResponse,
} from '@ventascatalogo/contracts';
import type { ChatMessage } from '@prisma/client';
import { ChatRepository, type ConversationWithMeta } from './chat.repository';
import { AppException } from '../../common/errors/app-exception';
import { AuditService } from '../audit/audit.service';
import type { AuditMeta } from '../../common/audit/audit.types';

@Injectable()
export class ChatService {
  constructor(
    private readonly repo: ChatRepository,
    private readonly audit: AuditService,
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
    const message = await this.repo.createStaffMessage({
      conversationId: conversation.id,
      senderUserId: user.id,
      body,
    });

    await this.audit.write({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: 'chat.message_sent',
      entityType: 'chat_message',
      entityId: message.id,
      after: { conversationId: conversation.id, body },
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
