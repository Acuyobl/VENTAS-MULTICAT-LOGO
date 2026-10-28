import { z } from 'zod';
import { reminderSummarySchema } from '../reports/schemas';

export const chatMessageSenderSchema = z.enum(['STAFF', 'CUSTOMER', 'SYSTEM']);

export const conversationStatusSchema = z.enum(['OPEN', 'CLOSED', 'PENDING']);

export const conversationSummarySchema = z.object({
  id: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  customerName: z.string().nullable(),
  subject: z.string().nullable(),
  status: conversationStatusSchema,
  lastMessageAt: z.string().nullable(),
  unreadCount: z.number().int(),
  lastMessagePreview: z.string().nullable(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export const conversationListResponseSchema = z.object({
  items: z.array(conversationSummarySchema),
});

export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;

export const chatMessageSchema = z.object({
  id: z.string().uuid(),
  senderType: chatMessageSenderSchema,
  senderName: z.string().nullable(),
  body: z.string(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatMessageCreateSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
  })
  .strict();

export type ChatMessageCreateInput = z.infer<typeof chatMessageCreateSchema>;

export const chatMessageListResponseSchema = z.object({
  conversationId: z.string().uuid(),
  items: z.array(chatMessageSchema),
});

export type ChatMessageListResponse = z.infer<typeof chatMessageListResponseSchema>;

export const whatsappReminderResponseSchema = z.object({
  reminder: reminderSummarySchema,
  waMessageId: z.string().nullable(),
});

export type WhatsappReminderResponse = z.infer<typeof whatsappReminderResponseSchema>;
