import type { ParsedImportFile } from '../parse-import-file';
import { parseUnstructuredLines } from '../parse-import-file';

/** Límite de la imagen que se manda a OCR (10 MB). */
export const MAX_OCR_IMAGE_BYTES = 10 * 1024 * 1024;
/** Timeout por imagen/página escaneada. */
export const OCR_TIMEOUT_MS = 60_000;
/** Texto útil mínimo para considerar que un PDF ya trae capa de texto. */
export const OCR_PDF_MIN_TEXT_CHARS = 20;
export const DEFAULT_OCR_MOCK_TEXT = 'Camisa demo 5000\nPantalón demo 7000';

export interface OcrResult {
  text: string;
  provider: string;
}

export interface OcrProvider {
  readonly name: string;
  /** Devuelve `null` si no pudo leer texto (nunca lanza por una imagen ilegible). */
  recognizeImage(buffer: Buffer): Promise<OcrResult | null>;
}

/** Texto OCR → filas de importación (mismo parser de texto libre). */
export function parseOcrText(text: string | null | undefined): ParsedImportFile | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  const parsed = parseUnstructuredLines(trimmed);
  return parsed.rows.length > 0 ? parsed : null;
}

/** Tipo MIME aproximado por magic bytes (para snapshots/subidas). */
export function imageContentType(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}
