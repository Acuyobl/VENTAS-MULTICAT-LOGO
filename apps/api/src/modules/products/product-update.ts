import type { ProductUpdateInput } from '@ventascatalogo/contracts';

export type ProductEditableField =
  'name' | 'description' | 'category' | 'brand' | 'priceMinor' | 'costMinor' | 'stock';

export interface ProductUpdateDiff {
  /** Cambios efectivos solo con los campos enviados y distintos al valor actual. */
  data: Partial<Record<ProductEditableField, string | bigint | number | null>>;
  /** Valores serializables para el `before` del audit. */
  before: Record<string, unknown>;
  /** Valores serializables para el `after` del audit. */
  after: Record<string, unknown>;
}

const EDITABLE_FIELDS: ProductEditableField[] = [
  'name',
  'description',
  'category',
  'brand',
  'priceMinor',
  'costMinor',
  'stock',
];

export interface ProductCurrentValues {
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  priceMinor: bigint;
  costMinor: bigint | null;
  stock: number | null;
}

function serialize(value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Diff determinista before/after para `product.updated`: ignora campos no
 * enviados y los que no cambian; `priceMinor`/`costMinor` viajan como string.
 */
export function buildProductUpdateDiff(
  current: ProductCurrentValues,
  input: ProductUpdateInput,
): ProductUpdateDiff {
  const data: ProductUpdateDiff['data'] = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};

  for (const field of EDITABLE_FIELDS) {
    const next = input[field];
    if (next === undefined) continue;
    const previous = current[field];
    const changed =
      typeof previous === 'bigint' || typeof next === 'bigint'
        ? String(previous) !== String(next)
        : previous !== next;
    if (!changed) continue;
    data[field] = next as ProductUpdateDiff['data'][ProductEditableField];
    before[field] = serialize(previous);
    after[field] = serialize(next);
  }

  return { data, before, after };
}

/** Solo la versión activa del catálogo es editable (inmutabilidad histórica). */
export function isProductVersionEditable(input: {
  versionId: string;
  versionStatus: string;
  activeVersionId: string | null;
}): boolean {
  return input.versionStatus === 'ACTIVE' && input.activeVersionId === input.versionId;
}
