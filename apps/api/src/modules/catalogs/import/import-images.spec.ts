import { describe, expect, it, vi } from 'vitest';
import { isHttpImageUrl, resolveImportImages } from './import-images';
import type { ImportProductRow } from './row-validator';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function row(overrides: Partial<ImportProductRow> = {}): ImportProductRow {
  return {
    rowNumber: 2,
    sku: 'SKU-1',
    name: 'Producto',
    description: null,
    category: null,
    brand: null,
    priceMinor: 1000n,
    costMinor: null,
    stock: null,
    imageRef: null,
    rawData: { SKU: 'SKU-1', Nombre: 'Producto', Imagen: '' },
    ...overrides,
  };
}

interface ImageDepsMock {
  catalogId: string;
  catalogVersionId: string;
  download: ReturnType<typeof vi.fn>;
  upload: ReturnType<typeof vi.fn>;
}

function deps(overrides: Partial<ImageDepsMock> = {}): ImageDepsMock {
  return {
    catalogId: 'catalog-1',
    catalogVersionId: 'version-1',
    download: vi.fn().mockResolvedValue({ buffer: PNG_BYTES, contentType: 'image/png' }),
    upload: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('isHttpImageUrl', () => {
  it('solo acepta http(s)', () => {
    expect(isHttpImageUrl('https://cdn.example.com/a.png')).toBe(true);
    expect(isHttpImageUrl('http://127.0.0.1:8080/a.png')).toBe(true);
    expect(isHttpImageUrl('img/a.png')).toBe(false);
    expect(isHttpImageUrl('ftp://cdn.example.com/a.png')).toBe(false);
    expect(isHttpImageUrl('')).toBe(false);
  });
});

describe('resolveImportImages', () => {
  it('descarga, sube y devuelve la key cuando la imagen es una URL válida', async () => {
    const imageDeps = deps();
    const result = await resolveImportImages(
      [row({ imageRef: 'https://cdn.example.com/foto.png' })],
      imageDeps,
    );

    expect(result.warnings).toEqual([]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.imageKey).toBeTruthy();
    expect(imageDeps.upload).toHaveBeenCalledWith(
      result.products[0]?.imageKey,
      PNG_BYTES,
      'image/png',
    );
  });

  it('una descarga fallida deja warning IMAGE_DOWNLOAD_FAILED y el producto sin imagen', async () => {
    const imageDeps = deps({
      download: vi.fn().mockRejectedValue(new Error('HTTP 403')),
    });
    const result = await resolveImportImages(
      [row({ imageRef: 'https://cdn.example.com/foto.png' })],
      imageDeps,
    );

    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings[0]).toMatchObject({
      severity: 'warning',
      code: 'IMAGE_DOWNLOAD_FAILED',
    });
  });

  it('un valor relativo genera IMAGE_UNRESOLVED y no inventa una key', async () => {
    const imageDeps = deps();
    const result = await resolveImportImages([row({ imageRef: 'img/sku-001.jpg' })], imageDeps);

    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings[0]).toMatchObject({
      severity: 'warning',
      code: 'IMAGE_UNRESOLVED',
    });
    expect(result.warnings[0]?.message).toContain('img/sku-001.jpg');
    expect(imageDeps.download).not.toHaveBeenCalled();
  });

  it('sin columna de imagen no genera warnings', async () => {
    const result = await resolveImportImages([row({ imageRef: null })], deps());
    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('descarga con concurrencia máxima de 3 y preserva el orden', async () => {
    let active = 0;
    let maxActive = 0;
    const imageDeps = deps({
      download: vi.fn().mockImplementation(async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { buffer: PNG_BYTES, contentType: 'image/png' };
      }),
    });
    const rows = Array.from({ length: 7 }, (_, index) =>
      row({
        rowNumber: index + 2,
        sku: `SKU-${index + 1}`,
        imageRef: `https://cdn.example.com/foto-${index + 1}.png`,
      }),
    );

    const result = await resolveImportImages(rows, imageDeps);

    expect(maxActive).toBeLessThanOrEqual(3);
    expect(maxActive).toBeGreaterThan(1);
    expect(result.warnings).toEqual([]);
    expect(result.products.map((product) => product.sku)).toEqual(rows.map((item) => item.sku));
    expect(result.products.every((product) => product.imageKey !== null)).toBe(true);
  });
});
