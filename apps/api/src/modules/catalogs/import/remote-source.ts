import { isIP } from 'node:net';

/**
 * Descarga de catálogos desde un link.
 *
 * Soporta:
 * - URL directa a un archivo (CSV/XLSX/PDF/imagen).
 * - Link de archivo de Google Drive (`/file/d/<id>/...` u `open?id=`).
 * - Link de carpeta de Google Drive (`/drive/folders/<id>`): se lista con la
 *   vista `embeddedfolderview` (funciona con carpetas públicas) para que la UI
 *   muestre los archivos y el usuario elija uno.
 */

/** Tamaño máximo al descargar un link, en MB (IMPORT_MAX_MB, 50 por defecto). */
export function maxRemoteMb(): number {
  return Math.max(1, Number.parseInt(process.env.IMPORT_MAX_MB ?? '300', 10) || 300);
}

export function maxRemoteBytes(): number {
  return maxRemoteMb() * 1024 * 1024;
}

const DRIVE_FILE_ID = /\/file\/d\/([A-Za-z0-9_-]{10,})/;
const DRIVE_FOLDER_ID = /\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/;
const DRIVE_ID_PARAM = /[?&]id=([A-Za-z0-9_-]{10,})/;

const EXT_BY_MIME: Record<string, string> = {
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'application/csv': 'csv',
  'application/json': 'json',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const EXT_OFICIOS = new Set(['csv', 'tsv', 'xlsx', 'xls', 'ods', 'txt', 'json', 'pdf', 'jpg', 'jpeg', 'png', 'webp']);

//: Orden de preferencia para elegir automáticamente el archivo de una carpeta.
const PREFERENCIA_ARCHIVO = [
  'xlsx', 'xls', 'ods', 'csv', 'tsv', 'json', 'txt', 'pdf', 'jpg', 'jpeg', 'png', 'webp',
];

/** ¿El nombre corresponde a un formato que el importador entiende? */
export function esArchivoDeCatalogo(nombre: string): boolean {
  const extension = extensionOf(nombre);
  return Boolean(extension && EXT_OFICIOS.has(extension));
}

/** Elige el mejor archivo importable de una carpeta (planilla > PDF > imagen). */
export function elegirArchivoDeCatalogo(entries: RemoteEntry[]): RemoteEntry | null {
  const archivos = entries
    .filter((entrada) => entrada.kind === 'file' && esArchivoDeCatalogo(entrada.name))
    .sort((a, b) => {
      const ia = PREFERENCIA_ARCHIVO.indexOf(extensionOf(a.name) ?? '');
      const ib = PREFERENCIA_ARCHIVO.indexOf(extensionOf(b.name) ?? '');
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  return archivos[0] ?? null;
}

export type RemoteEntryKind = 'file' | 'folder';

export interface RemoteEntry {
  id: string;
  name: string;
  kind: RemoteEntryKind;
  /** URL lista para descargar/abrir el archivo (o página si es carpeta). */
  url: string;
  /** Extensión detectada, si es un archivo. */
  extension?: string;
}

export interface RemoteListing {
  kind: 'file' | 'folder';
  source: 'drive' | 'direct';
  name: string;
  entries: RemoteEntry[];
}

export interface RemoteFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  sourceUrl: string;
}

export class RemoteImportError extends Error {
  constructor(
    message: string,
    readonly code: string = 'REMOTE_IMPORT_FAILED',
  ) {
    super(message);
    this.name = 'RemoteImportError';
  }
}

export function driveFileId(url: string): string | null {
  const file = DRIVE_FILE_ID.exec(url);
  if (file) return file[1];
  if (!url.includes('drive.google.com')) return null;
  if (DRIVE_FOLDER_ID.test(url)) return null;
  const param = DRIVE_ID_PARAM.exec(url);
  return param ? param[1] : null;
}

export function driveFolderId(url: string): string | null {
  const folder = DRIVE_FOLDER_ID.exec(url);
  return folder ? folder[1] : null;
}

export function driveDownloadUrl(id: string): string {
  return `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;
}

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(name);
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

/** Evita SSRF: solo http(s) y nunca hosts privados ni localhost. */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new RemoteImportError('El link no es una URL válida.', 'REMOTE_INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new RemoteImportError('El link debe ser http o https.', 'REMOTE_INVALID_URL');
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new RemoteImportError('Ese link apunta a una red local y no se permite.', 'REMOTE_BLOCKED_HOST');
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b] = host.split('.').map((part) => Number(part));
    const privada =
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127);
    if (privada) {
      throw new RemoteImportError('Ese link apunta a una red local y no se permite.', 'REMOTE_BLOCKED_HOST');
    }
  }
  if (ipVersion === 6) {
    const normal = host.toLowerCase();
    if (normal === '::1' || normal.startsWith('fc') || normal.startsWith('fd') || normal.startsWith('fe80')) {
      throw new RemoteImportError('Ese link apunta a una red local y no se permite.', 'REMOTE_BLOCKED_HOST');
    }
  }
  return url;
}

function decodeFileName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

export function fileNameFromDisposition(disposition: string | null): string | null {
  if (!disposition) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (utf8) return decodeFileName(utf8[1].replace(/["']/g, '').trim());
  const simple = /filename="?([^";]+)"?/i.exec(disposition);
  return simple ? decodeFileName(simple[1].trim()) : null;
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (last && extensionOf(decodeURIComponent(last))) return decodeURIComponent(last);
  return 'catalogo';
}

/** Descarga un archivo remoto con límite de tamaño y validación SSRF. */
export async function downloadRemoteFile(rawUrl: string): Promise<RemoteFile> {
  const url = assertPublicUrl(rawUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: {
        'user-agent': 'VentasCatalogo/0.1 (+importacion de catalogos)',
        accept: 'text/csv,application/json,application/pdf,*/*',
      },
    });
  } catch (error) {
    throw new RemoteImportError(
      `No pudimos descargar el link (${error instanceof Error ? error.message : 'error de red'}).`,
      'REMOTE_FETCH_FAILED',
    );
  }
  if (!response.ok) {
    throw new RemoteImportError(
      `El link respondió ${response.status}. Verificá que el archivo sea público.`,
      'REMOTE_HTTP_ERROR',
    );
  }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (contentType === 'text/html' && !driveFileId(rawUrl)) {
    throw new RemoteImportError(
      'El link devolvió una página web, no un archivo. Para Drive, compartí el archivo como "cualquiera con el enlace".',
      'REMOTE_NOT_A_FILE',
    );
  }
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > maxRemoteBytes()) {
    throw new RemoteImportError(`El archivo supera el máximo de ${maxRemoteMb()} MB.`, 'REMOTE_TOO_LARGE');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > maxRemoteBytes()) {
    throw new RemoteImportError(`El archivo supera el máximo de ${maxRemoteMb()} MB.`, 'REMOTE_TOO_LARGE');
  }

  const fromHeader = fileNameFromDisposition(response.headers.get('content-disposition'));
  const nombre = fromHeader ?? fileNameFromUrl(url);
  const extension = extensionOf(nombre) ?? EXT_BY_MIME[contentType] ?? null;
  if (!extension || !EXT_OFICIOS.has(extension)) {
    throw new RemoteImportError(
      `No pudimos reconocer el formato del archivo descargado${contentType ? ` (${contentType})` : ''}.`,
      'REMOTE_UNKNOWN_FORMAT',
    );
  }
  const originalname = extensionOf(nombre) ? nombre : `${nombre}.${extension}`;
  const mimetype = contentType || 'application/octet-stream';
  return { buffer, originalname, mimetype, sourceUrl: rawUrl };
}

function parseDriveFolderHtml(html: string, folderId: string): RemoteEntry[] {
  const entradas: RemoteEntry[] = [];
  const bloques = html.split('<div class="flip-entry"');
  for (const bloque of bloques.slice(1)) {
    const id = /id="entry-([A-Za-z0-9_-]+)"/.exec(bloque)?.[1];
    const title = /class="flip-entry-title">([^<]+)</.exec(bloque)?.[1];
    const href = /href="([^"]+)"/.exec(bloque)?.[1];
    if (!id || !title) continue;
    const esCarpeta = Boolean(href && href.includes('/folders/'));
    const nombre = decodeFileName(title.trim());
    if (!esCarpeta && !esArchivoDeCatalogo(nombre)) continue;
    const extension = esCarpeta ? undefined : extensionOf(nombre) ?? undefined;
    entradas.push({
      id,
      name: nombre,
      kind: esCarpeta ? 'folder' : 'file',
      url: esCarpeta
        ? `https://drive.google.com/drive/folders/${id}`
        : driveDownloadUrl(id),
      extension,
    });
  }
  return entradas;
}

/** Lista una carpeta pública de Drive (un nivel). */
export async function listDriveFolder(folderId: string): Promise<RemoteEntry[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; VentasCatalogo)' },
    });
  } catch (error) {
    throw new RemoteImportError(
      `No pudimos abrir la carpeta de Drive (${error instanceof Error ? error.message : 'error de red'}).`,
      'REMOTE_FETCH_FAILED',
    );
  }
  if (!response.ok) {
    throw new RemoteImportError(
      `Drive respondió ${response.status}. Verificá que la carpeta sea pública.`,
      'REMOTE_HTTP_ERROR',
    );
  }
  const html = await response.text();
  const entradas = parseDriveFolderHtml(html, folderId);
  if (entradas.length === 0) {
    throw new RemoteImportError(
      'La carpeta está vacía o no es pública. Compartila como "cualquiera con el enlace".',
      'REMOTE_FOLDER_EMPTY',
    );
  }
  return entradas;
}

/**
 * Resuelve un link: si es carpeta de Drive devuelve su contenido; si es archivo
 * devuelve una entrada única lista para descargar.
 */
export async function resolveRemoteLink(rawUrl: string): Promise<RemoteListing> {
  const url = assertPublicUrl(rawUrl);
  const folderId = driveFolderId(url.toString());
  if (folderId) {
    const entries = await listDriveFolder(folderId);
    return { kind: 'folder', source: 'drive', name: folderId, entries };
  }
  const fileId = driveFileId(url.toString());
  if (fileId) {
    const nombre = fileNameFromUrl(url);
    return {
      kind: 'file',
      source: 'drive',
      name: nombre,
      entries: [
        {
          id: fileId,
          name: nombre,
          kind: 'file',
          url: driveDownloadUrl(fileId),
          extension: extensionOf(nombre) ?? undefined,
        },
      ],
    };
  }
  const nombre = fileNameFromUrl(url);
  return {
    kind: 'file',
    source: 'direct',
    name: nombre,
    entries: [
      {
        id: '',
        name: nombre,
        kind: 'file',
        url: url.toString(),
        extension: extensionOf(nombre) ?? undefined,
      },
    ],
  };
}
