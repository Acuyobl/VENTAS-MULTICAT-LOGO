import {
  parseImportFile,
  type ImportFileExtension,
  type ParsedImportFile,
} from './parse-import-file';
import { extractXlsxImages } from './xlsx-images';

/**
 * Parser universal que, para libros Excel/ODS, extrae antes las imágenes
 * incrustadas (drawings/media del zip) y las inyecta como data URI en la
 * columna de imagen antes del composite por cliente.
 */
export async function parseImportFileWithEmbeddedImages(
  buffer: Buffer,
  extension: ImportFileExtension,
  delimiter?: string,
): Promise<ParsedImportFile> {
  const sheetImages = ['xlsx', 'xlsm', 'xlsb', 'xls', 'ods'].includes(extension)
    ? await extractXlsxImages(buffer)
    : undefined;
  return parseImportFile(buffer, extension, delimiter, sheetImages);
}
