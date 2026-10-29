import type {
  ColumnMapping,
  ColumnType,
  ExtraFieldProposal,
  InferredColumn,
} from '@ventascatalogo/contracts';
import { sha256 } from '../../../../common/utils/crypto';
import {
  findHeader,
  HEADER_SYNONYMS,
  IMPORT_FIELDS,
  normalizeHeader,
  type ImportField,
} from '../normalize-header';

export const MAPPING_SIMILARITY_THRESHOLD = 0.72;

const NOISE_HEADERS = new Set([
  'total',
  'totales',
  'subtotal',
  'iva',
  'impuesto',
  'impuestos',
  'nota',
  'notas',
  'observaciones',
  'descuento',
]);

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[right.length];
}

function tokens(value: string): Set<string> {
  return new Set(normalizeHeader(value).split(' ').filter(Boolean));
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

/** Similitud 0..1 entre cabeceras: Levenshtein y solapamiento de tokens. */
export function similarity(left: string, right: string): number {
  const a = normalizeHeader(left);
  const b = normalizeHeader(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  const lev = 1 - levenshtein(a, b) / maxLen;
  const leftTokens = tokens(a);
  const rightTokens = tokens(b);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const containment = shared / Math.min(leftTokens.size, rightTokens.size);
  return Math.max(lev, jaccard(leftTokens, rightTokens) * 0.95, containment * 0.9);
}

/** Firma estable de encabezados (mismo set/orden ⇒ misma firma). */
export function headersSignature(headers: readonly string[]): string {
  return sha256(headers.map((header) => normalizeHeader(header)).join('|'));
}

export function isNoiseColumn(header: string, emptyRatio: number): boolean {
  const normalized = normalizeHeader(header);
  if (emptyRatio > 0.8) return true;
  if (NOISE_HEADERS.has(normalized)) return true;
  return /^(total|subtotal|iva|impuesto|nota|observacion|descuento)\b/.test(normalized);
}

export interface SuggestedMapping {
  mapping: ColumnMapping;
  usedColumns: Set<string>;
}

/** Solapamiento de tokens entre dos sets de cabeceras (0..1). */
export function headersOverlap(left: readonly string[], right: readonly string[]): number {
  return jaccard(
    new Set(left.flatMap((header) => [...tokens(header)])),
    new Set(right.flatMap((header) => [...tokens(header)])),
  );
}

function scoreForHeader(header: string, field: ImportField): number {
  let best = similarity(header, field);
  for (const synonym of HEADER_SYNONYMS[field]) {
    best = Math.max(best, similarity(header, synonym));
  }
  return best;
}

/** Mapeo determinista por sinónimos + similitud (una columna por campo). */
export function suggestMapping(headers: readonly string[]): SuggestedMapping {
  const candidates: Array<{ field: ImportField; header: string; score: number }> = [];
  for (const header of headers) {
    for (const field of IMPORT_FIELDS) {
      const score = scoreForHeader(header, field);
      if (score >= MAPPING_SIMILARITY_THRESHOLD) {
        candidates.push({ field, header, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const mapping: ColumnMapping = {};
  const usedColumns = new Set<string>();
  const usedFields = new Set<ImportField>();
  for (const candidate of candidates) {
    if (usedFields.has(candidate.field) || usedColumns.has(candidate.header)) continue;
    mapping[candidate.field] = candidate.header;
    usedFields.add(candidate.field);
    usedColumns.add(candidate.header);
  }
  return { mapping, usedColumns };
}

function slugKey(header: string, used: Set<string>): string {
  const base =
    normalizeHeader(header)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'campo';
  const withLetter = /^[a-z]/.test(base) ? base : `campo_${base}`;
  let key = withLetter.length >= 2 ? withLetter : `${withLetter}_x`;
  let suffix = 2;
  while (used.has(key)) {
    key = `${withLetter}_${suffix}`.slice(0, 40);
    suffix += 1;
  }
  used.add(key);
  return key;
}

export interface IgnoredColumnEntry {
  column: string;
  reason: string;
}

export interface HeuristicProposal {
  mapping: ColumnMapping;
  extraFields: ExtraFieldProposal[];
  ignoredColumns: IgnoredColumnEntry[];
  warnings: string[];
  explanation: string;
  confidence: number;
  headersSignature: string;
}

/** Propuesta determinista (A) a partir de columnas inferidas y una base opcional. */
export function buildHeuristicProposal(input: {
  headers: readonly string[];
  columns: readonly InferredColumn[];
  signature: string;
  baseMapping?: ColumnMapping;
  baseExtraFields?: ExtraFieldProposal[];
  presetName?: string;
}): HeuristicProposal {
  const { mapping, usedColumns } = suggestMapping(input.headers);

  if (input.baseMapping) {
    for (const field of IMPORT_FIELDS) {
      const wanted = input.baseMapping[field];
      if (!wanted) continue;
      const header = findHeader(input.headers, wanted);
      if (!header) continue;
      // La base (plantilla) no debe dejar dos campos apuntando a la misma columna,
      // salvo el caso precio/costo compartido (hojas que solo traen COSTO).
      const sharedCostPrice =
        (field === 'cost' && mapping.price === header) ||
        (field === 'price' && mapping.cost === header);
      const duplicate =
        !sharedCostPrice &&
        IMPORT_FIELDS.some((other) => other !== field && mapping[other] === header);
      if (!duplicate) {
        mapping[field] = header;
        usedColumns.add(header);
      }
    }
  }

  const extraWarnings: string[] = [];

  // Fallback de nombre: columnas de producto conocidas o el TEXT más "largo"
  // que no sea de persona/contacto/fecha. Evita perder filas de hojas de pedido.
  if (!mapping.name) {
    const excluded =
      /(cliente|telefono|correo|email|direccion|fecha|estado|urgencia|total|nota|observacion|pedido|orden)/;
    const priority =
      /(producto|articulo|descripcion|nombre|item|prenda|camisa|playera|blusa|vestido|modelo|concepto)/;
    const candidates = input.columns.filter((column) => {
      if (usedColumns.has(column.header)) return false;
      if (column.type !== 'TEXT') return false;
      if (excluded.test(column.normalized)) return false;
      if (isNoiseColumn(column.header, column.emptyRatio)) return false;
      return true;
    });
    const averageLength = (samples: readonly string[]): number =>
      samples.length === 0
        ? 0
        : samples.reduce((sum, sample) => sum + sample.length, 0) / samples.length;
    candidates.sort((a, b) => {
      const priorityA = priority.test(a.normalized) ? 1 : 0;
      const priorityB = priority.test(b.normalized) ? 1 : 0;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return averageLength(b.samples) - averageLength(a.samples);
    });
    const chosen = candidates.find((column) => averageLength(column.samples) >= 5);
    if (chosen) {
      mapping.name = chosen.header;
      usedColumns.add(chosen.header);
      extraWarnings.push(
        `No se detectó una columna de nombre; se usó "${chosen.header}" como nombre de producto.`,
      );
    }
  }

  // Precio: si el archivo solo trae costo, se usa como precio de venta.
  if (!mapping.price && mapping.cost) {
    mapping.price = mapping.cost;
    extraWarnings.push('No se detectó precio; se usó la columna de costo como precio de venta.');
  }

  const extraFields: ExtraFieldProposal[] = [];
  const usedKeys = new Set<string>();
  for (const proposal of input.baseExtraFields ?? []) {
    if (!input.headers.includes(proposal.column)) continue;
    if (usedColumns.has(proposal.column)) continue;
    const key = slugKey(proposal.key || proposal.column, usedKeys);
    extraFields.push({ ...proposal, key });
    usedColumns.add(proposal.column);
  }

  const ignoredColumns: IgnoredColumnEntry[] = [];
  const columnByHeader = new Map(input.columns.map((column) => [column.header, column]));
  for (const header of input.headers) {
    if (usedColumns.has(header)) continue;
    const column = columnByHeader.get(header);
    const emptyRatio = column?.emptyRatio ?? 0;
    if (isNoiseColumn(header, emptyRatio)) {
      ignoredColumns.push({
        column: header,
        reason:
          emptyRatio > 0.8
            ? 'Columna mayormente vacía (más del 80% sin datos).'
            : 'Columna de totales/notas: se ignora para no duplicar montos.',
      });
      continue;
    }
    const type: ColumnType = column?.type === 'UNKNOWN' ? 'TEXT' : (column?.type ?? 'TEXT');
    extraFields.push({
      column: header,
      key: slugKey(header, usedKeys),
      label: header.trim().slice(0, 80),
      type,
    });
    usedColumns.add(header);
  }

  const warnings: string[] = [...extraWarnings];
  if (!mapping.sku) warnings.push('No se detectó una columna de SKU/código.');
  if (!mapping.name) warnings.push('No se detectó una columna de nombre/artículo.');
  if (!mapping.price) warnings.push('No se detectó una columna de precio.');
  if (input.presetName) warnings.push(`Se aplicó la plantilla "${input.presetName}".`);

  const requiredMapped = ['sku', 'name', 'price'].filter(
    (field) => mapping[field as ImportField],
  ).length;
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const coverage = (mappedCount + extraFields.length) / Math.max(1, input.headers.length);
  const confidence = Math.min(
    1,
    Math.round((0.7 * (requiredMapped / 3) + 0.3 * coverage) * 100) / 100,
  );

  const explanation = [
    `Analicé ${input.headers.length} columnas: mapeé ${mappedCount} a campos estándar`,
    extraFields.length > 0
      ? `y propuse ${extraFields.length} campos extra (${extraFields
          .map((field) => field.label)
          .join(', ')}).`
      : 'sin campos extra.',
    ignoredColumns.length > 0 ? `Ignoré ${ignoredColumns.length} columna(s) de ruido.` : '',
    input.presetName ? `Usé la plantilla "${input.presetName}" como base.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    mapping,
    extraFields,
    ignoredColumns,
    warnings,
    explanation,
    confidence,
    headersSignature: input.signature,
  };
}
