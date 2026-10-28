import { Injectable } from '@nestjs/common';
import type { ChatConversation, ChatMessage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** `ChatConversation` no tiene relación Prisma con `Customer`: se resuelve aparte. */
export type ConversationWithMeta = ChatConversation & {
  customerName: string | null;
  messages: Array<Pick<ChatMessage, 'body' | 'createdAt'>>;
};

@Injectable()
export class ChatRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(
    organizationId: string,
    status?: string,
  ): Promise<ConversationWithMeta[]> {
    const conversations = await this.prisma.chatConversation.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
    });
    const customerNames = await this.customerNames(
      conversations
        .map((conversation) => conversation.customerId)
        .filter((id): id is string => Boolean(id)),
    );
    return conversations.map(({ messages, ...conversation }) => ({
      ...conversation,
      messages,
      customerName: conversation.customerId
        ? (customerNames.get(conversation.customerId) ?? null)
        : null,
    }));
  }

  unreadCounts(conversationIds: string[]): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return Promise.resolve(new Map());
    return this.prisma.chatMessage
      .groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: conversationIds },
          senderType: 'CUSTOMER',
          readAt: null,
        },
        _count: { _all: true },
      })
      .then((rows) => new Map(rows.map((row) => [row.conversationId, row._count._all] as const)));
  }

  async findConversation(
    organizationId: string,
    id: string,
  ): Promise<(ChatConversation & { customerName: string | null }) | null> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: { id, organizationId },
    });
    if (!conversation) return null;
    const names = conversation.customerId
      ? await this.customerNames([conversation.customerId])
      : new Map<string, string>();
    return {
      ...conversation,
      customerName: conversation.customerId ? (names.get(conversation.customerId) ?? null) : null,
    };
  }

  listMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  markCustomerMessagesRead(conversationId: string): Promise<number> {
    return this.prisma.chatMessage
      .updateMany({
        where: { conversationId, senderType: 'CUSTOMER', readAt: null },
        data: { readAt: new Date() },
      })
      .then((result) => result.count);
  }

  async createStaffMessage(input: {
    conversationId: string;
    senderUserId: string;
    body: string;
  }): Promise<ChatMessage> {
    return this.prisma.$transaction(async (tx) => {
      const message = await tx.chatMessage.create({
        data: {
          conversationId: input.conversationId,
          senderType: 'STAFF',
          senderUserId: input.senderUserId,
          body: input.body,
        },
      });
      await tx.chatConversation.update({
        where: { id: input.conversationId },
        data: { lastMessageAt: message.createdAt },
      });
      return message;
    });
  }

  private async customerNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(customers.map((customer) => [customer.id, customer.name]));
  }
}
