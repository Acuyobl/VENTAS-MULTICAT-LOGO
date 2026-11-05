import type { ImportMode } from '@ventascatalogo/contracts';

export interface CarryProduct {
  sku: string;
}

/**
 * MERGE: productos de la versión activa que siguen vigentes porque su SKU no
 * aparece en el archivo nuevo. REPLACE no arrastra nada.
 */
export function pickCarriedOverProducts<T extends CarryProduct>(
  activeProducts: readonly T[],
  importedSkus: readonly string[],
  mode: ImportMode,
): T[] {
  if (mode !== 'MERGE') return [];
  const imported = new Set(importedSkus.map((sku) => sku.toUpperCase()));
  const seen = new Set<string>();
  return activeProducts.filter((product) => {
    const key = product.sku.toUpperCase();
    if (imported.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Filas del resultado que cuentan como bloqueantes (para guardar plantilla). */
export function hasBlockingErrors(
  issues: ReadonlyArray<{ severity: string }>,
  quarantineRows: number,
): boolean {
  return quarantineRows > 0 || issues.some((issue) => issue.severity === 'error');
}
