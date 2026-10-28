import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatRepository } from './chat.repository';
import { ChatService } from './chat.service';

@Module({
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
})
export class ChatModule {}
