import { Module } from '@nestjs/common';
import { WhatsappInboundService } from './whatsapp-inbound.service';
import { WhatsappService } from './whatsapp.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappBaileysService } from './whatsapp-baileys.service';
import { WhatsappSessionController } from './whatsapp-session.controller';

@Module({
  controllers: [WhatsappWebhookController, WhatsappSessionController],
  providers: [WhatsappService, WhatsappInboundService, WhatsappBaileysService],
  exports: [WhatsappService, WhatsappInboundService, WhatsappBaileysService],
})
export class WhatsappModule {}
