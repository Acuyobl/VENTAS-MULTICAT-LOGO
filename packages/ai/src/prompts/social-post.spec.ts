import { describe, expect, it } from 'vitest';
import { computeCostMicroUsd } from '../budget/cost';
import { socialPostPrompt } from './social-post.v3';

describe('ai budget', () => {
  it('calcula micro-USD sin floats acumulados', () => {
    const cost = computeCostMicroUsd(1000, 500, {
      usdPer1kInput: 0.00027,
      usdPer1kOutput: 0.0011,
    });
    expect(cost).toBe(820);
  });

  it('la plantilla v3 inyecta precios del catálogo', () => {
    const prompt = socialPostPrompt.user({
      platform: 'instagram',
      tone: 'profesional',
      goal: 'venta',
      brandVoice: 'cercana',
      products: [
        {
          sku: 'DEMO-001',
          name: 'Producto demo 1',
          description: 'Descripción',
          price: 'CRC 6000',
          currency: 'CRC',
          category: 'General',
        },
      ],
    });
    expect(prompt).toContain('DEMO-001');
    expect(prompt).toContain('CRC 6000');
    expect(socialPostPrompt.version).toBe(3);
  });
});
