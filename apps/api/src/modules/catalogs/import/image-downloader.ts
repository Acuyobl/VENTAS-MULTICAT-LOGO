import {
  isAllowedImageContentType,
  MAX_PRODUCT_IMAGE_BYTES,
  normalizeContentType,
} from '../../storage/image-utils';

export const IMAGE_DOWNLOAD_TIMEOUT_MS = 8000;

export type ImageDownloadFailure =
  'http_error' | 'unsupported_type' | 'too_large' | 'timeout' | 'empty' | 'network';

export class ImageDownloadError extends Error {
  constructor(
    readonly reason: ImageDownloadFailure,
    message: string,
  ) {
    super(message);
    this.name = 'ImageDownloadError';
  }
}

/**
 * Descarga una imagen remota durante la importación: timeout de 8 s, máximo
 * 5 MB y content-type de la lista blanca. Nunca devuelve datos parciales: si
 * algo falla lanza `ImageDownloadError` y la fila se importa sin imagen con un
 * warning (`IMAGE_DOWNLOAD_FAILED`).
 */
export async function downloadImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new ImageDownloadError('timeout', `La descarga de ${url} superó 8 s.`);
    }
    throw new ImageDownloadError('network', `No se pudo descargar ${url}.`);
  }

  if (!response.ok) {
    throw new ImageDownloadError(
      'http_error',
      `La descarga de ${url} respondió HTTP ${response.status}.`,
    );
  }

  const contentType = normalizeContentType(response.headers.get('content-type'));
  if (!isAllowedImageContentType(contentType)) {
    throw new ImageDownloadError(
      'unsupported_type',
      `El tipo "${contentType || 'desconocido'}" no es una imagen soportada.`,
    );
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ImageDownloadError('too_large', 'La imagen remota supera el límite de 5 MB.');
  }

  const buffer = await readWithLimit(response);
  if (buffer.length === 0) {
    throw new ImageDownloadError('empty', 'La imagen remota está vacía.');
  }
  return { buffer, contentType };
}

async function readWithLimit(response: Response): Promise<Buffer> {
  const body = response.body;
  if (!body) throw new ImageDownloadError('empty', 'La respuesta no tiene cuerpo.');

  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_PRODUCT_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ImageDownloadError('too_large', 'La imagen remota supera el límite de 5 MB.');
    }
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks);
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'TimeoutError'
  );
}
