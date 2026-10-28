import type { ColumnType, InferredColumn } from '@ventascatalogo/contracts';
import { normalizeHeader } from '../normalize-header';

const CURRENCY_HINT = /(precio|pvp|monto|valor|importe|costo|coste|total|saldo)/i;
const IMAGE_HINT = /(imagen|foto|image|thumbnail)/i;
const DATE_HINT = /(fecha|vencimiento|emision|emisión)/i;
const STOCK_HINT = /(stock|existencia|cantidad|cant\.?|unidades)/i;

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text);
}

function looksLikeImage(text: string): boolean {
  return looksLikeUrl(text) && /\.(png|jpe?g|webp|gif|svg|avif)(\?|#|$)/i.test(text);
}

function looksLikeDate(text: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(text)) return true;
  return /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text);
}

const BOOLEAN_WORDS = new Set([
  'true',
  'false',
  'si',
  'sí',
  'no',
  'yes',
  'activo',
  'inactivo',
  'on',
  'off',
]);

function looksLikeBooleanSet(values: string[]): boolean {
  const distinct = new Set(values.map((value) => value.toLowerCase()));
  if (![...distinct].every((value) => BOOLEAN_WORDS.has(value) || value === '1' || value === '0')) {
    return false;
  }
  return distinct.size <= 2;
}

function looksLikeCurrency(text: string): boolean {
  if (!/\d/.test(text)) return false;
  if (/[₡$€£]|(^|\s)(CRC|USD|EUR)(\s|$)/i.test(text)) return true;
  // 1.234,56 / 1,234.56 / 1 234 (separador de miles + decimales).
  return /^\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?$/.test(text);
}

function looksLikeNumber(text: string): boolean {
  return /^-?\d+(?:[.,]\d+)?$/.test(text);
}

/** Infiere el tipo de una columna por muestreo + pista del encabezado. */
export function inferColumnType(
  header: string,
  samples: string[],
): { type: ColumnType; confidence: number } {
  const nonEmpty = samples.filter((value) => value.length > 0);
  if (nonEmpty.length === 0) return { type: 'UNKNOWN', confidence: 0 };

  const ratio = (predicate: (value: string) => boolean) =>
    nonEmpty.filter(predicate).length / nonEmpty.length;
  const hint = (
    value: string,
    type: ColumnType,
    hintRe: RegExp,
    predicate: (value: string) => boolean,
  ): { type: ColumnType; confidence: number } =>
    hintRe.test(header)
      ? { type, confidence: Math.max(0.6, ratio(predicate)) }
      : { type, confidence: ratio(predicate) };

  const imageRatio = ratio(looksLikeImage);
  if (imageRatio >= 0.8) return { type: 'IMAGE', confidence: imageRatio };

  const urlRatio = ratio(looksLikeUrl);
  if (urlRatio >= 0.8) {
    if (IMAGE_HINT.test(header) && imageRatio >= 0.5) {
      return { type: 'IMAGE', confidence: Math.max(imageRatio, 0.6) };
    }
    return { type: 'URL', confidence: urlRatio };
  }

  if (looksLikeBooleanSet(nonEmpty)) {
    return { type: 'BOOLEAN', confidence: 1 };
  }

  const dateRatio = ratio(looksLikeDate);
  if (dateRatio >= 0.8 || (DATE_HINT.test(header) && dateRatio > 0)) {
    return { type: 'DATE', confidence: Math.max(0.6, dateRatio) };
  }

  const currencyRatio = ratio(looksLikeCurrency);
  if (currencyRatio >= 0.8 || (CURRENCY_HINT.test(header) && currencyRatio > 0)) {
    return { type: 'CURRENCY', confidence: Math.max(0.6, currencyRatio) };
  }

  const numberRatio = ratio(looksLikeNumber);
  if (numberRatio >= 0.8) {
    return { type: 'NUMBER', confidence: numberRatio };
  }

  const stockRatio = ratio((value) => /^\d+$/.test(value));
  if (STOCK_HINT.test(header) && stockRatio >= 0.8) {
    return { type: 'NUMBER', confidence: stockRatio };
  }

  const distinct = new Set(nonEmpty.map((value) => value.toLowerCase()));
  const repeatedRows = nonEmpty.length - distinct.size;
  // ENUM solo con pocos valores distintos y repetición REAL: medidas/tallas
  // cortas con muchos valores únicos son texto y no deben coaccionarse.
  const enumLike =
    distinct.size >= 2 &&
    distinct.size <= 12 &&
    repeatedRows >= 2 &&
    distinct.size / nonEmpty.length <= 0.6;
  const shortValues = nonEmpty.every((value) => value.length <= 28);
  if (enumLike && shortValues) {
    return { type: 'ENUM', confidence: 0.7 };
  }

  return { type: 'TEXT', confidence: 0.6 + 0.4 * ratio((value) => !looksLikeNumber(value)) };
}

export function inferColumns(
  headers: readonly string[],
  rows: readonly Record<string, unknown>[],
): InferredColumn[] {
  return headers.map((header) => {
    const values = rows.map((row) => clean(row[header]));
    const samples = values.filter((value) => value.length > 0).slice(0, 5);
    const emptyRatio = rows.length === 0 ? 1 : values.filter((v) => !v).length / rows.length;
    const inferred = inferColumnType(header, samples);
    return {
      header,
      normalized: normalizeHeader(header),
      type: inferred.type,
      samples,
      emptyRatio: Math.round(emptyRatio * 100) / 100,
      confidence: Math.round(inferred.confidence * 100) / 100,
    };
  });
}
