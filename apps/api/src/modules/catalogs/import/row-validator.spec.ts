import { describe, expect, it } from 'vitest';
import type { ResolvedMapping } from './normalize-header';
import {
  cleanMoneyText,
  parseOptionalMinor,
  parsePriceCell,
  parseStock,
  validateImportRows,
} from './row-validator';

const mapping: ResolvedMapping = {
  sku: 'SKU',
  name: 'Nombre',
  description: 'Descripción',
  category: 'Categoría',
  brand: 'Marca',
  price: 'Precio',
  cost: 'Costo',
  stock: 'Stock',
  image: 'Imagen',
};

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    SKU: 'SKU-1',
    Nombre: 'Producto',
    Descripción: '',
    Categoría: '',
    Marca: '',
    Precio: '1000',
    Costo: '',
    Stock: '',
    Imagen: '',
    ...overrides,
  };
}

describe('cleanMoneyText', () => {
  it('quita símbolos de moneda y espacios (incluido NBSP)', () => {
    expect(cleanMoneyText('₡ 12.600')).toBe('12.600');
    expect(cleanMoneyText('$1,234.56')).toBe('1,234.56');
    expect(cleanMoneyText('\u00a0₡\u00a0100')).toBe('100');
  });
});

describe('parsePriceCell', () => {
  it('acepta enteros, separadores de miles y decimales según la moneda', () => {
    expect(parsePriceCell('12.800', 'CRC')).toEqual({ ok: true, minor: 12800n });
    expect(parsePriceCell('₡ 12.600', 'CRC')).toEqual({ ok: true, minor: 12600n });
    expect(parsePriceCell('19,99', 'USD')).toEqual({ ok: true, minor: 1999n });
    expect(parsePriceCell('$ 19.99', 'USD')).toEqual({ ok: true, minor: 1999n });
  });

  it('trata vacío y cero como MISSING_PRICE', () => {
    expect(parsePriceCell('', 'CRC')).toMatchObject({ ok: false, code: 'MISSING_PRICE' });
    expect(parsePriceCell('   ', 'CRC')).toMatchObject({ ok: false, code: 'MISSING_PRICE' });
    expect(parsePriceCell('₡0', 'CRC')).toMatchObject({ ok: false, code: 'MISSING_PRICE' });
    expect(parsePriceCell('0.00', 'USD')).toMatchObject({ ok: false, code: 'MISSING_PRICE' });
  });

  it('trata texto no numérico y negativos como INVALID_PRICE', () => {
    expect(parsePriceCell('abc', 'CRC')).toMatchObject({ ok: false, code: 'INVALID_PRICE' });
    expect(parsePriceCell('12-3', 'CRC')).toMatchObject({ ok: false, code: 'INVALID_PRICE' });
    expect(parsePriceCell('-5', 'CRC')).toMatchObject({ ok: false, code: 'INVALID_PRICE' });
    expect(parsePriceCell('-19.99', 'USD')).toMatchObject({ ok: false, code: 'INVALID_PRICE' });
  });
});

describe('parseOptionalMinor y parseStock', () => {
  it('costo vacío o inválido se importa como null; válido con símbolo se normaliza', () => {
    expect(parseOptionalMinor('', 'CRC')).toBeNull();
    expect(parseOptionalMinor('abc', 'CRC')).toBeNull();
    expect(parseOptionalMinor('-1', 'CRC')).toBeNull();
    expect(parseOptionalMinor('₡8.050', 'CRC')).toBe(8050n);
  });

  it('stock vacío o inválido se importa como null (stock no controlado)', () => {
    expect(parseStock('')).toBeNull();
    expect(parseStock('3')).toBe(3);
    expect(parseStock('3.5')).toBeNull();
    expect(parseStock('-2')).toBeNull();
    expect(parseStock('abc')).toBeNull();
  });
});

describe('validateImportRows', () => {
  it('produce productos válidos con rowNumber y normalización de nombre', () => {
    const result = validateImportRows(
      [
        row({ Nombre: '  Producto   con   espacios  ' }),
        row({ SKU: 'SKU-2', Precio: '₡2.500', Costo: '1000', Stock: '7', Imagen: 'img/x.jpg' }),
      ],
      { mapping, currency: 'CRC' },
    );

    expect(result.totalRows).toBe(2);
    expect(result.quarantineRows).toBe(0);
    expect(result.issues).toEqual([]);
    expect(result.products).toHaveLength(2);
    expect(result.products[0]).toMatchObject({ name: 'Producto con espacios', priceMinor: 1000n });
    expect(result.products[1]).toMatchObject({
      sku: 'SKU-2',
      priceMinor: 2500n,
      costMinor: 1000n,
      stock: 7,
      imageRef: 'img/x.jpg',
    });
  });

  it('marca MISSING_SKU, MISSING_NAME y MISSING_PRICE en una fila vacía', () => {
    const result = validateImportRows([row({ SKU: '', Nombre: '', Precio: '' })], {
      mapping,
      currency: 'CRC',
    });

    expect(result.products).toHaveLength(0);
    expect(result.quarantineRows).toBe(1);
    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      'MISSING_NAME',
      'MISSING_PRICE',
      'MISSING_SKU',
    ]);
    expect(result.issues[0]?.rowNumber).toBe(2);
  });

  it('marca DUPLICATE_SKU en la segunda aparición y compara sin distinguir mayúsculas', () => {
    const result = validateImportRows([row({ SKU: 'sku-1' }), row({ SKU: 'SKU-1' })], {
      mapping,
      currency: 'CRC',
    });

    expect(result.products).toHaveLength(1);
    expect(result.quarantineRows).toBe(1);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      code: 'DUPLICATE_SKU',
      rowNumber: 3,
    });
    expect(result.issues[0]?.message).toContain('fila 2');
  });

  it('los números de celda de un XLSX también se normalizan', () => {
    const result = validateImportRows([row({ Precio: 1500, Costo: 900, Stock: 4 })], {
      mapping,
      currency: 'CRC',
    });

    expect(result.products[0]).toMatchObject({ priceMinor: 1500n, costMinor: 900n, stock: 4 });
  });

  it('un precio inválido deja la fila en cuarentena sin crear producto', () => {
    const result = validateImportRows([row({ Precio: 'no-es-precio' }), row({ SKU: 'SKU-2' })], {
      mapping,
      currency: 'CRC',
    });

    expect(result.quarantineRows).toBe(1);
    expect(result.products).toHaveLength(1);
    expect(result.issues[0]?.code).toBe('INVALID_PRICE');
    expect(result.issues[0]?.rawData).toMatchObject({ SKU: 'SKU-1', Precio: 'no-es-precio' });
  });
});

describe('validateImportRows · INVALID_TEXT_ENCODING', () => {
  const mapping = {
    sku: 'SKU',
    name: 'Nombre',
    description: undefined,
    category: undefined,
    brand: undefined,
    price: 'Precio',
    cost: undefined,
    stock: undefined,
    image: undefined,
  } as const;

  it('manda a cuarentena la fila con U+FFFD y no crea producto', () => {
    const result = validateImportRows(
      [
        { SKU: 'A-1', Nombre: 'Ferreter\uFFFDa', Precio: '1000' },
        { SKU: 'A-2', Nombre: 'Café', Precio: '2000' },
      ],
      { mapping, currency: 'CRC' },
    );
    expect(result.totalRows).toBe(2);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.name).toBe('Café');
    expect(result.quarantineRows).toBe(1);
    expect(result.issues[0]).toMatchObject({
      severity: 'error',
      code: 'INVALID_TEXT_ENCODING',
      rowNumber: 2,
    });
  });

  it('también revisa columnas de campos extra', () => {
    const result = validateImportRows(
      [{ SKU: 'A-1', Nombre: 'Tornillo', Precio: '1000', Medida: '1\uFFFD4' }],
      { mapping, currency: 'CRC', extraFieldColumns: ['Medida'] },
    );
    expect(result.products).toHaveLength(0);
    expect(result.issues[0]?.code).toBe('INVALID_TEXT_ENCODING');
  });
});
