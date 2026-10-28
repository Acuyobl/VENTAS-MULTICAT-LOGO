import { describe, expect, it } from 'vitest';
import { coerceAttributeValue, coerceExtraAttributes } from './attribute-coercion';
import { hasBlockingErrors, pickCarriedOverProducts } from './merge';

describe('coerceAttributeValue', () => {
  it('coacciona números, moneda, booleanos y fechas', () => {
    expect(coerceAttributeValue('1234.5', 'NUMBER')).toBe(1234.5);
    // Con separadores de miles es ambiguo (podría ser moneda): se conserva el texto.
    expect(coerceAttributeValue('1.234,5', 'NUMBER')).toBe('1.234,5');
    expect(coerceAttributeValue('₡1.234,56', 'CURRENCY', 'CRC')).toBe(1235);
    expect(coerceAttributeValue('USD 1,234.56', 'CURRENCY', 'USD')).toBe(1234.56);
    expect(coerceAttributeValue('Sí', 'BOOLEAN')).toBe(true);
    expect(coerceAttributeValue('no', 'BOOLEAN')).toBe(false);
    expect(coerceAttributeValue('28/10/2026', 'DATE')).toBe('2026-10-28');
    expect(coerceAttributeValue('  1 kg  ', 'TEXT')).toBe('1 kg');
  });

  it('celda vacía devuelve undefined (no se escribe)', () => {
    expect(coerceAttributeValue('   ', 'TEXT')).toBeUndefined();
    expect(coerceAttributeValue(null, 'NUMBER')).toBeUndefined();
  });
});

describe('coerceExtraAttributes', () => {
  it('arma attributes solo con claves extra y valores no vacíos', () => {
    const attributes = coerceExtraAttributes(
      { Medida: '1 kg', Material: '', Peso: '2' },
      [
        { column: 'Medida', key: 'medida', label: 'Medida', type: 'TEXT' },
        { column: 'Material', key: 'material', label: 'Material', type: 'TEXT' },
        { column: 'Peso', key: 'peso_kg', label: 'Peso', type: 'NUMBER' },
      ],
      'CRC',
    );
    expect(attributes).toEqual({ medida: '1 kg', peso_kg: 2 });
  });
});

describe('pickCarriedOverProducts (MERGE)', () => {
  const active = [
    { sku: 'A1', name: 'Café' },
    { sku: 'A2', name: 'Miel' },
    { sku: 'A3', name: 'Vela' },
  ];

  it('REPLACE no arrastra productos', () => {
    expect(pickCarriedOverProducts(active, ['A1'], 'REPLACE')).toEqual([]);
  });

  it('MERGE conserva los SKU que no vienen en el archivo (case-insensitive)', () => {
    expect(pickCarriedOverProducts(active, ['a1'], 'MERGE')).toEqual([
      { sku: 'A2', name: 'Miel' },
      { sku: 'A3', name: 'Vela' },
    ]);
  });

  it('detecta errores bloqueantes para guardar plantilla', () => {
    expect(hasBlockingErrors([{ severity: 'warning' }], 0)).toBe(false);
    expect(hasBlockingErrors([], 1)).toBe(true);
    expect(hasBlockingErrors([{ severity: 'error' }], 0)).toBe(true);
  });
});

describe('coerceExtraAttributes · casos reales (Ferretería)', () => {
  it('guarda ENUM/TEXT/URL/IMAGE como string y no corrompe medidas', () => {
    const attributes = coerceExtraAttributes(
      {
        Medida: '1/4',
        Detalle: '1/4 x 2',
        Peso: '16 oz',
        Material: 'Acero',
        Activo: 'Sí',
        Precio: '₡1.234,56',
        Fecha: '2027-03-01',
        Foto: 'https://cdn.test/tornillo.png',
      },
      [
        { column: 'Medida', key: 'medida', label: 'Medida', type: 'ENUM' },
        { column: 'Detalle', key: 'detalle', label: 'Detalle', type: 'TEXT' },
        { column: 'Peso', key: 'peso', label: 'Peso', type: 'TEXT' },
        { column: 'Material', key: 'material', label: 'Material', type: 'TEXT' },
        { column: 'Activo', key: 'activo', label: 'Activo', type: 'BOOLEAN' },
        { column: 'Precio', key: 'precio', label: 'Precio', type: 'CURRENCY' },
        { column: 'Fecha', key: 'fecha', label: 'Fecha', type: 'DATE' },
        { column: 'Foto', key: 'foto', label: 'Foto', type: 'IMAGE' },
      ],
      'CRC',
    );
    expect(attributes).toEqual({
      medida: '1/4',
      detalle: '1/4 x 2',
      peso: '16 oz',
      material: 'Acero',
      activo: true,
      precio: 1235,
      fecha: '2027-03-01',
      foto: 'https://cdn.test/tornillo.png',
    });
  });

  it('un texto como 1/4 con tipo DATE no se convierte en fecha', () => {
    expect(coerceAttributeValue('1/4', 'DATE')).toBe('1/4');
    expect(coerceAttributeValue('1/4 x 2', 'DATE')).toBe('1/4 x 2');
    expect(coerceAttributeValue('16 oz', 'DATE')).toBe('16 oz');
    expect(coerceAttributeValue('Acero', 'NUMBER')).toBe('Acero');
  });
});
