import type { ColumnMapping } from '@ventascatalogo/contracts';

/** Campos destino que el importador sabe mapear. */
export const IMPORT_FIELDS = [
  'sku',
  'name',
  'description',
  'category',
  'brand',
  'price',
  'cost',
  'stock',
  'image',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export type ResolvedMapping = Record<ImportField, string | undefined>;

/**
 * Sinónimos por campo destino. Se comparan contra la cabecera **normalizada**
 * (minúsculas, sin acentos, sin signos y con espacios colapsados), así que un
 * archivo que traiga `Código`, `CÓDIGO` o `codigo` mapea igual.
 */
export const HEADER_SYNONYMS: Record<ImportField, readonly string[]> = {
  sku: ['sku', 'codigo', 'codigo producto', 'ref', 'referencia'],
  name: [
    'nombre',
    'producto',
    'articulo',
    'descripcion corta',
    'titulo',
    'camisa',
    'camisas',
    'playera',
    'blusa',
    'vestido',
    'prenda',
    'prendas',
    'item',
    'concepto',
  ],
  description: ['descripcion', 'detalle'],
  category: ['categoria', 'rubro', 'linea'],
  brand: ['marca', 'fabricante'],
  price: ['precio', 'precio venta', 'precio final', 'pvp', 'precio unitario'],
  cost: ['costo', 'coste', 'precio compra', 'costo unitario'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'cant', 'disponible'],
  image: ['imagen', 'foto', 'url imagen', 'imagen url'],
};

/** Normaliza una cabecera: sin acentos, minúsculas, solo [a-z0-9] y espacios simples. */
export function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface HeaderMappingResult {
  mapping: ResolvedMapping;
  /**
   * Columnas indicadas explícitamente en el `mapping` que no existen en el
   * archivo. El servicio las reporta como `VALIDATION_FAILED` para no importar
   * en silencio con columnas equivocadas.
   */
  unmatchedColumns: string[];
}

/**
 * Resuelve qué columna del archivo alimenta cada campo destino.
 *
 * Precedencia: el `mapping` explícito del usuario gana sobre el automático y se
 * respeta aunque la cabecera no esté entre los sinónimos. El auto-mapeo nunca
 * reutiliza la misma columna para dos campos (salvo que el usuario lo pida).
 */
export function resolveHeaderMapping(
  headers: readonly string[],
  explicit?: ColumnMapping,
): HeaderMappingResult {
  const byNormalized = new Map<string, string>();
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, header);
  }

  const mapping = Object.fromEntries(
    IMPORT_FIELDS.map((field) => [field, undefined]),
  ) as ResolvedMapping;
  const unmatchedColumns: string[] = [];
  const used = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const explicitColumn = explicit?.[field];
    if (!explicitColumn) continue;
    const header = findHeader(headers, explicitColumn);
    if (!header) {
      unmatchedColumns.push(explicitColumn);
      continue;
    }
    mapping[field] = header;
    used.add(header);
  }

  for (const field of IMPORT_FIELDS) {
    // Un campo con mapping explícito se respeta: si la columna indicada no existe
    // no se sustituye en silencio por una heurística (el servicio responde 400).
    if (mapping[field] || explicit?.[field]) continue;
    for (const synonym of HEADER_SYNONYMS[field]) {
      const candidate = byNormalized.get(normalizeHeader(synonym));
      if (candidate && !used.has(candidate)) {
        mapping[field] = candidate;
        used.add(candidate);
        break;
      }
    }
  }

  // Archivos de pedidos suelen traer COSTO pero no PRECIO: se usa costo como venta.
  if (!mapping.price && mapping.cost) mapping.price = mapping.cost;

  return { mapping, unmatchedColumns };
}

/** Busca una columna por texto exacto y, si no aparece, por cabecera normalizada. */
export function findHeader(headers: readonly string[], wanted: string): string | undefined {
  const exact = headers.find((header) => header === wanted);
  if (exact) return exact;
  const normalized = normalizeHeader(wanted);
  if (!normalized) return undefined;
  return headers.find((header) => normalizeHeader(header) === normalized);
}
