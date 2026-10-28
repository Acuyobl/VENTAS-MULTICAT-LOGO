import { describe, expect, it } from 'vitest';
import { buildImageDesignCatalog, IMAGE_DESIGNS } from './image-designs';

describe('buildImageDesignCatalog', () => {
  it('devuelve los 3 diseños con previews SVG embebidas', () => {
    const catalog = buildImageDesignCatalog();
    expect(catalog.items.map((item) => item.key)).toEqual(['CLASICA', 'EDITORIAL', 'PROMO']);
    expect(IMAGE_DESIGNS).toHaveLength(3);
    for (const item of catalog.items) {
      expect(item.label.length).toBeGreaterThan(2);
      expect(item.description.length).toBeGreaterThan(10);
      expect(item.previewDataUri).toMatch(/^data:image\/svg\+xml;base64,/);
      const svg = Buffer.from(item.previewDataUri.split(',')[1]!, 'base64').toString('utf8');
      expect(svg).toContain(`data-design="${item.key}"`);
      expect(svg).toContain('data-photo="false"');
      expect(svg).toContain('VentasCatálogo');
    }
  });

  it('es determinista y liviano (< 200 KB en total)', () => {
    const first = buildImageDesignCatalog();
    const second = buildImageDesignCatalog();
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    const total = first.items.reduce(
      (sum, item) => sum + Buffer.byteLength(item.previewDataUri, 'utf8'),
      0,
    );
    expect(total).toBeLessThan(200_000);
  });
});
