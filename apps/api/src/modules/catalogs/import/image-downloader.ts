import {
  isAllowedImageContentType,
  MAX_PRODUCT_IMAGE_BYTES,
  normalizeContentType,
} from '../../storage/image-utils';

/** User-Agent descriptivo exigido por Wikimedia (sin él responde 403/429). */
export const IMAGE_DOWNLOAD_USER_AGENT =
  'VentasCatalogoImporter/1.0 (+https://github.com/Acuyobl/VENTAS-MULTICAT-LOGO)';

/** Presupuesto total por imagen (incluye reintentos). */
export const IMAGE_DOWNLOAD_TIMEOUT_MS = 20_000;
/** Esperas de backoff entre intentos cuando no hay `Retry-After`. */
export const IMAGE_DOWNLOAD_BACKOFF_MS = [1_000, 3_000] as const;
const RETRY_AFTER_MAX_MS = 10_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

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

export interface DownloadImageOptions {
  /** Inyectable en tests para no esperar el backoff real. */
  sleep?: (ms: number) => Promise<void>;
  /** Presupuesto total en ms (default 20 s). */
  timeoutMs?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Quita parámetros de tracking `utm_*` antes de descargar. */
export function sanitizeImageUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, RETRY_AFTER_MAX_MS);
  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_MAX_MS);
}

/**
 * Descarga una imagen remota durante la importación con User-Agent descriptivo,
 * hasta 3 intentos para 429/5xx y errores de red (backoff 1 s/3 s o
 * `Retry-After` ≤ 10 s), timeout total ≤ 20 s, máximo 5 MB y content-type de la
 * lista blanca. Si algo falla lanza `ImageDownloadError` y la fila se importa
 * sin imagen con un warning (`IMAGE_DOWNLOAD_FAILED`), nunca en cuarentena.
 */
export async function downloadImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<{ buffer: Buffer; contentType: string }> {
  const target = sanitizeImageUrl(url);
  const sleep = options.sleep ?? defaultSleep;
  const deadline = Date.now() + (options.timeoutMs ?? IMAGE_DOWNLOAD_TIMEOUT_MS);

  let lastError: ImageDownloadError | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new ImageDownloadError('timeout', `La descarga de ${url} superó 20 s.`);
    }

    let response: Response;
    try {
      response = await fetch(target, {
        signal: AbortSignal.timeout(Math.min(remaining, IMAGE_DOWNLOAD_TIMEOUT_MS)),
        redirect: 'follow',
        headers: { 'User-Agent': IMAGE_DOWNLOAD_USER_AGENT, Accept: 'image/*' },
      });
    } catch (error) {
      lastError = isTimeoutError(error)
        ? new ImageDownloadError('timeout', `La descarga de ${url} superó 20 s.`)
        : new ImageDownloadError('network', `No se pudo descargar ${url}.`);
      if (attempt < MAX_ATTEMPTS - 1) {
        await waitBeforeRetry(sleep, deadline, IMAGE_DOWNLOAD_BACKOFF_MS[attempt] ?? 3_000);
        continue;
      }
      throw lastError;
    }

    if (!response.ok) {
      lastError = new ImageDownloadError(
        'http_error',
        `La descarga de ${url} respondió HTTP ${response.status}.`,
      );
      if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS - 1) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        await waitBeforeRetry(
          sleep,
          deadline,
          retryAfter ?? IMAGE_DOWNLOAD_BACKOFF_MS[attempt] ?? 3_000,
        );
        continue;
      }
      throw lastError;
    }

    return await readImage(response, url);
  }

  throw lastError ?? new ImageDownloadError('network', `No se pudo descargar ${url}.`);
}

async function waitBeforeRetry(
  sleep: (ms: number) => Promise<void>,
  deadline: number,
  waitMs: number,
): Promise<void> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return;
  await sleep(Math.min(waitMs, remaining));
}

async function readImage(
  response: Response,
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
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
