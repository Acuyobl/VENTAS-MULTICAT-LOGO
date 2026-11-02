import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  chatMessageCreateSchema,
  type AuthenticatedUser,
  type ChatAttachment,
  type ChatMessage,
  type ChatMessageCreateInput,
  type ChatMessageImportResponse,
  type ChatMessageListResponse,
  type ConversationListResponse,
} from '@ventascatalogo/contracts';
import { ChatService } from './chat.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

const idSchema = z.string().uuid();
const statusQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'PENDING']).optional(),
});
const chatImportSchema = z.object({ mode: z.enum(['REPLACE', 'MERGE']).optional() }).strict();

@Controller('chat')
@Audience('staff')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversations')
  @RequirePermissions('chat:write')
  listConversations(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(statusQuerySchema)) query: { status?: string },
  ): Promise<ConversationListResponse> {
    return this.chat.listConversations(user.organizationId, query.status);
  }

  @Get('messages/:messageId/attachment')
  @RequirePermissions('chat:write')
  getAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', new ZodValidationPipe(idSchema)) messageId: string,
  ): Promise<ChatAttachment> {
    return this.chat.getAttachment(user.organizationId, messageId);
  }

  @Post('messages/:messageId/import')
  @HttpCode(201)
  @RequirePermissions('catalog:write')
  importAttachment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId', new ZodValidationPipe(idSchema)) messageId: string,
    @Body(new ZodValidationPipe(chatImportSchema)) body: z.infer<typeof chatImportSchema>,
    @Req() req: RequestWithTrace,
  ): Promise<ChatMessageImportResponse> {
    return this.chat.importAttachment(user, messageId, body.mode, salesMetaFrom(req));
  }

  @Get('conversations/:id/messages')
  @RequirePermissions('chat:write')
  getMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
  ): Promise<ChatMessageListResponse> {
    return this.chat.getMessages(user.organizationId, id);
  }

  @Post('conversations/:id/messages')
  @HttpCode(201)
  @RequirePermissions('chat:write')
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ZodValidationPipe(idSchema)) id: string,
    @Body(new ZodValidationPipe(chatMessageCreateSchema)) body: ChatMessageCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ChatMessage> {
    return this.chat.sendStaffMessage(user, id, body.body, salesMetaFrom(req));
  }
}
