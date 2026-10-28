import { describe, expect, it } from 'vitest';
import { detectImageContentType, stableVariant, toDataUri } from './image-data-uri';

describe('image-data-uri', () => {
  it('detecta PNG, JPEG, WEBP y SVG por contenido', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
    expect(detectImageContentType(png)).toBe('image/png');
    expect(detectImageContentType(jpeg)).toBe('image/jpeg');
    expect(detectImageContentType(webp)).toBe('image/webp');
    expect(detectImageContentType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe(
      'image/svg+xml',
    );
  });

  it('arma un data URI base64 y el variant es determinista', () => {
    const buffer = Buffer.from('hola');
    expect(toDataUri(buffer, 'image/png')).toBe(
      `data:image/png;base64,${buffer.toString('base64')}`,
    );
    expect(stableVariant('a|b|c')).toBe(stableVariant('a|b|c'));
    expect(stableVariant('a')).not.toBe(stableVariant('b'));
  });
});
