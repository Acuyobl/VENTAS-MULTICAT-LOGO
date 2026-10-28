import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  chatMessageCreateSchema,
  type AuthenticatedUser,
  type ChatMessage,
  type ChatMessageCreateInput,
  type CustomerChat,
} from '@ventascatalogo/contracts';
import { ChatService } from './chat.service';
import { salesMetaFrom, type RequestWithTrace } from '../sales/sales-meta';
import { Audience } from '../../common/decorators/audience.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/**
 * Chat del cliente en el portal (aud=customer). El `CustomerAccount` se resuelve
 * desde la sesión: nunca se acepta `customerId` por body o query.
 */
@Controller('me/chat')
@Audience('customer')
@RequirePermissions('self:chat:write')
export class CustomerChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  getChat(@CurrentUser() user: AuthenticatedUser): Promise<CustomerChat> {
    return this.chat.getCustomerChat(user);
  }

  @Post('messages')
  @HttpCode(201)
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(chatMessageCreateSchema)) body: ChatMessageCreateInput,
    @Req() req: RequestWithTrace,
  ): Promise<ChatMessage> {
    return this.chat.sendCustomerMessage(user, body.body, salesMetaFrom(req));
  }
}
