import { describe, expect, it } from 'vitest';
import {
  ALLOWED_IMAGE_CONTENT_TYPES,
  MAX_PRODUCT_IMAGE_BYTES,
  extensionForContentType,
  isAllowedImageContentType,
  normalizeContentType,
  productImageKey,
  validateProductImageFile,
} from './image-utils';

const CATALOG_ID = '01920000-0000-7000-8000-000000000001';
const VERSION_ID = '01920000-0000-7000-8000-000000000002';
const PRODUCT_ID = '01920000-0000-7000-8000-000000000003';
const CHECKSUM = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';

function keyInput(overrides: Partial<Parameters<typeof productImageKey>[0]> = {}) {
  return {
    catalogId: CATALOG_ID,
    catalogVersionId: VERSION_ID,
    productId: PRODUCT_ID,
    checksum: CHECKSUM,
    ext: 'png',
    ...overrides,
  };
}

describe('normalizeContentType / isAllowedImageContentType', () => {
  it('normaliza mayúsculas y parámetros', () => {
    expect(normalizeContentType('Image/PNG; charset=binary')).toBe('image/png');
    expect(normalizeContentType(null)).toBe('');
    expect(normalizeContentType(undefined)).toBe('');
  });

  it('acepta solo los cuatro formatos permitidos', () => {
    for (const contentType of ALLOWED_IMAGE_CONTENT_TYPES) {
      expect(isAllowedImageContentType(contentType)).toBe(true);
    }
    expect(isAllowedImageContentType('IMAGE/WEBP')).toBe(true);
    expect(isAllowedImageContentType('image/gif')).toBe(false);
    expect(isAllowedImageContentType('text/plain')).toBe(false);
    expect(isAllowedImageContentType('')).toBe(false);
  });
});

describe('extensionForContentType', () => {
  it('mapea content-type a extensión canónica', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(extensionForContentType('image/png')).toBe('png');
    expect(extensionForContentType('image/webp')).toBe('webp');
    expect(extensionForContentType('image/svg+xml')).toBe('svg');
    expect(extensionForContentType('image/gif')).toBeNull();
  });
});

describe('productImageKey', () => {
  it('arma products/{catalogId}/{versionId}/{productId}-{checksum12}.{ext}', () => {
    expect(productImageKey(keyInput())).toBe(
      `products/${CATALOG_ID}/${VERSION_ID}/${PRODUCT_ID}-a1b2c3d4e5f6.png`,
    );
  });

  it('normaliza extensión con punto y mayúsculas', () => {
    expect(productImageKey(keyInput({ ext: '.SVG' }))).toBe(
      `products/${CATALOG_ID}/${VERSION_ID}/${PRODUCT_ID}-a1b2c3d4e5f6.svg`,
    );
  });

  it('rechaza checksum o extensión inválidos', () => {
    expect(() => productImageKey(keyInput({ checksum: 'xyz' }))).toThrow(
      'product_image_checksum_invalid',
    );
    expect(() => productImageKey(keyInput({ ext: 'demasiado-larga' }))).toThrow(
      'product_image_ext_invalid',
    );
  });
});

describe('validateProductImageFile', () => {
  it('rechaza archivo ausente o vacío', () => {
    expect(validateProductImageFile({ buffer: null })).toMatchObject({
      ok: false,
      reason: 'missing',
    });
    expect(
      validateProductImageFile({ buffer: Buffer.alloc(0), mimetype: 'image/png' }),
    ).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('rechaza más de 5 MB', () => {
    const oversized = Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1, 0x89);
    expect(validateProductImageFile({ buffer: oversized, mimetype: 'image/png' })).toMatchObject({
      ok: false,
      reason: 'too_large',
    });
  });

  it('acepta un PNG dentro del límite', () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    expect(
      validateProductImageFile({ buffer, mimetype: 'image/png', size: buffer.length }),
    ).toEqual({
      ok: true,
      contentType: 'image/png',
      ext: 'png',
      size: 4,
    });
  });

  it('acepta exactamente 5 MB', () => {
    const buffer = Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES, 0x89);
    expect(validateProductImageFile({ buffer, mimetype: 'image/jpeg' })).toMatchObject({
      ok: true,
      ext: 'jpg',
    });
  });

  it('rechaza content-types fuera de la lista blanca', () => {
    expect(
      validateProductImageFile({ buffer: Buffer.from('gif'), mimetype: 'image/gif' }),
    ).toMatchObject({ ok: false, reason: 'unsupported_type' });
    expect(
      validateProductImageFile({ buffer: Buffer.from('pdf'), mimetype: 'application/pdf' }),
    ).toMatchObject({ ok: false, reason: 'unsupported_type' });
  });
});
