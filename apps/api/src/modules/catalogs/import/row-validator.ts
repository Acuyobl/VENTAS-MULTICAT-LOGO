import { toMinorAmount, type Currency } from '@ventascatalogo/contracts';
import type { ResolvedMapping } from './normalize-header';

export type ImportErrorCode =
  'DUPLICATE_SKU' | 'MISSING_PRICE' | 'INVALID_PRICE' | 'MISSING_NAME' | 'MISSING_SKU';

/** Advertencias (no bloquean la fila) que produce la resolución de imágenes. */
export type ImportWarningCode = 'IMAGE_DOWNLOAD_FAILED' | 'IMAGE_UNRESOLVED';

export type ImportIssueCode = ImportErrorCode | ImportWarningCode;

export type ImportIssueSeverity = 'error' | 'warning';

export interface ImportRowIssueData {
  rowNumber: number;
  severity: ImportIssueSeverity;
  code: ImportIssueCode;
  message: string;
  rawData: Record<string, unknown>;
}

/** Producto validado antes de resolver su imagen (la columna trae texto crudo). */
export interface ImportProductRow {
  rowNumber: number;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  priceMinor: bigint;
  costMinor: bigint | null;
  stock: number | null;
  imageRef: string | null;
  rawData: Record<string, unknown>;
}

export interface ValidateRowsResult {
  totalRows: number;
  products: ImportProductRow[];
  issues: ImportRowIssueData[];
  /** Filas distintas con al menos un error (las que van a cuarentena). */
  quarantineRows: number;
}

export interface ValidateRowsOptions {
  mapping: ResolvedMapping;
  currency: Currency;
}

const MAX_STOCK = 1_000_000_000;

/**
 * Valida y normaliza las filas del archivo.
 *
 * Reglas F1: las filas con error **no** crean producto y quedan en cuarentena con
 * un código estable; el `rowNumber` es el número de fila del archivo (la cabecera
 * es la fila 1). El dinero se convierte con `toMinorAmount` (nunca floats).
 */
export function validateImportRows(
  rows: readonly Record<string, unknown>[],
  options: ValidateRowsOptions,
): ValidateRowsResult {
  const { mapping, currency } = options;
  const products: ImportProductRow[] = [];
  const issues: ImportRowIssueData[] = [];
  const seenSkus = new Map<string, number>();
  const errorRows = new Set<number>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rawData = { ...row };
    const sku = cellText(row, mapping.sku);
    const name = collapseSpaces(cellText(row, mapping.name));
    let rowHasError = false;

    const addIssue = (code: ImportErrorCode, message: string): void => {
      issues.push({ rowNumber, severity: 'error', code, message, rawData });
      rowHasError = true;
    };

    if (!sku) {
      addIssue('MISSING_SKU', 'La fila no tiene SKU.');
    } else {
      const key = sku.toUpperCase();
      const firstRow = seenSkus.get(key);
      if (firstRow !== undefined) {
        addIssue('DUPLICATE_SKU', `El SKU "${sku}" ya apareció en la fila ${firstRow}.`);
      } else {
        seenSkus.set(key, rowNumber);
      }
    }

    if (!name) addIssue('MISSING_NAME', 'La fila no tiene nombre de producto.');

    const price = parsePriceCell(cellText(row, mapping.price), currency);
    let priceMinor = 0n;
    if (price.ok) {
      priceMinor = price.minor;
    } else {
      addIssue(price.code, price.message);
    }

    if (rowHasError) {
      errorRows.add(rowNumber);
      return;
    }

    products.push({
      rowNumber,
      sku,
      name,
      description: nullableText(cellText(row, mapping.description)),
      category: nullableText(cellText(row, mapping.category)),
      brand: nullableText(cellText(row, mapping.brand)),
      priceMinor,
      costMinor: parseOptionalMinor(cellText(row, mapping.cost), currency),
      stock: parseStock(cellText(row, mapping.stock)),
      imageRef: nullableText(cellText(row, mapping.image)),
      rawData,
    });
  });

  return {
    totalRows: rows.length,
    products,
    issues,
    quarantineRows: errorRows.size,
  };
}

/** Quita el símbolo de moneda y espacios: `₡ 12.600` → `12.600`. */
export function cleanMoneyText(value: string): string {
  return value
    .replace(/[\u20a1$₡]/g, '')
    .replace(/[\s\u00a0]/g, '')
    .trim();
}

type PriceParse =
  | { ok: true; minor: bigint }
  | { ok: false; code: 'MISSING_PRICE' | 'INVALID_PRICE'; message: string };

export function parsePriceCell(value: string, currency: Currency): PriceParse {
  const cleaned = cleanMoneyText(value);
  if (!cleaned) {
    return { ok: false, code: 'MISSING_PRICE', message: 'La fila no tiene precio.' };
  }

  let minor: bigint;
  try {
    minor = toMinorAmount(cleaned, currency);
  } catch {
    return {
      ok: false,
      code: 'INVALID_PRICE',
      message: `El precio "${value}" no es un monto válido.`,
    };
  }

  if (minor < 0n) {
    return {
      ok: false,
      code: 'INVALID_PRICE',
      message: `El precio "${value}" es negativo.`,
    };
  }
  if (minor === 0n) {
    return { ok: false, code: 'MISSING_PRICE', message: 'El precio es cero.' };
  }
  return { ok: true, minor };
}

/** Costo opcional: si no se puede interpretar se importa sin costo (dato accesorio). */
export function parseOptionalMinor(value: string, currency: Currency): bigint | null {
  const cleaned = cleanMoneyText(value);
  if (!cleaned) return null;
  try {
    const minor = toMinorAmount(cleaned, currency);
    return minor < 0n ? null : minor;
  } catch {
    return null;
  }
}

/** Stock opcional: entero no negativo o `null` (stock no controlado). */
export function parseStock(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number.parseInt(text, 10);
  return parsed <= MAX_STOCK ? parsed : null;
}

function cellText(row: Record<string, unknown>, header: string | undefined): string {
  if (!header) return '';
  const value = row[header];
  if (value === null || value === undefined) return '';
  return String(value);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
