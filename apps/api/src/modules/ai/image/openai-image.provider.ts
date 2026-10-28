import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app-exception';
import { detectImageContentType } from './image-data-uri';
import type { GeneratedImage, ImageGenerationInput, ImageProvider } from './image-provider';

export interface OpenAiImageConfig {
  apiKey: string;
  model: string;
}

interface OpenAiImageResponse {
  data?: Array<{ b64_json?: string }>;
  error?: { message?: string };
}

const GENERATIONS_URL = 'https://api.openai.com/v1/images/generations';
const EDITS_URL = 'https://api.openai.com/v1/images/edits';
const TIMEOUT_MS = 60_000;

/**
 * Adaptador de imágenes de OpenAI sin SDK: si hay foto del producto usa
 * `/images/edits` (multipart) para mantenerla reconocible; si no, cae a
 * `/images/generations`. Devuelve PNG y respeta un timeout de 60 s.
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
    const photo = input.productImage;
    const response = photo
      ? await this.editWithPhoto(input, photo)
      : await this.generateFromScratch(input);

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

  private generateFromScratch(input: ImageGenerationInput): Promise<Response> {
    return this.request(GENERATIONS_URL, {
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  /** Edición multipart sobre la foto del producto. */
  private editWithPhoto(
    input: ImageGenerationInput,
    photo: NonNullable<ImageGenerationInput['productImage']>,
  ): Promise<Response> {
    const contentType = photo.contentType || detectImageContentType(photo.buffer);
    const extension =
      contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : contentType === 'image/svg+xml'
            ? 'svg'
            : 'jpg';
    const form = new FormData();
    form.append('image', new Blob([photo.buffer], { type: contentType }), `producto.${extension}`);
    form.append('prompt', `${input.prompt} Mantené el producto de la foto reconocible.`);
    form.append('model', this.config.model);
    form.append('size', '1024x1024');
    form.append('n', '1');
    form.append('response_format', 'b64_json');
    return this.request(EDITS_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      this.logger.error({ err: error }, 'openai_image_request_failed');
      throw new AppException('AI_PROVIDER_ERROR', 502, {
        provider: 'openai',
        reason: 'network_error',
      });
    }
  }
}
