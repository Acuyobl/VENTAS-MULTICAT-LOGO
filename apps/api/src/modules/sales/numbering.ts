/** Prefijos de numeración de documentos comerciales. */
export const QUOTE_NUMBER_PREFIX = 'COT';
export const ORDER_NUMBER_PREFIX = 'PED';

/** Año comercial en la zona de Costa Rica (UTC-6), no en UTC. */
export function businessYear(date: Date = new Date()): number {
  const cr = new Date(date.getTime() - 6 * 60 * 60 * 1000);
  return cr.getUTCFullYear();
}

/**
 * Número secuencial por organización y año: `COT-2026-000001` / `PED-2026-000001`.
 * La secuencia no se trunca: a partir de 1 000 000 crece a 7 dígitos.
 */
export function formatBusinessNumber(prefix: string, year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) {
    throw new Error(`invalid_business_year:${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`invalid_business_sequence:${sequence}`);
  }
  return `${prefix}-${year}-${String(sequence).padStart(6, '0')}`;
}

export function formatQuoteNumber(year: number, sequence: number): string {
  return formatBusinessNumber(QUOTE_NUMBER_PREFIX, year, sequence);
}

export function formatOrderNumber(year: number, sequence: number): string {
  return formatBusinessNumber(ORDER_NUMBER_PREFIX, year, sequence);
}

/** Inverso de `formatBusinessNumber`; `null` si el número no corresponde. */
export function parseBusinessNumber(
  value: string,
  prefix: string,
  year?: number,
): { year: number; sequence: number } | null {
  const match = /^([A-Z]{3})-(\d{4})-(\d{6,})$/.exec(value);
  if (!match || match[1] !== prefix) return null;
  const parsedYear = Number(match[2]);
  if (year !== undefined && parsedYear !== year) return null;
  return { year: parsedYear, sequence: Number(match[3]) };
}

/**
 * Prefijo de búsqueda del último número de una organización/año; el `MAX(number)`
 * lexicográfico funciona porque el relleno es fijo por longitud de secuencia.
 */
export function numberPrefix(prefix: string, year: number): string {
  return `${prefix}-${year}-`;
}

/** Clave estable para el advisory lock de Postgres por organización/año/documento. */
export function businessNumberLockKey(
  kind: 'quote' | 'order',
  organizationId: string,
  year: number,
): string {
  return `business_number:${kind}:${organizationId}:${year}`;
}
