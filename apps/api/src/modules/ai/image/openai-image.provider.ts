import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import type { GeneratedImage, ImageGenerationInput, ImageProvider } from './image-provider';

export interface OpenAiImageConfig {
  apiKey: string;
  model: string;
}

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
}

/**
 * Adaptador de imágenes de OpenAI sin SDK: `POST /v1/images/generations` con
 * `response_format: b64_json`, timeout de 60 s, devuelve PNG.
 */
@Injectable()
export class OpenAiImageProvider implements ImageProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAiImageProvider.name);

  constructor(private readonly config: OpenAiImageConfig) {}

  get model(): string {
    return this.config.model;
  }

  async generate(input: ImageGenerationInput): Promise<GeneratedImage> {
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: input.prompt,
          size: '1024x1024',
          n: 1,
          response_format: 'b64_json',
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      this.logger.error({ err: error }, 'openai_image_request_failed');
      throw new AppException('AI_PROVIDER_ERROR', 502, {
        provider: 'openai',
        reason: 'network_error',
      });
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAiImageResponse;
    if (!response.ok) {
      this.logger.error({ status: response.status }, 'openai_image_http_error');
      throw new AppException('AI_PROVIDER_ERROR', 502, {
        provider: 'openai',
        status: response.status,
        message: payload.error?.message?.slice(0, 200),
      });
    }
    const b64 = payload.data?.[0]?.b64_json;
    if (!b64) {
      throw new AppException('AI_PROVIDER_ERROR', 502, {
        provider: 'openai',
        reason: 'missing_b64_json',
      });
    }
    return {
      buffer: Buffer.from(b64, 'base64'),
      contentType: 'image/png',
      ext: 'png',
    };
  }
}
