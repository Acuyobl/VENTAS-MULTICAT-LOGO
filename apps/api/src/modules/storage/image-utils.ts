/** Reglas compartidas por la subida de imágenes de producto y la importación. */
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
] as const;

export type AllowedImageContentType = (typeof ALLOWED_IMAGE_CONTENT_TYPES)[number];

const EXTENSIONS: Record<AllowedImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** `Image/PNG; charset=binary` → `image/png`. */
export function normalizeContentType(raw: string | null | undefined): string {
  return (raw ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isAllowedImageContentType(
  raw: string | null | undefined,
): raw is AllowedImageContentType {
  return (ALLOWED_IMAGE_CONTENT_TYPES as readonly string[]).includes(normalizeContentType(raw));
}

/** Extensión canónica del content-type permitido (`image/jpeg` → `jpg`). */
export function extensionForContentType(raw: string | null | undefined): string | null {
  const contentType = normalizeContentType(raw);
  if (!isAllowedImageContentType(contentType)) return null;
  return EXTENSIONS[contentType];
}

export interface ProductImageKeyInput {
  catalogId: string;
  catalogVersionId: string;
  productId: string;
  checksum: string;
  ext: string;
}

/**
 * Clave determinística en el bucket privado `vc-products`:
 * `products/{catalogId}/{catalogVersionId}/{productId}-{checksum12}.{ext}`.
 * Los primeros 12 hex del SHA-256 del archivo permiten cache-busting cuando la
 * imagen cambia sin mover el objeto anterior de sitio.
 */
export function productImageKey(input: ProductImageKeyInput): string {
  const checksum = input.checksum.trim().toLowerCase();
  if (!/^[a-f0-9]{12,}$/.test(checksum)) {
    throw new Error('product_image_checksum_invalid');
  }
  const ext = input.ext.trim().toLowerCase().replace(/^\./, '');
  if (!/^[a-z0-9]{2,5}$/.test(ext)) throw new Error('product_image_ext_invalid');

  return `products/${input.catalogId}/${input.catalogVersionId}/${input.productId}-${checksum.slice(
    0,
    12,
  )}.${ext}`;
}

export type ImageFileValidation =
  | { ok: true; contentType: AllowedImageContentType; ext: string; size: number }
  | {
      ok: false;
      reason: 'missing' | 'empty' | 'too_large' | 'unsupported_type';
      message: string;
    };

/**
 * Valida el archivo subido antes de tocarlo: no vacío, ≤5 MB y content-type de
 * la lista blanca. No inspecciona bytes mágicos (la UI y MinIO confían en el
 * content-type declarado, igual que el resto de la API).
 */
export function validateProductImageFile(input: {
  buffer?: Buffer | null;
  mimetype?: string | null;
  size?: number | null;
}): ImageFileValidation {
  const size = input.size ?? input.buffer?.length ?? 0;
  if (!input.buffer || size === 0) {
    return { ok: false, reason: 'missing', message: 'Falta el archivo de imagen.' };
  }
  if (size > MAX_PRODUCT_IMAGE_BYTES) {
    return {
      ok: false,
      reason: 'too_large',
      message: `La imagen supera el límite de ${MAX_PRODUCT_IMAGE_BYTES / (1024 * 1024)} MB.`,
    };
  }

  const contentType = normalizeContentType(input.mimetype);
  const ext = extensionForContentType(contentType);
  if (!ext || !isAllowedImageContentType(contentType)) {
    return {
      ok: false,
      reason: 'unsupported_type',
      message: `Formato no soportado: usá ${ALLOWED_IMAGE_CONTENT_TYPES.join(', ')}.`,
    };
  }

  return { ok: true, contentType, ext, size };
}
