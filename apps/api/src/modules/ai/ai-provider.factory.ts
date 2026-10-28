import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekProvider, type AiProvider } from '@ventascatalogo/ai';
import { MockAiProvider } from './mock-ai.provider';
import { AppException } from '../../common/errors/app-exception';

/**
 * Resuelve el proveedor de IA según `AI_PROVIDER`:
 * - `deepseek`: requiere `DEEPSEEK_API_KEY` (sin key → 409 INTEGRATION_NOT_CONFIGURED).
 * - `mock`: determinista, solo fuera de producción.
 */
@Injectable()
export class AiProviderFactory {
  constructor(private readonly config: ConfigService) {}

  createProvider(): AiProvider {
    const provider = this.config.get<string>('AI_PROVIDER', 'deepseek');
    if (provider === 'mock') {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
          provider: 'mock',
          reason: 'mock_forbidden_in_production',
        });
      }
      return new MockAiProvider();
    }
    if (provider !== 'deepseek') {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider,
        reason: 'unknown_ai_provider',
      });
    }

    const apiKey = this.config.get<string>('DEEPSEEK_API_KEY', '');
    if (!apiKey) {
      throw new AppException('INTEGRATION_NOT_CONFIGURED', 409, {
        provider: 'deepseek',
        reason: 'missing_api_key',
      });
    }
    return new DeepSeekProvider({
      apiKey,
      baseUrl: this.config.get<string>('DEEPSEEK_BASE_URL', 'https://api.deepseek.com/v1'),
      timeoutMs: this.config.get<number>('AI_TIMEOUT_MS', 45_000),
      maxRetries: this.config.get<number>('AI_MAX_RETRIES', 3),
    });
  }

  modelName(provider: AiProvider): string {
    if (provider instanceof MockAiProvider) return provider.model;
    return this.config.get<string>('AI_MODEL_DEFAULT', 'deepseek-chat');
  }
}
