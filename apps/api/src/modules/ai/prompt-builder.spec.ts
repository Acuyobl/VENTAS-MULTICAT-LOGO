import { describe, expect, it } from 'vitest';
import { buildSocialPrompt } from './prompt-builder';

const products = [
  {
    sku: 'DEMO-001',
    name: 'Café de altura',
    description: 'Tueste medio',
    price: 'CRC 6 000',
    currency: 'CRC' as const,
    category: 'Despensa',
    stock: 11,
  },
  {
    sku: 'DEMO-002',
    name: 'Miel de abeja',
    description: null,
    price: 'CRC 7 000',
    currency: 'CRC' as const,
    category: null,
    stock: 12,
  },
];

describe('buildSocialPrompt', () => {
  it('incluye catálogo, productos, stock e instrucciones extra', () => {
    const prompt = buildSocialPrompt({
      brandVoice: 'Catálogo Demo. Productos hechos a mano en Costa Rica.',
      platform: 'INSTAGRAM',
      tone: 'CERCANO',
      goal: 'VENTAS',
      products,
      extraInstructions: 'Mencioná envío gratis en San José.',
    });

    expect(prompt.templateKey).toBe('social-post');
    expect(prompt.version).toBe(3);
    expect(prompt.user).toContain('Plataforma: instagram');
    expect(prompt.user).toContain('Tono: profesional');
    expect(prompt.user).toContain('Objetivo: venta');
    expect(prompt.user).toContain('Café de altura');
    expect(prompt.user).toContain('DEMO-001');
    expect(prompt.user).toContain('CRC 6 000');
    expect(prompt.user).toContain('11 unidades disponibles');
    expect(prompt.user).toContain('Mencioná envío gratis en San José.');
    expect(prompt.system).toContain('JSON');
  });

  it('mapea tonos y objetivos alternativos', () => {
    const prompt = buildSocialPrompt({
      brandVoice: 'voz',
      platform: 'TIKTOK',
      tone: 'DIVERTIDO',
      goal: 'EDUCATIVO',
      products,
    });
    expect(prompt.user).toContain('Tono: humoristico');
    expect(prompt.user).toContain('Objetivo: educativo');
    expect(prompt.user).not.toContain('Instrucciones extra');
  });
});
