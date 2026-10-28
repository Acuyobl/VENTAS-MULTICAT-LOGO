import { Module } from '@nestjs/common';
import { WhatsappInboundService } from './whatsapp-inbound.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  controllers: [WhatsappWebhookController],
  providers: [WhatsappService, WhatsappInboundService],
  exports: [WhatsappService, WhatsappInboundService],
})
export class WhatsappModule {}
