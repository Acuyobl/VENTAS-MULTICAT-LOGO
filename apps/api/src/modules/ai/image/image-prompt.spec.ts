import { describe, expect, it } from 'vitest';
import { formatMoney } from '@ventascatalogo/contracts';
import { buildImagePrompt } from './image-prompt';
import type { Product } from '@prisma/client';

const post = {
  title: 'Café de altura para tu semana',
  cta: 'Escribinos por WhatsApp',
  visualSuggestion: 'Fondo crema con taza humeante',
  platform: 'INSTAGRAM',
};

const product = {
  id: '01920000-0000-7000-8000-000000000001',
  catalogId: '01920000-0000-7000-8000-000000000002',
  catalogVersionId: '01920000-0000-7000-8000-000000000003',
  sku: 'DEMO-001',
  name: 'Café de altura',
  description: 'Tueste medio',
  category: 'Despensa',
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

describe('buildImagePrompt', () => {
  it('incluye título, producto, precio, CTA, estilo y marca', () => {
    const prompt = buildImagePrompt({ post, products: [product] });
    expect(prompt).toContain('1080x1080');
    expect(prompt).toContain('Café de altura para tu semana');
    expect(prompt).toContain('Café de altura');
    expect(prompt).toContain(formatMoney(6_000n, 'CRC'));
    expect(prompt).toContain('Escribinos por WhatsApp');
    expect(prompt).toContain('Fondo crema con taza humeante');
    expect(prompt).toContain('VentasCatálogo');
    expect(prompt).toContain('mantené el producto reconocible');
    expect(prompt).not.toContain('Instrucciones adicionales');
  });

  it('agrega el prompt custom al final', () => {
    const prompt = buildImagePrompt({
      post,
      products: [product],
      customPrompt: 'Estilo minimalista con fondo oscuro',
    });
    expect(prompt).toContain('Instrucciones adicionales: Estilo minimalista con fondo oscuro');
  });
});
