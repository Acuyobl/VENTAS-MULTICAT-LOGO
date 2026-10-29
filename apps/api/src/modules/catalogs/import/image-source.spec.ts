import { describe, expect, it } from 'vitest';
import { decodeDataUriImage, isDataUriImage } from './image-source';
import { MAX_PRODUCT_IMAGE_BYTES } from '../../storage/image-utils';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('isDataUriImage', () => {
  it('detecta data URIs de imagen', () => {
    expect(isDataUriImage(`data:image/png;base64,${PNG.toString('base64')}`)).toBe(true);
    expect(isDataUriImage(`data:image/jpeg;base64,${PNG.toString('base64')}`)).toBe(true);
    expect(isDataUriImage('https://cdn.example.com/a.png')).toBe(false);
    expect(isDataUriImage('data:text/plain;base64,aG9sYQ==')).toBe(false);
    expect(isDataUriImage('')).toBe(false);
  });
});

describe('decodeDataUriImage', () => {
  it('decodifica PNG/JPEG/WebP válidos', () => {
    for (const mime of ['png', 'jpeg', 'webp']) {
      const result = decodeDataUriImage(`data:image/${mime};base64,${PNG.toString('base64')}`);
      expect(result.contentType).toBe(`image/${mime}`);
      expect(result.buffer.equals(PNG)).toBe(true);
    }
  });

  it('acepta base64 con saltos de línea', () => {
    const base64 = PNG.toString('base64').replace(/(.{8})/g, '$1\n');
    const result = decodeDataUriImage(`data:image/png;base64,${base64}`);
    expect(result.buffer.equals(PNG)).toBe(true);
  });

  it('rechaza mime no permitido', () => {
    expect(() => decodeDataUriImage('data:image/gif;base64,R0lGODlhAQAB')).toThrow(
      /JPEG\/PNG\/WebP/,
    );
    expect(() => decodeDataUriImage('data:image/svg+xml;base64,PHN2Zy8+')).toThrow(
      /JPEG\/PNG\/WebP/,
    );
  });

  it('rechaza base64 inválido o vacío', () => {
    expect(() => decodeDataUriImage('data:image/png;base64,###')).toThrow(/base64/);
    expect(() => decodeDataUriImage('data:image/png;base64,')).toThrow(/base64/);
  });

  it('rechaza imágenes de más de 5 MB', () => {
    const oversized = Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 1).toString('base64');
    expect(() => decodeDataUriImage(`data:image/png;base64,${oversized}`)).toThrow(/5 MB/);
  });
});
