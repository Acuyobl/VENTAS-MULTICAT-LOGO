import {
  extractPdfText,
  parseImportFile,
  ImportParseError,
  type ImportFileExtension,
  type ParsedImportFile,
} from '../parse-import-file';
import { OCR_PDF_MIN_TEXT_CHARS, parseOcrText, type OcrProvider } from './ocr-provider';
import { parseScannedPdfWithOcr } from './pdf-ocr';

export interface ParseWithOcrInput {
  buffer: Buffer;
  extension: ImportFileExtension;
  delimiter?: string;
  ocr: OcrProvider;
}

/**
 * Parser universal con OCR: imágenes → texto OCR; PDF con capa de texto usa el
 * parser actual y, si tiene poco texto (<20 chars útiles), intenta las imágenes
 * JPEG embebidas (PDF escaneado). Mantiene el resto de formatos igual.
 */
export async function parseImportFileWithOcr(input: ParseWithOcrInput): Promise<ParsedImportFile> {
  const { buffer, extension, delimiter, ocr } = input;

  if (extension === 'image') {
    const result = await ocr.recognizeImage(buffer);
    const parsed = parseOcrText(result?.text);
    if (!parsed) {
      throw new ImportParseError(
        'empty_file',
        'No pudimos leer texto en la imagen. Probá con una foto más nítida (JPG/PNG/WebP) o subí un PDF con texto.',
      );
    }
    return { ...parsed, sheetSelection: 'Foto · OCR' };
  }

  if (extension === 'pdf') {
    const usefulText = extractPdfText(buffer).replace(/\s+/g, '');
    if (usefulText.length >= OCR_PDF_MIN_TEXT_CHARS) {
      return parseImportFile(buffer, 'pdf', delimiter);
    }

    const scanned = await parseScannedPdfWithOcr(buffer, ocr);
    if (scanned) return scanned;

    // Sin capa de texto ni imágenes legibles: se mantiene el fallback de 1 fila
    // del PDF para no romper importaciones existentes.
    return parseImportFile(buffer, 'pdf', delimiter);
  }

  return parseImportFile(buffer, extension, delimiter);
}
