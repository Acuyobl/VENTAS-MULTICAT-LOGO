import { describe, expect, it } from 'vitest';
import type { Product, SocialPost } from '@prisma/client';
import { formatMoney } from '@ventascatalogo/contracts';
import { MockImageProvider } from './mock-image.provider';

const post = {
  id: '01920000-0000-7000-8000-000000000001',
  organizationId: '01920000-0000-7000-8000-000000000002',
  catalogId: '01920000-0000-7000-8000-000000000003',
  catalogVersionId: '01920000-0000-7000-8000-000000000004',
  platform: 'INSTAGRAM',
  tone: 'CERCANO',
  goal: 'VENTAS',
  title: 'Café de altura',
  body: 'Hecho en Costa Rica',
  hashtags: ['#Café'],
  cta: 'Escribinos por WhatsApp',
  visualSuggestion: 'Fondo crema',
  imageKey: null,
  imagePrompt: null,
  imageProvider: null,
  imageModel: null,
  productIds: [],
  status: 'DRAFT',
  promptTemplateKey: 'social-post',
  promptVersion: 3,
  aiProvider: 'mock',
  aiModel: 'mock-social-v1',
  tokensIn: 1,
  tokensOut: 1,
  costMicroUsd: 0,
  scheduledFor: null,
  publishedAt: null,
  approvedByUserId: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as SocialPost;

const product = {
  id: '01920000-0000-7000-8000-000000000005',
  name: 'Café de altura',
  priceMinor: 6_000n,
  currency: 'CRC',
} as unknown as Product;

describe('MockImageProvider', () => {
  it('devuelve un SVG determinista como Buffer', async () => {
    const provider = new MockImageProvider();
    const first = await provider.generate({ prompt: 'prompt', post, products: [product] });
    const second = await provider.generate({ prompt: 'prompt', post, products: [product] });

    expect(first.contentType).toBe('image/svg+xml');
    expect(first.ext).toBe('svg');
    expect(first.buffer.equals(second.buffer)).toBe(true);
    const svg = first.buffer.toString('utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Café de altura');
    expect(svg).toContain(formatMoney(6_000n, 'CRC'));
    expect(svg).toContain('VentasCatálogo');
    expect(provider.name).toBe('mock');
  });
});
