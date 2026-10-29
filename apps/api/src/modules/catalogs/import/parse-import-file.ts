import * as XLSX from 'xlsx';
import * as zlib from 'node:zlib';
import { normalizeHeader } from './normalize-header';

export interface SheetSummary {
  name: string;
  rowCount: number;
  columnCount: number;
  hasHeaders: boolean;
  score: number;
}

export interface ParsedImportFile {
  headers: string[];
  /** Filas de datos (sin la cabecera), indexadas por nombre de columna. */
  rows: Record<string, unknown>[];
  /** Metadatos de hojas/pestañas detectadas en archivos multi-hoja (Excel/ODS) */
  sheets?: SheetSummary[];
  /** Detalle de cómo se procesaron las pestañas */
  sheetSelection?: string;
}

/** Extensiones aceptadas y adaptadas por el importador universal. */
export type ImportFileExtension =
  'csv' | 'xlsx' | 'xls' | 'tsv' | 'txt' | 'json' | 'pdf' | 'ods' | 'unknown';

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
    ['|', firstLine.split('|').length - 1],
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

/** Infiere el formato real del archivo a partir de la extensión o magic bytes. */
export function sniffFileFormat(buffer: Buffer, declaredExt?: string): ImportFileExtension {
  const ext = (declaredExt ?? '').toLowerCase().trim();
  if (['xlsx', 'xlsm', 'xlsb'].includes(ext)) return 'xlsx';
  if (['xls'].includes(ext)) return 'xls';
  if (['ods'].includes(ext)) return 'ods';
  if (['csv'].includes(ext)) return 'csv';
  if (['tsv', 'tab'].includes(ext)) return 'tsv';
  if (['txt', 'text', 'prn', 'log'].includes(ext)) return 'txt';
  if (['json'].includes(ext)) return 'json';
  if (['pdf'].includes(ext)) return 'pdf';

  if (buffer.length >= 4) {
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'pdf';
    }
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return 'xlsx';
    }
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
      return 'xls';
    }
  }

  const prefix = buffer.toString('utf8', 0, Math.min(buffer.length, 64)).trim();
  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    return 'json';
  }

  return 'txt';
}

function cleanPdfString(raw: string): string {
  return raw
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([()\\])/g, '$1');
}

/** Extrae texto de streams descompresores de un documento PDF. */
export function extractPdfText(buffer: Buffer): string {
  const textChunks: string[] = [];
  const bufStr = buffer.toString('binary');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;

  while ((match = streamRegex.exec(bufStr)) !== null) {
    const streamContent = match[1];
    if (!streamContent) continue;
    const streamBuf = Buffer.from(streamContent, 'binary');

    let decompressed: string | null = null;
    try {
      decompressed = zlib.inflateSync(streamBuf).toString('utf8');
    } catch {
      try {
        decompressed = zlib.inflateRawSync(streamBuf).toString('utf8');
      } catch {
        decompressed = streamBuf.toString('utf8');
      }
    }

    if (decompressed) {
      const tjRegex = /\(([^)]*)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(decompressed)) !== null) {
        if (tjMatch[1]) textChunks.push(cleanPdfString(tjMatch[1]));
      }

      const bigTjRegex = /\[([^\]]*)\]\s*TJ/g;
      let bigTjMatch: RegExpExecArray | null;
      while ((bigTjMatch = bigTjRegex.exec(decompressed)) !== null) {
        const inner = bigTjMatch[1] ?? '';
        const innerMatches = inner.match(/\(([^)]*)\)/g);
        if (innerMatches) {
          const joined = innerMatches.map((s) => cleanPdfString(s.slice(1, -1))).join('');
          textChunks.push(joined);
        }
      }
    }
  }

  return textChunks.join('\n');
}

/** Parsea un JSON en matriz tabular si es un arreglo de objetos o contiene productos. */
export function parseJsonBuffer(buffer: Buffer): ParsedImportFile | null {
  try {
    const text = decodeCsvBuffer(buffer);
    const parsed = JSON.parse(text) as unknown;
    let items: unknown[] = [];
    if (Array.isArray(parsed)) {
      items = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const candidateKey = [
        'products',
        'items',
        'rows',
        'data',
        'articulos',
        'catalogo',
        'catalog',
        'productos',
      ].find((key) => Array.isArray(record[key]));
      if (candidateKey) {
        items = record[candidateKey] as unknown[];
      } else {
        items = [parsed];
      }
    }

    if (items.length === 0) return null;

    const headerSet = new Set<string>();
    for (const item of items) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        Object.keys(item).forEach((k) => headerSet.add(k));
      }
    }

    const headers = headerSet.size > 0 ? Array.from(headerSet) : ['Producto', 'Precio'];
    const rows: Record<string, unknown>[] = items.map((item, idx) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const row: Record<string, unknown> = {};
        for (const h of headers) {
          row[h] = (item as Record<string, unknown>)[h] ?? '';
        }
        return row;
      }
      return {
        Producto: String(item ?? `Producto ${idx + 1}`),
        Precio: '0',
      };
    });

    return { headers: makeUniqueHeaders(headers), rows: rows.filter(hasAnyValue) };
  } catch {
    return null;
  }
}

/** Parsea texto desestructurado (listas de productos línea por línea con nombre y precio). */
export function parseUnstructuredLines(text: string): ParsedImportFile {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) {
    return { headers: ['SKU', 'Nombre', 'Precio'], rows: [] };
  }

  const priceRegex =
    /(?:(\$|₡|USD|CRC|EUR)\s*([0-9]+(?:[.,][0-9]{2,3})*(?:[.,][0-9]{2})?)|([0-9]+(?:[.,][0-9]{2,3})*(?:[.,][0-9]{2})?)\s*(\$|₡|USD|CRC|EUR)|(?:\s+[-–—:]\s*|\s{2,}|\t)([0-9]+(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?)\s*$)/i;

  const rows: Record<string, unknown>[] = [];
  rawLines.forEach((line, index) => {
    const match = priceRegex.exec(line);
    let name = line;
    let price = '0';
    if (match) {
      const priceStr = match[2] || match[3] || match[5];
      if (priceStr) {
        price = priceStr.trim();
        name = line
          .replace(match[0], '')
          .replace(/[-–—:]\s*$/, '')
          .trim();
      }
    }
    if (!name) name = `Producto ${index + 1}`;
    rows.push({
      SKU: `ITEM-${String(index + 1).padStart(3, '0')}`,
      Nombre: name,
      Precio: price,
    });
  });

  return {
    headers: ['SKU', 'Nombre', 'Precio'],
    rows,
  };
}

function isProbableHeaderRow(cells: unknown[]): boolean {
  if (cells.length === 0) return false;
  const knownHeaderPattern =
    /(sku|codigo|código|ref|nombre|producto|articulo|artículo|precio|pvp|costo|coste|stock|cant|cantidad|descrip|categoria|categoría|marca|foto|imagen|total|iva)/i;

  let headerKeywordCount = 0;
  let numericCount = 0;

  for (const cell of cells) {
    const str = String(cell ?? '').trim();
    if (!str) continue;
    if (knownHeaderPattern.test(str)) {
      headerKeywordCount += 1;
    }
    if (/^[$₡€]?\s*-?\d+([.,]\d+)?\s*[$₡€]?$/.test(str)) {
      numericCount += 1;
    }
  }

  if (headerKeywordCount > 0) return true;
  if (numericCount > 0) return false;
  return true;
}

function generateDefaultHeaders(colCount: number): string[] {
  const headers: string[] = [];
  for (let i = 0; i < colCount; i += 1) {
    if (i === 0) headers.push('Producto');
    else if (i === 1) headers.push('Precio');
    else if (i === 2) headers.push('Detalle');
    else headers.push(`Columna_${i + 1}`);
  }
  return headers;
}

/**
 * Detecta y combina tablas compuestas en un mismo archivo o entre pestañas (ej. Sección principal de
 * productos seguida de filas de totales y una sub-tabla con mapeo de imágenes o fotos).
 */
export function processCompositeTables(matrix: unknown[][]): unknown[][] {
  if (matrix.length < 3) return matrix;

  let secondaryHeaderIdx = -1;
  for (let i = 2; i < matrix.length; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const norm = row.map((cell) => normalizeHeader(String(cell ?? '')));
    if (
      norm.some((c) => c === 'imagen' || c === 'foto' || c === 'image') &&
      norm.some(
        (c) =>
          c === 'cliente' ||
          c === 'producto' ||
          c === 'nombre' ||
          c.includes('pedido') ||
          c === 'sku',
      )
    ) {
      secondaryHeaderIdx = i;
      break;
    }
  }

  if (secondaryHeaderIdx === -1) return matrix;

  const primaryHeader = matrix[0] ?? [];
  const primaryHeaderNorm = primaryHeader.map((c) => normalizeHeader(String(c ?? '')));
  const secondaryHeader = matrix[secondaryHeaderIdx] ?? [];
  const secondaryHeaderNorm = secondaryHeader.map((c) => normalizeHeader(String(c ?? '')));

  const imageColIdx = secondaryHeaderNorm.findIndex(
    (c) => c === 'imagen' || c === 'foto' || c === 'image',
  );
  if (imageColIdx === -1) return matrix;

  let primaryJoinColIdx = -1;
  let secondaryJoinColIdx = -1;

  for (let sIdx = 0; sIdx < secondaryHeaderNorm.length; sIdx += 1) {
    if (sIdx === imageColIdx) continue;
    const sColName = secondaryHeaderNorm[sIdx];
    if (!sColName) continue;
    const pIdx = primaryHeaderNorm.findIndex((pColName) => pColName === sColName);
    if (pIdx !== -1) {
      primaryJoinColIdx = pIdx;
      secondaryJoinColIdx = sIdx;
      break;
    }
  }

  if (primaryJoinColIdx === -1 || secondaryJoinColIdx === -1) {
    const sClientIdx = secondaryHeaderNorm.findIndex(
      (c) => c === 'cliente' || c === 'nombre' || c === 'producto',
    );
    const pClientIdx = primaryHeaderNorm.findIndex(
      (c) => c === 'cliente' || c === 'nombre' || c === 'producto',
    );
    if (sClientIdx !== -1 && pClientIdx !== -1) {
      primaryJoinColIdx = pClientIdx;
      secondaryJoinColIdx = sClientIdx;
    }
  }

  if (primaryJoinColIdx === -1 || secondaryJoinColIdx === -1) return matrix;

  const imageMap = new Map<string, string>();
  for (let i = secondaryHeaderIdx + 1; i < matrix.length; i += 1) {
    const sRow = matrix[i];
    if (!Array.isArray(sRow)) continue;
    const key = normalizeHeader(String(sRow[secondaryJoinColIdx] ?? ''));
    const img = String(sRow[imageColIdx] ?? '').trim();
    if (key && img && !imageMap.has(key)) {
      imageMap.set(key, img);
    }
  }

  const resultMatrix: unknown[][] = [];
  const newHeader = [...primaryHeader];
  let mainImageIdx = primaryHeaderNorm.findIndex((c) => c === 'imagen' || c === 'foto');
  if (mainImageIdx === -1) {
    mainImageIdx = newHeader.length;
    newHeader.push('Imagen');
  }
  resultMatrix.push(newHeader);

  for (let i = 1; i < secondaryHeaderIdx; i += 1) {
    const row = matrix[i];
    if (!Array.isArray(row)) continue;
    const filledCells = row.filter((c) => String(c ?? '').trim().length > 0);
    if (filledCells.length === 0) continue;

    const textJoined = row.map((c) => String(c ?? '')).join(' ').toLowerCase();
    if (
      textJoined.includes('total') ||
      textJoined.includes('saldo') ||
      textJoined.includes('debo') ||
      textJoined.includes('subtotal')
    ) {
      continue;
    }
    const nameOrKey = String(row[primaryJoinColIdx] ?? '').trim();
    if (!nameOrKey && filledCells.length <= 4) {
      continue;
    }
    if (filledCells.length <= 3 && row.some((c) => /^\d{4,}$/.test(String(c ?? '').trim()))) {
      continue;
    }

    const rowCopy = [...row];
    while (rowCopy.length < newHeader.length) {
      rowCopy.push('');
    }

    const joinKey = normalizeHeader(String(rowCopy[primaryJoinColIdx] ?? ''));
    if (joinKey && imageMap.has(joinKey)) {
      rowCopy[mainImageIdx] = imageMap.get(joinKey);
    }

    resultMatrix.push(rowCopy);
  }

  return resultMatrix;
}

/** Analiza todas las pestañas de un libro de Excel y selecciona o combina las hojas con productos. */
export function parseWorkbookSheets(workbook: XLSX.WorkBook): {
  matrix: unknown[][];
  sheets: SheetSummary[];
  sheetSelection: string;
} {
  const summaries: SheetSummary[] = [];
  const sheetMatrices = new Map<string, unknown[][]>();

  const positiveKeywords =
    /(producto|articulo|artículo|catalogo|catálogo|item|precio|lista|inventario|stock|venta|tarifa|ropa|calzado|hombre|mujer|niñ|oferta|general|datos|hoja|sheet)/i;
  const negativeKeywords =
    /(portada|resumen|intro|bienvenid|cover|indice|índice|instruccion|instrucción|parametro|parámetro|config|leeme|readme)/i;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false,
    });
    const matrix = rawMatrix.filter(
      (r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim().length > 0),
    );
    if (matrix.length === 0) {
      summaries.push({ name, rowCount: 0, columnCount: 0, hasHeaders: false, score: -100 });
      continue;
    }

    const colCount = Math.max(...matrix.map((r) => r.length));
    const headerRow = matrix[0] ?? [];
    const hasHeaders = isProbableHeaderRow(headerRow);

    let score = Math.min(matrix.length, 50);
    if (hasHeaders) score += 15;
    if (positiveKeywords.test(name)) score += 20;
    if (negativeKeywords.test(name)) score -= 40;

    summaries.push({
      name,
      rowCount: matrix.length,
      columnCount: colCount,
      hasHeaders,
      score,
    });
    sheetMatrices.set(name, matrix);
  }

  const viableSheets = summaries.filter((s) => s.rowCount > 0 && s.score > 0);

  if (viableSheets.length === 0) {
    const bestFallback = summaries.sort((a, b) => b.rowCount - a.rowCount)[0];
    const matrix = bestFallback ? (sheetMatrices.get(bestFallback.name) ?? []) : [];
    return {
      matrix,
      sheets: summaries,
      sheetSelection: bestFallback ? `Pestaña "${bestFallback.name}"` : 'Sin pestañas de datos',
    };
  }

  if (viableSheets.length === 1) {
    const sheetName = viableSheets[0]!.name;
    return {
      matrix: sheetMatrices.get(sheetName) ?? [],
      sheets: summaries,
      sheetSelection: `Pestaña "${sheetName}" (${viableSheets[0]!.rowCount} filas)`,
    };
  }

  const firstSheetName = viableSheets[0]!.name;
  const firstMatrix = sheetMatrices.get(firstSheetName)!;
  const firstHeader = (firstMatrix[0] ?? []).map((c) =>
    String(c ?? '')
      .trim()
      .toLowerCase(),
  );

  let canCombine = true;
  for (let i = 1; i < viableSheets.length; i += 1) {
    const sheetName = viableSheets[i]!.name;
    const m = sheetMatrices.get(sheetName)!;
    const h = (m[0] ?? []).map((c) =>
      String(c ?? '')
        .trim()
        .toLowerCase(),
    );
    const overlap = h.filter((header) => header.length > 0 && firstHeader.includes(header)).length;
    const hasImageCol = h.some((c) => c === 'imagen' || c === 'foto' || c === 'image');
    const hasPriceCol = h.some((c) => c.includes('precio') || c.includes('price') || c.includes('costo'));
    const isAuxiliaryTable = hasImageCol && !hasPriceCol;

    const minCols = Math.min(firstHeader.length, h.length);
    if (isAuxiliaryTable || (minCols > 0 && overlap < minCols * 0.4)) {
      canCombine = false;
      break;
    }
  }

  if (canCombine && viableSheets.length > 1) {
    const sheetWithHeader = viableSheets.find((s) => s.hasHeaders) ?? viableSheets[0]!;
    const baseHeaderRow = (sheetMatrices.get(sheetWithHeader.name)![0] ?? []).map((c) =>
      String(c ?? '').trim(),
    );

    const hasCategoryHeader = baseHeaderRow.some((h) =>
      /categoria|categoría|rubro|seccion|sección/i.test(h),
    );
    const combinedHeader = hasCategoryHeader ? [...baseHeaderRow] : [...baseHeaderRow, 'Categoría'];

    const combinedRows: unknown[][] = [combinedHeader];
    let totalItems = 0;

    for (const sheetSummary of viableSheets) {
      const sheetName = sheetSummary.name;
      const m = sheetMatrices.get(sheetName)!;
      const dataRows = sheetSummary.hasHeaders ? m.slice(1) : m;
      for (const row of dataRows) {
        if (!row || row.length === 0) continue;
        const newRow = [...row];
        while (newRow.length < baseHeaderRow.length) newRow.push('');
        if (!hasCategoryHeader) {
          newRow.push(sheetName);
        }
        combinedRows.push(newRow);
        totalItems += 1;
      }
    }

    return {
      matrix: combinedRows,
      sheets: summaries,
      sheetSelection: `Se combinaron ${viableSheets.length} pestañas (${viableSheets.map((s) => `'${s.name}'`).join(', ')}) con ${totalItems} productos`,
    };
  }

  viableSheets.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
  const bestSheet = viableSheets[0]!;
  let primaryMatrix = sheetMatrices.get(bestSheet.name) ?? [];

  // Buscar si alguna de las otras pestañas es una tabla auxiliar de imágenes/fotos
  const imageSheet = summaries.find((s) => {
    if (s.name === bestSheet.name) return false;
    const m = sheetMatrices.get(s.name);
    if (!m || m.length < 2) return false;
    const header = (m[0] ?? []).map((c) => normalizeHeader(String(c ?? '')));
    return (
      header.some((c) => c === 'imagen' || c === 'foto' || c === 'image') &&
      header.some(
        (c) =>
          c === 'cliente' ||
          c === 'producto' ||
          c === 'nombre' ||
          c.includes('pedido') ||
          c === 'sku',
      )
    );
  });

  if (imageSheet) {
    const imgMatrix = sheetMatrices.get(imageSheet.name)!;
    const compositeMatrix = [...primaryMatrix, ...imgMatrix];
    primaryMatrix = processCompositeTables(compositeMatrix);
    return {
      matrix: primaryMatrix,
      sheets: summaries,
      sheetSelection: `Pestaña principal "${bestSheet.name}" (${primaryMatrix.length - 1} productos) vinculada con fotos de "${imageSheet.name}"`,
    };
  }

  return {
    matrix: primaryMatrix,
    sheets: summaries,
    sheetSelection: `Pestaña "${bestSheet.name}" (${bestSheet.rowCount} filas)`,
  };
}

/**
 * Parsea cualquier archivo de catálogo (CSV, TSV, XLSX, XLS, ODS, TXT, JSON, PDF o texto libre).
 * Adapta de forma universal la estructura, infiriendo cabeceras y filas de datos.
 */
export function parseImportFile(
  buffer: Buffer,
  extension: ImportFileExtension,
  delimiter?: string,
): ParsedImportFile {
  if (buffer.length === 0) {
    throw new ImportParseError('invalid_file', 'El archivo está vacío.');
  }

  const format = sniffFileFormat(buffer, extension);

  // 1. Intentar JSON
  if (format === 'json') {
    const jsonParsed = parseJsonBuffer(buffer);
    if (jsonParsed && jsonParsed.rows.length > 0) return jsonParsed;
  }

  // 2. Intentar PDF
  if (format === 'pdf') {
    try {
      const pdfText = extractPdfText(buffer);
      if (pdfText.trim().length > 0) {
        const pdfParsed = parseUnstructuredLines(pdfText);
        if (pdfParsed.rows.length > 0) return pdfParsed;
      }
    } catch {
      // Continuar al fallback
    }
    return {
      headers: ['SKU', 'Nombre', 'Precio'],
      rows: [{ SKU: 'PDF-001', Nombre: 'Documento PDF importado', Precio: '0' }],
    };
  }

  let matrix: unknown[][] | null = null;
  let detectedSheets: SheetSummary[] | undefined;
  let detectedSelection: string | undefined;

  // 3. Intentar texto delimitado si el formato es CSV, TSV o TXT
  if (format === 'csv' || format === 'tsv' || format === 'txt') {
    try {
      const text = decodeCsvBuffer(buffer);
      const separator = delimiter && delimiter.length === 1 ? delimiter : detectDelimiter(text);
      const csvRows = parseCsvText(text, separator);
      if (csvRows.length > 0) {
        const maxCols = Math.max(...csvRows.map((r) => r.length));
        if (maxCols > 1) {
          matrix = csvRows;
        } else {
          const unstructured = parseUnstructuredLines(text);
          if (unstructured.rows.length > 0) return unstructured;
          matrix = csvRows;
        }
      }
    } catch {
      // Continuar a SheetJS
    }
  }

  // 4. Intentar SheetJS (Excel .xlsx, .xls, .ods, etc.) analizando todas las pestañas
  if (!matrix) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetResult = parseWorkbookSheets(workbook);
      if (sheetResult.matrix.length > 0) {
        matrix = sheetResult.matrix;
        detectedSheets = sheetResult.sheets;
        detectedSelection = sheetResult.sheetSelection;
      }
    } catch {
      try {
        const text = decodeCsvBuffer(buffer);
        const separator = delimiter && delimiter.length === 1 ? delimiter : detectDelimiter(text);
        const csvRows = parseCsvText(text, separator);
        if (csvRows.length > 0) matrix = csvRows;
      } catch {
        // Continuar
      }
    }
  }

  // 5. Fallback a líneas desestructuradas
  if (!matrix || matrix.length === 0) {
    const text = decodeCsvBuffer(buffer);
    const unstructured = parseUnstructuredLines(text);
    if (unstructured.rows.length > 0) return unstructured;
    throw new ImportParseError('empty_file', 'El archivo no contiene filas de datos.');
  }

  matrix = matrix.filter(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim().length > 0),
  );
  if (matrix.length === 0) {
    throw new ImportParseError('empty_file', 'El archivo no contiene filas de datos.');
  }

  matrix = processCompositeTables(matrix);

  const row0 = matrix[0] ?? [];
  const hasMultipleRows = matrix.length > 1;
  const looksLikeHeader = isProbableHeaderRow(row0);

  let headers: string[];
  let dataRows: unknown[][];

  if (hasMultipleRows && looksLikeHeader) {
    headers = makeUniqueHeaders(row0.map((cell) => String(cell ?? '')));
    dataRows = matrix.slice(1);
  } else if (!hasMultipleRows && !looksLikeHeader) {
    headers = generateDefaultHeaders(row0.length);
    dataRows = [row0];
  } else if (hasMultipleRows && !looksLikeHeader) {
    headers = generateDefaultHeaders(row0.length);
    dataRows = matrix;
  } else {
    headers = makeUniqueHeaders(row0.map((cell) => String(cell ?? '')));
    dataRows = matrix.slice(1);
  }

  if (dataRows.length === 0 && matrix.length > 0 && !looksLikeHeader) {
    headers = generateDefaultHeaders(row0.length);
    dataRows = [row0];
  }

  const rows = dataRows.map((cells) => {
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const val = cells[index] ?? '';
      row[header] = typeof val === 'string' ? val.trim() : val;
    });
    return row;
  });

  return {
    headers,
    rows: rows.filter((row) => hasAnyValue(row)),
    sheets: detectedSheets,
    sheetSelection: detectedSelection,
  };
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
