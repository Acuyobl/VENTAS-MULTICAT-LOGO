import { describe, expect, it } from 'vitest';
import { buildMockSocialSvg } from './svg-image';
import { buildImageDesignCatalog } from './image-designs';

const base = {
  title: 'Café de altura',
  cta: 'Pedí el tuyo',
  productName: 'Café de altura',
  productPrice: 'CRC 6 000',
  photoDataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
};

describe('SVG por plataforma/tono/objetivo', () => {
  it('expone data-platform, data-tone y data-goal', () => {
    const svg = buildMockSocialSvg({
      ...base,
      platform: 'TIKTOK',
      tone: 'DIVERTIDO',
      goal: 'LANZAMIENTO',
    });
    expect(svg).toContain('data-platform="TIKTOK"');
    expect(svg).toContain('data-tone="DIVERTIDO"');
    expect(svg).toContain('data-goal="LANZAMIENTO"');
    expect(svg).toContain('TIKTOK');
    expect(svg).toContain('NUEVO');
    expect(svg).toContain('#ff7a59');
  });

  it('la insignia de objetivo cambia por objetivo', () => {
    const expectBadge: Record<string, string> = {
      VENTAS: 'OFERTA',
      LANZAMIENTO: 'NUEVO',
      RECORDATORIO: 'ÚLTIMOS DÍAS',
      EDUCATIVO: 'APRENDÉ',
    };
    for (const [goal, badge] of Object.entries(expectBadge)) {
      const svg = buildMockSocialSvg({
        ...base,
        goal: goal as 'VENTAS' | 'LANZAMIENTO' | 'RECORDATORIO' | 'EDUCATIVO',
      });
      expect(svg).toContain(badge);
    }
  });

  it('la paleta cambia por tono en los 3 diseños', () => {
    const tones = ['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM'] as const;
    for (const design of ['CLASICA', 'EDITORIAL', 'PROMO'] as const) {
      const svgs = tones.map((tone) => buildMockSocialSvg({ ...base, design, tone }));
      expect(new Set(svgs).size).toBe(4);
      expect(svgs[0]).toContain('#f6d58b'); // CERCANO
      expect(svgs[1]).toContain('#7fc6a5'); // PROFESIONAL
      expect(svgs[2]).toContain('#ffd166'); // DIVERTIDO
      expect(svgs[3]).toContain('#e6c26a'); // PREMIUM
    }
  });

  it('distintas plataformas producen insignias con su color', () => {
    const instagram = buildMockSocialSvg({ ...base, platform: 'INSTAGRAM' });
    const whatsapp = buildMockSocialSvg({ ...base, platform: 'WHATSAPP' });
    expect(instagram).toContain('#e1306c');
    expect(whatsapp).toContain('#25d366');
    expect(instagram).not.toBe(whatsapp);
  });

  it('misma combinación produce el mismo SVG (determinista)', () => {
    const input = {
      ...base,
      platform: 'LINKEDIN' as const,
      tone: 'PROFESIONAL' as const,
      goal: 'EDUCATIVO' as const,
      design: 'EDITORIAL' as const,
      variant: 42,
    };
    expect(buildMockSocialSvg(input)).toBe(buildMockSocialSvg(input));
  });

  it('las previews del catálogo siguen siendo válidas y llevan data-design', () => {
    for (const item of buildImageDesignCatalog().items) {
      expect(item.previewDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(Buffer.from(item.previewDataUri.split(',')[1]!, 'base64').toString('utf8')).toContain(
        `data-design="${item.key}"`,
      );
    }
  });
});
