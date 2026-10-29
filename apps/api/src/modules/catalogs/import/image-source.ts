import { MAX_PRODUCT_IMAGE_BYTES } from '../../storage/image-utils';

export type DataUriImageFailure = 'unsupported_type' | 'invalid_data_uri' | 'too_large';

export class DataUriImageError extends Error {
  constructor(
    readonly reason: DataUriImageFailure,
    message: string,
  ) {
    super(message);
    this.name = 'DataUriImageError';
  }
}

const DATA_URI_PATTERN = /^data:image\/(jpeg|jpg|png|webp);base64,([\s\S]+)$/i;

/** `true` si el valor parece una imagen embebida (`data:image/...`). */
export function isDataUriImage(value: string): boolean {
  return /^data:image\//i.test(value.trim());
}

/**
 * Decodifica un data URI de imagen permitido (`jpeg|png|webp`, base64) con el
 * mismo límite de 5 MB que las descargas remotas.
 */
export function decodeDataUriImage(value: string): { buffer: Buffer; contentType: string } {
  const match = DATA_URI_PATTERN.exec(value.trim());
  if (!match) {
    throw new DataUriImageError(
      'unsupported_type',
      'El data URI no es una imagen JPEG/PNG/WebP en base64.',
    );
  }
  const subtype = (match[1] ?? '').toLowerCase();
  const contentType = `image/${subtype === 'jpg' ? 'jpeg' : subtype}`;
  const base64 = (match[2] ?? '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 === 1) {
    throw new DataUriImageError('invalid_data_uri', 'El base64 del data URI es inválido.');
  }

  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new DataUriImageError('invalid_data_uri', 'El data URI no contiene datos.');
  }
  if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new DataUriImageError('too_large', 'La imagen data URI supera el límite de 5 MB.');
  }
  return { buffer, contentType };
}
