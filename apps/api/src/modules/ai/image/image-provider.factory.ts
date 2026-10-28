import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app-exception';
import { MockImageProvider } from './mock-image.provider';
import { OpenAiImageProvider } from './openai-image.provider';
import type { ImageProvider } from './image-provider';

/** Resuelve `IMAGE_PROVIDER=mock|openai` (default mock). */
@Injectable()
export class ImageProviderFactory {
  constructor(private readonly config: ConfigService) {}

  createProvider(): ImageProvider {
    const provider = this.config.get<string>('IMAGE_PROVIDER', 'mock');
    if (provider === 'mock') {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
          provider: 'mock',
          reason: 'mock_forbidden_in_production',
        });
      }
      return new MockImageProvider();
    }
    if (provider !== 'openai') {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider,
        reason: 'unknown_image_provider',
      });
    }
    const apiKey = this.config.get<string>('OPENAI_API_KEY', '');
    if (!apiKey) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: 'openai',
        reason: 'missing_api_key',
      });
    }
    return new OpenAiImageProvider({
      apiKey,
      model: this.config.get<string>('OPENAI_IMAGE_MODEL', 'gpt-image-1'),
    });
  }
}
