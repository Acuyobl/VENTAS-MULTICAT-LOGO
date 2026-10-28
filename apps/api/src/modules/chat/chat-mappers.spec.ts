import { describe, expect, it } from 'vitest';
import { toChatMessage, toConversationSummary } from './chat.service';
import type { ConversationWithMeta } from './chat.repository';
import type { ChatMessage } from '@prisma/client';

const conversation: ConversationWithMeta = {
  id: '01920000-0000-7000-8000-000000000001',
  organizationId: '01920000-0000-7000-8000-000000000002',
  catalogId: '01920000-0000-7000-8000-000000000003',
  customerId: '01920000-0000-7000-8000-000000000004',
  orderId: null,
  assignedToUserId: null,
  status: 'OPEN',
  subject: 'Consulta de demo',
  lastMessageAt: new Date('2026-10-28T18:00:00.000Z'),
  createdAt: new Date('2026-10-28T17:00:00.000Z'),
  updatedAt: new Date('2026-10-28T18:00:00.000Z'),
  customerName: 'Cliente Demo',
  messages: [
    {
      body: 'Un mensaje largo que se recorta en el preview '.repeat(5),
      createdAt: new Date('2026-10-28T18:00:00.000Z'),
    },
  ],
};

describe('chat mappers', () => {
  it('resume conversación con preview recortado y no leídos', () => {
    const summary = toConversationSummary(conversation, new Map([[conversation.id, 2]]));
    expect(summary.customerName).toBe('Cliente Demo');
    expect(summary.unreadCount).toBe(2);
    expect(summary.lastMessagePreview?.length).toBe(120);
    expect(summary.lastMessageAt).toBe('2026-10-28T18:00:00.000Z');
  });

  it('sin mensajes deja preview null y unread 0', () => {
    const summary = toConversationSummary({ ...conversation, messages: [] }, new Map());
    expect(summary.lastMessagePreview).toBeNull();
    expect(summary.unreadCount).toBe(0);
  });

  it('mapea mensaje con fechas ISO', () => {
    const message = toChatMessage({
      id: '01920000-0000-7000-8000-000000000009',
      conversationId: conversation.id,
      senderUserId: null,
      senderType: 'CUSTOMER',
      body: 'Hola',
      attachmentKey: null,
      readAt: null,
      createdAt: new Date('2026-10-28T18:00:00.000Z'),
    } satisfies ChatMessage);
    expect(message).toEqual({
      id: '01920000-0000-7000-8000-000000000009',
      senderType: 'CUSTOMER',
      senderName: null,
      body: 'Hola',
      readAt: null,
      createdAt: '2026-10-28T18:00:00.000Z',
    });
  });
});
