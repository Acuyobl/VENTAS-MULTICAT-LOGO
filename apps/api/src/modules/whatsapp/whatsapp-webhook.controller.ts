import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { WhatsappInboundService } from './whatsapp-inbound.service';
import { Public } from '../../common/decorators/public.decorator';
import { AppException } from '../../common/errors/app-exception';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ConfigService } from '@nestjs/config';

const verificationQuerySchema = z.object({
  'hub.mode': z.string().optional(),
  'hub.verify_token': z.string().optional(),
  'hub.challenge': z.string().optional(),
});

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Webhook público de WhatsApp Cloud API: verificación GET de Meta y mensajes
 * entrantes. No depende de que el número saliente esté configurado.
 */
@Controller('webhooks')
export class WhatsappWebhookController {
  constructor(
    private readonly inbound: WhatsappInboundService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get('whatsapp')
  verify(
    @Query(new ZodValidationPipe(verificationQuerySchema))
    query: {
      'hub.mode'?: string;
      'hub.verify_token'?: string;
      'hub.challenge'?: string;
    },
    @Res({ passthrough: true }) response: Response,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN', '');
    const token = query['hub.verify_token'] ?? '';
    if (
      query['hub.mode'] !== 'subscribe' ||
      !expected ||
      token !== expected ||
      !query['hub.challenge']
    ) {
      throw new AppException('FORBIDDEN', 403, { reason: 'whatsapp_verification_failed' });
    }
    response.type('text/plain');
    return query['hub.challenge'];
  }

  @Public()
  @Post('whatsapp')
  @HttpCode(200)
  async receive(@Req() request: RawBodyRequest) {
    const signature = request.headers['x-hub-signature-256'];
    const header = Array.isArray(signature) ? signature[0] : signature;
    if (!this.inbound.verifySignature(header, request.rawBody)) {
      throw new AppException('UNAUTHORIZED', 401, { reason: 'whatsapp_signature_invalid' });
    }

    const payload =
      request.body && typeof request.body === 'object'
        ? (request.body as Record<string, unknown>)
        : {};
    const processed = await this.inbound.process(payload);
    return { received: true, processed };
  }
}
