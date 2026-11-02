import { Logger } from '@nestjs/common';

const logger = new Logger('WhatsappMedia');

export const WHATSAPP_MEDIA_TIMEOUT_MS = 20_000;
export const WHATSAPP_MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_WHATSAPP_API_VERSION = 'v21.0';

/** MIME permitidos para adjuntos de WhatsApp (documentos e imágenes). */
export const ALLOWED_WHATSAPP_MEDIA: Record<string, { ext: string; kind: 'doc' | 'image' }> = {
  'application/pdf': { ext: 'pdf', kind: 'doc' },
  'text/csv': { ext: 'csv', kind: 'doc' },
  'application/csv': { ext: 'csv', kind: 'doc' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'doc' },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'doc' },
  'text/tab-separated-values': { ext: 'tsv', kind: 'doc' },
  'text/plain': { ext: 'txt', kind: 'doc' },
  'application/json': { ext: 'json', kind: 'doc' },
  'image/jpeg': { ext: 'jpg', kind: 'image' },
  'image/png': { ext: 'png', kind: 'image' },
  'image/webp': { ext: 'webp', kind: 'image' },
};

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  json: 'application/json',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export interface InboundMediaMessage {
  from: string;
  id: string;
  type: 'image' | 'document';
  mediaId: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
}

export interface DownloadedWhatsappMedia {
  buffer: Buffer;
  mimeType: string;
  filename: string | null;
  extension: string;
}

interface CloudApiMediaMessageLike {
  from?: string;
  id?: string;
  type?: string;
  image?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
}

/** Parsea un mensaje `image`/`document` del webhook (solo con mediaId). */
export function parseInboundMedia(message: CloudApiMediaMessageLike): InboundMediaMessage | null {
  if (!message.from || !message.id) return null;
  if (message.type === 'image' && message.image?.id) {
    return {
      from: message.from,
      id: message.id,
      type: 'image',
      mediaId: message.image.id,
      mimeType: message.image.mime_type ?? 'image/jpeg',
      filename: null,
      caption: message.image.caption?.trim() || null,
    };
  }
  if (message.type === 'document' && message.document?.id) {
    return {
      from: message.from,
      id: message.id,
      type: 'document',
      mediaId: message.document.id,
      mimeType: message.document.mime_type ?? null,
      filename: message.document.filename ?? null,
      caption: message.document.caption?.trim() || null,
    };
  }
  return null;
}

/** Extensión segura: basename, sin traversal y solo de la lista permitida. */
export function safeMediaExtension(
  filename: string | null,
  mimeType: string | null,
): string | null {
  if (filename) {
    const base = filename.replace(/\\/g, '/').split('/').pop() ?? '';
    const match = /\.([a-z0-9]{1,10})$/i.exec(base);
    const ext = match?.[1]?.toLowerCase();
    if (ext && EXTENSION_TO_MIME[ext]) return ext === 'jpeg' ? 'jpg' : ext;
  }
  if (mimeType) {
    const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    return ALLOWED_WHATSAPP_MEDIA[normalized]?.ext ?? null;
  }
  return null;
}

export function mediaMimeType(extension: string | null): string | null {
  if (!extension) return null;
  return EXTENSION_TO_MIME[extension.toLowerCase()] ?? null;
}

/** Key en `vc-docs`: `whatsapp/{orgId}/{messageId}.{ext}` (ids saneados). */
export function whatsappAttachmentKey(
  organizationId: string,
  messageId: string,
  extension: string,
): string {
  const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
  const safeExt = extension
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 10);
  return `whatsapp/${safeId(organizationId)}/${safeId(messageId)}.${safeExt}`;
}

export interface DownloadMediaOptions {
  accessToken: string;
  apiVersion?: string;
  maxBytes?: number;
  fetchImpl?: typeof fetch;
  /** Datos del mensaje del webhook si Graph no los repite en metadata. */
  filename?: string | null;
  mimeType?: string | null;
}

/**
 * Descarga media de Graph API: primero metadata (`/{mediaId}`) y luego el
 * archivo con bearer. Timeout 20 s, tope de tamaño y MIME permitido. Devuelve
 * `null` ante cualquier fallo (el webhook no se rompe).
 */
export async function downloadWhatsappMedia(
  mediaId: string,
  options: DownloadMediaOptions,
): Promise<DownloadedWhatsappMedia | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const version = options.apiVersion || DEFAULT_WHATSAPP_API_VERSION;
  const maxBytes = options.maxBytes ?? WHATSAPP_MEDIA_MAX_BYTES;
  const token = options.accessToken;
  if (!token || !mediaId) return null;

  try {
    const metadataResponse = await fetchImpl(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(WHATSAPP_MEDIA_TIMEOUT_MS),
    });
    if (!metadataResponse.ok) return null;
    const metadata = (await metadataResponse.json().catch(() => null)) as {
      url?: string;
      mime_type?: string;
      file_size?: number;
      filename?: string;
    } | null;
    if (!metadata?.url) return null;
    if (typeof metadata.file_size === 'number' && metadata.file_size > maxBytes) return null;

    const extension = safeMediaExtension(
      metadata.filename ?? options.filename ?? null,
      metadata.mime_type ?? options.mimeType ?? null,
    );
    if (!extension) return null;

    const mediaResponse = await fetchImpl(metadata.url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(WHATSAPP_MEDIA_TIMEOUT_MS),
    });
    if (!mediaResponse.ok) return null;
    const declared = Number(mediaResponse.headers.get('content-length') ?? '0');
    if (declared > maxBytes) return null;

    const buffer = await readWithLimit(mediaResponse, maxBytes);
    if (!buffer) return null;

    return {
      buffer,
      mimeType: mediaMimeType(extension) ?? metadata.mime_type ?? 'application/octet-stream',
      filename: metadata.filename ?? null,
      extension,
    };
  } catch (error) {
    logger.warn({ err: error, mediaId }, 'whatsapp_media_download_failed');
    return null;
  }
}

async function readWithLimit(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } catch {
    return null;
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : null;
}
