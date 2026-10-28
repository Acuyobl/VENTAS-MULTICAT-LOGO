import { describe, expect, it } from 'vitest';
import { MockAiProvider } from './mock-ai.provider';
import { parseSocialPostText } from './social-post.parser';

const request = {
  model: 'deepseek-chat',
  messages: [
    { role: 'system' as const, content: 'sistema' },
    {
      role: 'user' as const,
      content:
        'Plataforma: instagram\nProductos: [{"sku":"DEMO-001","name":"Café de altura","price":"CRC 6 000","currency":"CRC"}]',
    },
  ],
  maxOutputTokens: 1200,
  temperature: 0.7,
};

describe('MockAiProvider', () => {
  it('es determinista y devuelve tokens > 0', async () => {
    const provider = new MockAiProvider();
    const first = await provider.complete(request);
    const second = await provider.complete(request);

    expect(first.provider).toBe('mock');
    expect(first.model).toBe('mock-social-v1');
    expect(first.text).toBe(second.text);
    expect(first.usage.tokensIn).toBeGreaterThan(0);
    expect(first.usage.tokensOut).toBeGreaterThan(0);
  });

  it('su salida parsea a un post con título, cuerpo, hashtags y CTA', async () => {
    const provider = new MockAiProvider();
    const result = await provider.complete(request);
    const parsed = parseSocialPostText(result.text);

    expect(parsed.title).toContain('Café de altura');
    expect(parsed.body.length).toBeGreaterThan(10);
    expect(parsed.hashtags.length).toBeGreaterThan(0);
    expect(parsed.hashtags.every((tag) => tag.startsWith('#'))).toBe(true);
    expect(parsed.cta.length).toBeGreaterThan(0);
  });

  it('soporta stream con un único chunk', async () => {
    const provider = new MockAiProvider();
    const chunks = [];
    for await (const chunk of provider.stream(request)) chunks.push(chunk);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].delta).toBeTruthy();
  });
});
