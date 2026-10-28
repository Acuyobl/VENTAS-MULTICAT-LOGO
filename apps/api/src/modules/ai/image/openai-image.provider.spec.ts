import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product, SocialPost } from '@prisma/client';
import { OpenAiImageProvider } from './openai-image.provider';
import { ImageProviderFactory } from './image-provider.factory';
import type { ConfigService } from '@nestjs/config';
import { MockImageProvider } from './mock-image.provider';

const post = { id: 'p-1', title: 'T', cta: 'C' } as unknown as SocialPost;
const products: Product[] = [];

function config(values: Record<string, unknown>): ConfigService {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as unknown as ConfigService;
}

describe('OpenAiImageProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('convierte b64_json en un PNG', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiImageProvider({ apiKey: 'sk-test', model: 'gpt-image-1' });

    const result = await provider.generate({ prompt: 'foto de café', post, products });

    expect(result.contentType).toBe('image/png');
    expect(result.ext).toBe('png');
    expect(result.buffer.equals(png)).toBe(true);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(options.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-image-1',
      size: '1024x1024',
      response_format: 'b64_json',
    });
  });

  it('con foto del producto usa /images/edits con multipart', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new OpenAiImageProvider({ apiKey: 'sk-test', model: 'gpt-image-1' });

    const result = await provider.generate({
      prompt: 'foto de café',
      post,
      products,
      productImage: { buffer: png, contentType: 'image/png' },
    });

    expect(result.contentType).toBe('image/png');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    // En multipart el navegador/fetch pone el Content-Type con boundary.
    expect((options.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(options.body).toBeInstanceOf(FormData);
    const form = options.body as FormData;
    expect(form.get('model')).toBe('gpt-image-1');
    expect(form.get('size')).toBe('1024x1024');
    expect(form.get('response_format')).toBe('b64_json');
    expect(form.get('image')).toBeInstanceOf(Blob);
    expect(form.get('prompt')).toContain('Mantené el producto de la foto reconocible');
  });
  it('un HTTP no-2xx responde AI_PROVIDER_ERROR 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));
    const provider = new OpenAiImageProvider({ apiKey: 'sk-test', model: 'gpt-image-1' });
    await expect(provider.generate({ prompt: 'x', post, products })).rejects.toMatchObject({
      code: 'AI_PROVIDER_ERROR',
    });
  });
});

describe('ImageProviderFactory', () => {
  it('por defecto crea el provider mock', () => {
    const factory = new ImageProviderFactory(config({ IMAGE_PROVIDER: 'mock' }));
    expect(factory.createProvider()).toBeInstanceOf(MockImageProvider);
  });

  it('openai sin OPENAI_API_KEY → 409 INTEGRATION_NOT_CONFIGURED', () => {
    const factory = new ImageProviderFactory(
      config({ IMAGE_PROVIDER: 'openai', OPENAI_API_KEY: '' }),
    );
    const error = (() => {
      try {
        factory.createProvider();
      } catch (caught) {
        return caught;
      }
      return null;
    })();
    expect(error).toMatchObject({
      code: 'INTEGRATION_NOT_CONFIGURED',
      details: { provider: 'openai' },
    });
  });

  it('openai con key crea el adapter y respeta el modelo', () => {
    const factory = new ImageProviderFactory(
      config({
        IMAGE_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test',
        OPENAI_IMAGE_MODEL: 'gpt-image-1',
      }),
    );
    const provider = factory.createProvider();
    expect(provider.name).toBe('openai');
    expect(provider.model).toBe('gpt-image-1');
  });

  it('mock en producción está prohibido', () => {
    const factory = new ImageProviderFactory(
      config({ IMAGE_PROVIDER: 'mock', NODE_ENV: 'production' }),
    );
    expect(() => factory.createProvider()).toThrow();
  });
});
