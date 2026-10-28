export type Currency = 'CRC' | 'USD';

export const MINOR_FACTOR: Record<Currency, number> = { CRC: 1, USD: 100 };

/**
 * Convierte un importe de texto a la unidad menor de la moneda.
 *
 * Reglas de separadores (el formato de entrada puede venir de Excel, CSV o Google Sheets):
 * - El último separador seguido de 1-2 dígitos es decimal; el resto son separadores de miles.
 * - Un separador seguido de exactamente 3 dígitos es separador de miles (`'5.000'` = 5000).
 * - CRC no tiene decimales: si el texto trae parte decimal se redondea al colón (half-up).
 * - USD usa 2 decimales: se completa o se trunca la parte decimal.
 */
export function toMinorAmount(amount: string, currency: Currency): bigint {
  const raw = amount.trim().replace(/[\s\u00a0]/g, '');
  if (!/^-?\d[\d.,]*$/.test(raw)) throw new Error(`invalid_amount:${amount}`);

  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;

  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');
  const lastSeparator = Math.max(lastDot, lastComma);

  let integerPart = body;
  let fractionPart = '';

  if (lastSeparator !== -1) {
    const after = body.slice(lastSeparator + 1);
    if (/^\d{1,2}$/.test(after)) {
      fractionPart = after;
      integerPart = body.slice(0, lastSeparator);
    }
    // Con 3 dígitos (o más) el separador es de miles: `integerPart` conserva todo el
    // cuerpo y los separadores se eliminan al extraer los dígitos.
  }

  const integerDigits = integerPart.replace(/[.,]/g, '');
  if (!/^\d+$/.test(integerDigits) || integerDigits.length === 0) {
    throw new Error(`invalid_amount:${amount}`);
  }

  const units = BigInt(integerDigits);

  let minor: bigint;
  if (currency === 'CRC') {
    minor = units;
    if (fractionPart.length > 0) {
      const scale = 10n ** BigInt(fractionPart.length);
      const numerator = units * scale + BigInt(fractionPart);
      // Redondeo half-up al colón entero.
      minor = (numerator + scale / 2n) / scale;
    }
  } else {
    const decimals = BigInt(fractionPart.padEnd(2, '0').slice(0, 2) || '0');
    minor = units * BigInt(MINOR_FACTOR.USD) + decimals;
  }

  return negative ? -minor : minor;
}

export function formatMoney(amountMinor: bigint, currency: Currency, locale = 'es-CR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(Number(amountMinor) / MINOR_FACTOR[currency]);
}

export interface TaxLineInput {
  unitPriceMinor: bigint;
  quantity: number;
  discountMinor?: bigint;
}

export interface Totals {
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
}

/**
 * Calcula totales por línea con IVA en puntos base. El IVA se calcula por línea sobre la
 * base después de descuentos y se redondea al entero más cercano (half-up) para no
 * acumular centavos fantasma. `subtotalMinor` es neto de descuento (y de IVA cuando está
 * incluido), de modo que `totalMinor = subtotalMinor + taxMinor` en ambos casos.
 */
export function calculateTotals(
  lines: TaxLineInput[],
  taxRateBp = 1300,
  taxIncluded = true,
): Totals {
  let subtotal = 0n;
  let discount = 0n;
  let tax = 0n;

  for (const line of lines) {
    const lineDiscount = line.discountMinor ?? 0n;
    const taxable = line.unitPriceMinor * BigInt(line.quantity) - lineDiscount;
    discount += lineDiscount;

    if (taxIncluded) {
      const divisor = 10_000n + BigInt(taxRateBp);
      const base = (taxable * 10_000n) / divisor;
      subtotal += base;
      tax += taxable - base;
    } else {
      subtotal += taxable;
      tax += (taxable * BigInt(taxRateBp) + 5_000n) / 10_000n;
    }
  }

  return {
    subtotalMinor: subtotal,
    discountMinor: discount,
    taxMinor: tax,
    totalMinor: subtotal + tax,
  };
}
