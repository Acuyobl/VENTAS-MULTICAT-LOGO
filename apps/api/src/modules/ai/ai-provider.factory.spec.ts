import { describe, expect, it } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app-exception';
import { AiProviderFactory } from './ai-provider.factory';
import { MockAiProvider } from './mock-ai.provider';

function configWith(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('AiProviderFactory', () => {
  it('crea el provider mock en desarrollo', () => {
    const factory = new AiProviderFactory(configWith({ AI_PROVIDER: 'mock' }));
    expect(factory.createProvider()).toBeInstanceOf(MockAiProvider);
  });

  it('deepseek sin API key responde 409 INTEGRATION_NOT_CONFIGURED', () => {
    const factory = new AiProviderFactory(
      configWith({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: '' }),
    );
    const error = (() => {
      try {
        factory.createProvider();
      } catch (caught) {
        return caught;
      }
      return null;
    })();

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).code).toBe('INTEGRATION_NOT_CONFIGURED');
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).getResponse()).toMatchObject({
      details: { provider: 'deepseek', reason: 'missing_api_key' },
    });
  });

  it('crea deepseek cuando hay API key', () => {
    const factory = new AiProviderFactory(
      configWith({ AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'sk-test' }),
    );
    expect(factory.createProvider().name).toBe('deepseek');
  });

  it('mock en producción está prohibido (409)', () => {
    const factory = new AiProviderFactory(
      configWith({ AI_PROVIDER: 'mock', NODE_ENV: 'production' }),
    );
    expect(() => factory.createProvider()).toThrow(AppException);
  });
});
