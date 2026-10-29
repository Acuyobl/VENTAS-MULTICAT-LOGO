import { parseUnstructuredLines, type ParsedImportFile } from '../parse-import-file';
import type { OcrProvider } from './ocr-provider';

const MAX_PDF_OCR_IMAGES = 10;

/** Extrae las imágenes JPEG embebidas (`/DCTDecode`) de un PDF escaneado. */
export function extractPdfJpegImages(buffer: Buffer, maxImages = MAX_PDF_OCR_IMAGES): Buffer[] {
  const images: Buffer[] = [];
  const raw = buffer.toString('latin1');
  let searchFrom = 0;

  while (images.length < maxImages) {
    const streamIndex = raw.indexOf('stream', searchFrom);
    if (streamIndex === -1) break;
    let dataStart = streamIndex + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart += 1;
    if (raw[dataStart] === '\n') dataStart += 1;
    const endIndex = raw.indexOf('endstream', dataStart);
    if (endIndex === -1) break;
    searchFrom = endIndex + 'endstream'.length;

    const dictionary = raw.slice(Math.max(0, streamIndex - 2000), streamIndex);
    if (!dictionary.includes('/DCTDecode')) continue;

    let dataEnd = endIndex;
    if (raw[dataEnd - 1] === '\n') dataEnd -= 1;
    if (raw[dataEnd - 1] === '\r') dataEnd -= 1;

    const image = buffer.subarray(dataStart, dataEnd);
    if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
      images.push(image);
    }
  }

  return images;
}

/**
 * PDF escaneado: OCR de las imágenes JPEG incrustadas (máx. 10) y parseo como
 * texto libre. Devuelve `null` si no hay imágenes o el OCR no lee nada.
 */
export async function parseScannedPdfWithOcr(
  buffer: Buffer,
  ocr: Pick<OcrProvider, 'recognizeImage'>,
): Promise<ParsedImportFile | null> {
  const images = extractPdfJpegImages(buffer);
  if (images.length === 0) return null;

  const texts: string[] = [];
  for (const image of images) {
    const result = await ocr.recognizeImage(image);
    if (result?.text?.trim()) texts.push(result.text.trim());
  }
  const joined = texts.join('\n').trim();
  if (!joined) return null;

  const parsed = parseUnstructuredLines(joined);
  return parsed.rows.length > 0
    ? { ...parsed, sheetSelection: `PDF escaneado · OCR (${images.length} imagen/es)` }
    : null;
}
