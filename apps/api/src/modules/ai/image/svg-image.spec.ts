import { describe, expect, it } from 'vitest';
import { buildMockSocialSvg, escapeXml } from './svg-image';

const base = {
  title: 'Café de altura',
  cta: 'Escribinos por WhatsApp',
  productName: 'Café de altura',
  productPrice: 'CRC 6 000',
  brand: 'VentasCatálogo',
};

describe('buildMockSocialSvg', () => {
  it('genera un SVG 1080×1080 con título, precio y marca', () => {
    const svg = buildMockSocialSvg(base);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
    expect(svg).toContain('viewBox="0 0 1080 1080"');
    expect(svg).toContain('Café de altura');
    expect(svg).toContain('CRC 6 000');
    expect(svg).toContain('Escribinos por WhatsApp');
    expect(svg).toContain('VentasCatálogo');
    expect(svg).toContain('linearGradient');
  });

  it('es determinista (mismo input, mismo SVG)', () => {
    expect(buildMockSocialSvg(base)).toBe(buildMockSocialSvg(base));
  });

  it('escapa caracteres peligrosos para XML', () => {
    const svg = buildMockSocialSvg({
      ...base,
      title: 'Café <barato> & "rico"',
      cta: "Pedí <ya> & 'ya'",
    });
    expect(svg).not.toContain('<barato>');
    expect(svg).not.toContain('<ya>');
    expect(svg).toContain('&lt;barato&gt;');
    expect(svg).toContain('&amp;');
    expect(svg).toContain('&quot;rico&quot;');
    expect(svg).toContain('&apos;ya&apos;');
  });

  it('sin producto no imprime el bloque de precio', () => {
    const svg = buildMockSocialSvg({
      title: 'Solo texto',
      cta: 'Escribinos',
      productName: null,
      productPrice: null,
    });
    expect(svg).not.toContain('font-size="64"');
    expect(svg).toContain('Solo texto');
  });

  it('escapeXml cubre los cinco caracteres', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('estructura XML válida: etiquetas de texto balanceadas y una sola raíz', () => {
    const svg = buildMockSocialSvg(base);
    const opens = (svg.match(/<text /g) ?? []).length;
    const closes = (svg.match(/<\/text>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect((svg.match(/<svg /g) ?? []).length).toBe(1);
    expect((svg.match(/<\/svg>/g) ?? []).length).toBe(1);
  });
});
