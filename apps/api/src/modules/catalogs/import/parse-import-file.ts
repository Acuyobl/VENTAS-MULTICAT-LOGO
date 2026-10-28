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

/** Bytes 0x80–0x9F de Windows-1252 (Latin-1 los deja como controles). */
const CP1252_HIGH: Record<number, string> = {
  0x80: '€',
  0x82: '‚',
  0x83: 'ƒ',
  0x84: '„',
  0x85: '…',
  0x86: '†',
  0x87: '‡',
  0x88: 'ˆ',
  0x89: '‰',
  0x8a: 'Š',
  0x8b: '‹',
  0x8c: 'Œ',
  0x8e: 'Ž',
  0x91: '‘',
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x95: '•',
  0x96: '–',
  0x97: '—',
  0x98: '˜',
  0x99: '™',
  0x9a: 'š',
  0x9b: '›',
  0x9c: 'œ',
  0x9e: 'ž',
  0x9f: 'Ÿ',
};

/** Decodifica bytes como Windows-1252 (Excel en español exporta así). */
export function decodeWindows1252(buffer: Buffer): string {
  let out = '';
  for (const byte of buffer) {
    if (byte >= 0x80 && byte <= 0x9f) {
      out += CP1252_HIGH[byte] ?? String.fromCharCode(byte);
    } else {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

/**
 * Decodifica el CSV a texto. Si el archivo **no es UTF-8 válido** (Excel en
 * español suele exportar Windows-1252), se reintenta como Windows-1252/Latin-1.
 * Si es UTF-8 válido pero trae el carácter de reemplazo U+FFFD literal, se
 * conserva: el importador lo mandará a cuarentena en vez de guardarlo.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    return decodeWindows1252(buffer);
  }
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
