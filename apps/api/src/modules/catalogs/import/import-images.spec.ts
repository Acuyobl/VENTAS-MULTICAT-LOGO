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
    expect(result.products[0]?.imageKey).toMatch(
      /^products\/catalog-1\/version-1\/[0-9a-f-]{36}-[a-f0-9]{12}\.png$/,
    );
    expect(imageDeps.download).toHaveBeenCalledWith('https://cdn.example.com/foto.png');
    expect(imageDeps.upload).toHaveBeenCalledTimes(1);
    const [key, buffer, contentType] = imageDeps.upload.mock.calls[0] as [string, Buffer, string];
    expect(key).toBe(result.products[0]?.imageKey);
    expect(buffer.equals(PNG_BYTES)).toBe(true);
    expect(contentType).toBe('image/png');
  });

  it('genera un id distinto por producto', async () => {
    const result = await resolveImportImages(
      [row({ sku: 'A' }), row({ rowNumber: 3, sku: 'B' })],
      deps(),
    );
    const ids = result.products.map((product) => product.id);
    expect(new Set(ids).size).toBe(2);
  });

  it('una descarga rota deja warning IMAGE_DOWNLOAD_FAILED y el producto sin imagen', async () => {
    const imageDeps = deps({
      download: vi.fn().mockRejectedValue(new Error('La descarga respondió HTTP 404.')),
    });

    const result = await resolveImportImages(
      [row({ imageRef: 'https://cdn.example.com/falta.png', rawData: { SKU: 'SKU-1' } })],
      imageDeps,
    );

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({
      rowNumber: 2,
      severity: 'warning',
      code: 'IMAGE_DOWNLOAD_FAILED',
      rawData: { SKU: 'SKU-1' },
    });
    expect(result.warnings[0]?.message).toContain('HTTP 404');
  });

  it('una subida fallida a MinIO también deja warning y no bloquea la fila', async () => {
    const imageDeps = deps({
      upload: vi.fn().mockRejectedValue(new Error('El almacenamiento no está disponible.')),
    });

    const result = await resolveImportImages(
      [row({ imageRef: 'https://cdn.example.com/foto.png' })],
      imageDeps,
    );

    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings[0]).toMatchObject({ code: 'IMAGE_DOWNLOAD_FAILED' });
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
});
