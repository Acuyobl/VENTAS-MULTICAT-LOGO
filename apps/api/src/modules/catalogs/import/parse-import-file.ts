import * as XLSX from 'xlsx';

export interface ParsedImportFile {
  headers: string[];
  /** Filas de datos (sin la cabecera), indexadas por nombre de columna. */
  rows: Record<string, unknown>[];
}

/** Extensiones que el importador acepta hoy (el contrato F1 pide CSV y XLSX). */
export type ImportFileExtension = 'csv' | 'xlsx';

export class ImportParseError extends Error {
  constructor(
    readonly reason: 'invalid_file' | 'empty_file',
    message: string,
  ) {
    super(message);
    this.name = 'ImportParseError';
  }
}

/**
 * SheetJS interpreta un `Buffer` UTF-8 como binario/ANSI y devuelve mojibake en
 * los acentos (`DescripciÃ³n`). Por eso el CSV se decodifica a texto antes de
 * parsearlo; si la decodificación UTF-8 deja caracteres de reemplazo se cae a
 * Windows-1252, que es lo que exporta Excel en español.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  if (utf8.includes('\uFFFD')) return buffer.toString('latin1');
  return utf8.charCodeAt(0) === 0xfeff ? utf8.slice(1) : utf8;
}

/** Detecta el separador contando ocurrencias en la primera línea. */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Array<[string, number]> = [
    ['\t', firstLine.split('\t').length - 1],
    [';', firstLine.split(';').length - 1],
    [',', firstLine.split(',').length - 1],
  ];
  const [delimiter, count] = counts.reduce((best, current) =>
    current[1] > best[1] ? current : best,
  );
  return count > 0 ? delimiter : ',';
}

/**
 * Parser CSV propio que conserva el texto original de las celdas.
 *
 * SheetJS adivina tipos y convierte `1/4` en fecha (`1/3/01`), lo que corrompe
 * medidas/materiales. Para CSV parseamos texto plano: comillas dobles, comas y
 * saltos de línea entrecomillados y `""` como comilla escapada. Los valores
 * quedan como string; la coacción de tipos la decide el plan de importación.
 */
export function parseCsvText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      if (text[index + 1] === '\n') index += 1;
      pushRow();
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) pushRow();

  return rows.filter((cells) => cells.some((value) => value.trim().length > 0));
}

/**
 * Parsea CSV o XLSX: la primera fila es la cabecera. CSV se parsea como texto
 * (sin adivinar tipos); XLSX usa SheetJS con `raw: false` para conservar el texto
 * de las celdas de dinero.
 */
export function parseImportFile(
  buffer: Buffer,
  extension: ImportFileExtension,
  delimiter?: string,
): ParsedImportFile {
  if (buffer.length === 0) {
    throw new ImportParseError('invalid_file', 'El archivo está vacío.');
  }

  let matrix: unknown[][];
  try {
    if (extension === 'csv') {
      const text = decodeCsvBuffer(buffer);
      const separator = delimiter && delimiter.length === 1 ? delimiter : detectDelimiter(text);
      matrix = parseCsvText(text, separator);
    } else {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
      if (!sheet) throw new ImportParseError('empty_file', 'El archivo no tiene hojas con datos.');
      matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
        blankrows: false,
      });
    }
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    throw new ImportParseError(
      'invalid_file',
      `No se pudo leer el archivo: ${error instanceof Error ? error.message : 'formato desconocido'}`,
    );
  }

  const headerRow = matrix[0] ?? [];
  const headers = makeUniqueHeaders(headerRow.map((cell) => String(cell ?? '')));
  const rows = matrix.slice(1).map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? '';
    });
    return row;
  });

  return { headers, rows: rows.filter((row) => hasAnyValue(row)) };
}

/** Cabeceras vacías o repetidas se renombran para no pisar columnas. */
export function makeUniqueHeaders(rawHeaders: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return rawHeaders.map((raw, index) => {
    const base = raw.trim() || `columna_${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}

function hasAnyValue(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) => String(value ?? '').trim().length > 0);
}
