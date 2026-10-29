import { describe, expect, it } from 'vitest';
import { MockAiProvider } from './mock-ai.provider';
import { parseSocialPostText } from './social-post.parser';
import { buildSocialPrompt } from './prompt-builder';
import { buildImagePrompt, TONE_IMAGE_STYLE } from './image/image-prompt';
import type { Product } from '@prisma/client';

const platforms = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'LINKEDIN'] as const;
const tones = ['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM'] as const;
const goals = ['VENTAS', 'LANZAMIENTO', 'RECORDATORIO', 'EDUCATIVO'] as const;

function requestFor(platform: string, tone: string, goal: string) {
  const prompt = buildSocialPrompt({
    brandVoice: 'Catálogo Demo',
    platform: platform as (typeof platforms)[number],
    tone: tone as (typeof tones)[number],
    goal: goal as (typeof goals)[number],
    products: [
      {
        sku: 'DEMO-001',
        name: 'Café de altura',
        description: 'Tueste medio',
        price: 'CRC 6 000',
        currency: 'CRC',
        category: 'Despensa',
        stock: 11,
      },
    ],
  });
  return {
    model: 'deepseek-chat',
    messages: [
      { role: 'system' as const, content: prompt.system },
      { role: 'user' as const, content: prompt.user },
    ],
    maxOutputTokens: 1200,
    temperature: 0.7,
  };
}

describe('MockAiProvider · plataforma/tono/objetivo', () => {
  it('varía título, CTA, hashtags y visualSuggestion según la combinación', async () => {
    const provider = new MockAiProvider();
    const seen = new Map<string, Set<string>>();
    const ctas = new Set<string>();
    const hashtagSets = new Set<string>();
    for (const platform of platforms) {
      for (const tone of tones) {
        for (const goal of goals) {
          const result = await provider.complete(requestFor(platform, tone, goal));
          const parsed = parseSocialPostText(result.text);
          ctas.add(parsed.cta);
          hashtagSets.add(parsed.hashtags.join(' '));
          seen.set(`${platform}/${tone}/${goal}`, new Set([parsed.title]));
          expect(parsed.body.length).toBeGreaterThan(20);
          expect(parsed.visualSuggestion).toBeTruthy();
        }
      }
    }
    // 4 objetivos → 4 CTA distintos; 5 plataformas → al menos 4 sets de hashtags.
    expect(ctas.size).toBe(4);
    expect(hashtagSets.size).toBe(5);
    expect(new Set([...seen.values()].map((titles) => [...titles][0])).size).toBeGreaterThan(10);
  });

  it('es determinista para la misma combinación', async () => {
    const provider = new MockAiProvider();
    const first = await provider.complete(requestFor('INSTAGRAM', 'CERCANO', 'VENTAS'));
    const second = await provider.complete(requestFor('INSTAGRAM', 'CERCANO', 'VENTAS'));
    expect(first.text).toBe(second.text);
  });

  it('el prompt incluye la metadata explícita de los tres campos', () => {
    const prompt = buildSocialPrompt({
      brandVoice: 'voz',
      platform: 'WHATSAPP',
      tone: 'PREMIUM',
      goal: 'RECORDATORIO',
      products: [],
    });
    expect(prompt.user).toContain(
      'Metadatos: plataforma=WHATSAPP; tono=PREMIUM; objetivo=RECORDATORIO',
    );
  });
});

describe('buildImagePrompt · plataforma/tono/objetivo', () => {
  const product = {
    id: '01920000-0000-7000-8000-000000000001',
    catalogId: '01920000-0000-7000-8000-000000000002',
    catalogVersionId: '01920000-0000-7000-8000-000000000003',
    sku: 'DEMO-001',
    name: 'Café de altura',
    description: 'Tueste medio',
    category: 'Despensa',
    brand: null,
    priceMinor: 6_000n,
    costMinor: 0n,
    stock: 11,
    currency: 'CRC',
    imageKey: null,
    attributes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as Product;

  it('incluye plataforma, tono, objetivo y el estilo visual del tono', () => {
    const prompt = buildImagePrompt({
      post: {
        title: 'Café premium',
        cta: 'Reservá el tuyo',
        visualSuggestion: null,
        platform: 'TIKTOK',
        tone: 'DIVERTIDO',
        goal: 'LANZAMIENTO',
      },
      products: [product],
    });
    expect(prompt).toContain('Plataforma: TIKTOK.');
    expect(prompt).toContain('Tono: DIVERTIDO.');
    expect(prompt).toContain('Objetivo: LANZAMIENTO.');
    expect(prompt).toContain(TONE_IMAGE_STYLE.DIVERTIDO);
    expect(prompt).toContain('mantené el producto reconocible');
  });
});
