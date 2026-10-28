import { describe, expect, it } from 'vitest';
import type { ColumnMapping } from '@ventascatalogo/contracts';
import { normalizeHeader, resolveHeaderMapping } from './normalize-header';

const FIXTURE_HEADERS = [
  'SKU',
  'Nombre',
  'Descripción',
  'Categoría',
  'Marca',
  'Precio',
  'Costo',
  'Stock',
  'Imagen',
];

describe('normalizeHeader', () => {
  it('quita acentos, mayúsculas, signos y espacios repetidos', () => {
    expect(normalizeHeader('Código')).toBe('codigo');
    expect(normalizeHeader('PRECIO   VENTA')).toBe('precio venta');
    expect(normalizeHeader('Precio (₡)')).toBe('precio');
    expect(normalizeHeader('  Categoría / Rubro  ')).toBe('categoria rubro');
  });

  it('devuelve cadena vacía para cabeceras sin letras ni números', () => {
    expect(normalizeHeader('   ')).toBe('');
    expect(normalizeHeader('###')).toBe('');
  });
});

describe('resolveHeaderMapping', () => {
  it('auto-mapea las cabeceras reales del fixture', () => {
    const { mapping, unmatchedColumns } = resolveHeaderMapping(FIXTURE_HEADERS);

    expect(mapping).toEqual({
      sku: 'SKU',
      name: 'Nombre',
      description: 'Descripción',
      category: 'Categoría',
      brand: 'Marca',
      price: 'Precio',
      cost: 'Costo',
      stock: 'Stock',
      image: 'Imagen',
    });
    expect(unmatchedColumns).toEqual([]);
  });

  it('mapea sinónimos aunque vengan con acentos y mayúsculas', () => {
    const { mapping } = resolveHeaderMapping([
      'Código',
      'Producto',
      'Detalle',
      'Rubro',
      'Fabricante',
      'PVP',
      'Coste',
      'Existencia',
      'Foto',
    ]);

    expect(mapping.sku).toBe('Código');
    expect(mapping.name).toBe('Producto');
    expect(mapping.description).toBe('Detalle');
    expect(mapping.category).toBe('Rubro');
    expect(mapping.brand).toBe('Fabricante');
    expect(mapping.price).toBe('PVP');
    expect(mapping.cost).toBe('Coste');
    expect(mapping.stock).toBe('Existencia');
    expect(mapping.image).toBe('Foto');
  });

  it('distingue "descripción corta" (nombre) de "descripción" (detalle)', () => {
    const { mapping } = resolveHeaderMapping(['SKU', 'Descripción corta', 'Descripción', 'Precio']);

    expect(mapping.name).toBe('Descripción corta');
    expect(mapping.description).toBe('Descripción');
  });

  it('el mapping explícito gana sobre el automático', () => {
    const explicit: ColumnMapping = { price: 'PVP', sku: 'REF' };
    const { mapping } = resolveHeaderMapping(['SKU', 'REF', 'Nombre', 'Precio', 'PVP'], explicit);

    expect(mapping.price).toBe('PVP');
    expect(mapping.sku).toBe('REF');
    expect(mapping.name).toBe('Nombre');
  });

  it('reporta las columnas explícitas que no existen en el archivo', () => {
    const result = resolveHeaderMapping(['SKU', 'Nombre', 'Precio'], { price: 'Precio final' });

    expect(result.unmatchedColumns).toEqual(['Precio final']);
    // El campo sin columna resuelta queda indefinido; el servicio responde 400.
    expect(result.mapping.price).toBeUndefined();
    expect(result.mapping.sku).toBe('SKU');
  });

  it('no reutiliza la misma columna para dos campos en el auto-mapeo', () => {
    const { mapping } = resolveHeaderMapping(['SKU', 'Precio']);
    expect(mapping.price).toBe('Precio');
    expect(mapping.name).toBeUndefined();
  });
});
