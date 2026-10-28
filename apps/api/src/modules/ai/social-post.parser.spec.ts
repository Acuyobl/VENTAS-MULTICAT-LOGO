import { describe, expect, it } from 'vitest';
import { parseSocialPostText } from './social-post.parser';

describe('parseSocialPostText', () => {
  it('parsea JSON válido con hashtags y visualSuggestion', () => {
    const parsed = parseSocialPostText(
      JSON.stringify({
        title: 'Café de altura',
        body: 'Hecho en Costa Rica.',
        hashtags: ['#Café', 'CostaRica'],
        cta: 'Escribinos',
        visualSuggestion: 'Foto con luz natural',
      }),
    );
    expect(parsed).toEqual({
      title: 'Café de altura',
      body: 'Hecho en Costa Rica.',
      hashtags: ['#Café', '#CostaRica'],
      cta: 'Escribinos',
      visualSuggestion: 'Foto con luz natural',
    });
  });

  it('tolera bloques markdown y texto alrededor del JSON', () => {
    const parsed = parseSocialPostText(
      '```json\n{"title":"Miel","body":"Dulce de verdad","hashtags":["#Miel"],"cta":"Pedí la tuya"}\n```',
    );
    expect(parsed.title).toBe('Miel');
    expect(parsed.body).toBe('Dulce de verdad');
    expect(parsed.hashtags).toEqual(['#Miel']);
    expect(parsed.cta).toBe('Pedí la tuya');
    expect(parsed.visualSuggestion).toBeNull();
  });

  it('cae a texto plano cuando no hay JSON', () => {
    const parsed = parseSocialPostText(
      '# Café de altura\n\nHecho a mano en lotes pequeños.\n\n#CaféDeAltura #CostaRica\nEscribinos por WhatsApp.',
    );
    expect(parsed.title).toBe('Café de altura');
    expect(parsed.body).toContain('Hecho a mano');
    expect(parsed.hashtags).toEqual(['#CaféDeAltura', '#CostaRica']);
    expect(parsed.cta).toBe('Escribinos por WhatsApp.');
    expect(parsed.visualSuggestion).toBeNull();
  });

  it('nunca rompe con texto vacío', () => {
    const parsed = parseSocialPostText('');
    expect(parsed.title.length).toBeGreaterThan(0);
    expect(parsed.body.length).toBeGreaterThan(0);
    expect(parsed.cta.length).toBeGreaterThan(0);
    expect(parsed.hashtags).toEqual([]);
  });
});
