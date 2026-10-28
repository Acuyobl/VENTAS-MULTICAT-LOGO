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

describe('buildMockSocialSvg · foto del producto', () => {
  it('usa la foto como fondo a sangre con overlay y data:image', () => {
    const photoDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const svg = buildMockSocialSvg({ ...base, photoDataUri, variant: 3 });
    expect(svg).toContain(`<image href="${photoDataUri}" x="0" y="0" width="1080" height="1080"`);
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('id="overlay"');
    expect(svg).toContain('data-photo="true"');
    expect(svg).toContain('data-variant="3"');
    expect(svg).toContain('Café de altura');
    expect(svg).toContain('CRC 6 000');
  });

  it('sin foto usa el degradado y marca data-photo=false', () => {
    const svg = buildMockSocialSvg({ ...base, photoDataUri: null });
    expect(svg).toContain('data-photo="false"');
    expect(svg).not.toContain('<image ');
    expect(svg).toContain('fill="url(#bg)"');
  });

  it('distinta variant cambia el SVG', () => {
    const first = buildMockSocialSvg({ ...base, photoDataUri: null, variant: 1 });
    const second = buildMockSocialSvg({ ...base, photoDataUri: null, variant: 2 });
    expect(first).not.toBe(second);
  });
});

describe('buildMockSocialSvg · diseños configurables', () => {
  const photoDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

  it('genera los 3 diseños con data-design y data-photo', () => {
    const classic = buildMockSocialSvg({ ...base, design: 'CLASICA', photoDataUri });
    const editorial = buildMockSocialSvg({ ...base, design: 'EDITORIAL', photoDataUri });
    const promo = buildMockSocialSvg({ ...base, design: 'PROMO', photoDataUri });

    expect(classic).toContain('data-design="CLASICA"');
    expect(editorial).toContain('data-design="EDITORIAL"');
    expect(promo).toContain('data-design="PROMO"');
    for (const svg of [classic, editorial, promo]) {
      expect(svg).toContain(`data:image/png;base64,`);
      expect(svg).toContain('data-photo="true"');
      expect(svg.startsWith('<svg ')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
    }
    expect(new Set([classic, editorial, promo]).size).toBe(3);
  });

  it('EDITORIAL usa panel crema y la foto a la derecha', () => {
    const svg = buildMockSocialSvg({ ...base, design: 'EDITORIAL', photoDataUri });
    expect(svg).toContain('fill="#fbf8f1"');
    expect(svg).toContain('x="486"');
    expect(svg).toContain('font-family="Georgia, serif"');
    expect(svg).toContain('text-decoration="underline"');
  });

  it('PROMO usa badge OFERTA, banda diagonal y píldora', () => {
    const svg = buildMockSocialSvg({ ...base, design: 'PROMO', photoDataUri });
    expect(svg).toContain('OFERTA');
    expect(svg).toContain('rotate(-12');
    expect(svg).toContain('rx="46"');
    expect(svg).toContain('#ff7a59');
  });

  it('sin foto cada diseño mantiene data-photo=false y su degradado', () => {
    for (const design of ['CLASICA', 'EDITORIAL', 'PROMO'] as const) {
      const svg = buildMockSocialSvg({ ...base, design });
      expect(svg).toContain('data-photo="false"');
      expect(svg).not.toContain('<image ');
      expect(svg).toContain(`data-design="${design}"`);
    }
  });
});
