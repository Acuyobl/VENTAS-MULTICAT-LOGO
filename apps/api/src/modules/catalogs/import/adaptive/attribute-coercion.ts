import { toMinorAmount, type ColumnType, type Currency } from '@ventascatalogo/contracts';
import type { ExtraFieldProposal } from '@ventascatalogo/contracts';

function clean(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseFlexibleNumber(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseBoolean(raw: string): boolean | null {
  const normalized = raw.trim().toLowerCase();
  if (['true', 'si', 'sí', 'yes', '1', 'activo', 'on'].includes(normalized)) return true;
  if (['false', 'no', '0', 'inactivo', 'off'].includes(normalized)) return false;
  return null;
}

/** Coacciona una celda según el tipo propuesto; `undefined` = no escribir. */
export function coerceAttributeValue(
  raw: unknown,
  type: ColumnType,
  currency: Currency = 'CRC',
): unknown {
  const text = clean(raw);
  if (text.length === 0) return undefined;
  switch (type) {
    case 'NUMBER': {
      // Solo números puros: `1/4`, `16 oz` o `1/4 x 2` se conservan como texto.
      if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return text;
      return parseFlexibleNumber(text) ?? text;
    }
    case 'CURRENCY': {
      if (!/\d/.test(text)) return text;
      try {
        const cleaned = text.replace(/[^\d.,-]/g, '');
        const minor = toMinorAmount(cleaned, currency);
        // CRC no tiene decimales (minor = colones); USD usa centavos.
        return Number(minor) / (currency === 'USD' ? 100 : 1);
      } catch {
        return text;
      }
    }
    case 'BOOLEAN': {
      const value = parseBoolean(text);
      return value === null ? text : value;
    }
    case 'DATE': {
      // Solo fechas reales: nunca interpretar `1/4` como el 4 de enero.
      const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const local = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(text);
      if (local) {
        const year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
        const month = String(Number(local[2])).padStart(2, '0');
        const day = String(Number(local[1])).padStart(2, '0');
        return [year, month, day].join('-');
      }
      return text;
    }
    case 'TEXT':
    case 'ENUM':
    case 'URL':
    case 'IMAGE':
    case 'UNKNOWN':
    default:
      return text;
  }
}

/**
 * Convierte los campos extra elegidos por el humano en un objeto `attributes`
 * (clave = `key` del campo). Las celdas vacías no se escriben.
 */
export function coerceExtraAttributes(
  row: Record<string, unknown>,
  extraFields: readonly ExtraFieldProposal[],
  currency: Currency = 'CRC',
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  for (const field of extraFields) {
    const value = coerceAttributeValue(row[field.column], field.type, currency);
    if (value !== undefined) attributes[field.key] = value;
  }
  return attributes;
}
