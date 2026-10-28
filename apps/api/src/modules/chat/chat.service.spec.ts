import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@prisma/client';
import { toCustomerChatMessage } from './chat.service';

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: '01920000-0000-7000-8000-000000000001',
    conversationId: '01920000-0000-7000-8000-000000000002',
    senderType: 'CUSTOMER',
    senderUserId: null,
    body: 'Hola',
    readAt: null,
    createdAt: new Date('2026-10-28T15:00:00Z'),
    ...overrides,
  } as ChatMessage;
}

describe('toCustomerChatMessage', () => {
  it('cliente → su nombre; staff → nombre del usuario; sistema → marca', () => {
    const customer = toCustomerChatMessage(message(), 'María Solís', new Map());
    expect(customer.senderName).toBe('María Solís');

    const staff = toCustomerChatMessage(
      message({
        senderType: 'STAFF',
        senderUserId: '01920000-0000-7000-8000-000000000003',
      }),
      'María Solís',
      new Map([['01920000-0000-7000-8000-000000000003', 'Sofía Staff']]),
    );
    expect(staff.senderName).toBe('Sofía Staff');

    const system = toCustomerChatMessage(message({ senderType: 'SYSTEM' }), 'María', new Map());
    expect(system.senderName).toBe('VentasCatálogo');
  });
});
