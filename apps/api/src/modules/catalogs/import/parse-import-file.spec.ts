import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeCsvBuffer,
  detectDelimiter,
  makeUniqueHeaders,
  parseImportFile,
} from './parse-import-file';
import { resolveHeaderMapping } from './normalize-header';
import { validateImportRows } from './row-validator';

const FIXTURE_PATH = resolve(process.cwd(), '../../tools/fixtures/catalogo-demo.csv');

function readFixture(): Buffer {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Falta el fixture ${FIXTURE_PATH}: ejecutá los tests desde apps/api.`);
  }
  return readFileSync(FIXTURE_PATH);
}

describe('decodeCsvBuffer', () => {
  it('decodifica UTF-8 y quita el BOM', () => {
    const withBom = Buffer.from(`\uFEFFSKU,Nombre\nA-1,café`, 'utf8');
    expect(decodeCsvBuffer(withBom)).toBe('SKU,Nombre\nA-1,café');
  });

  it('cae a latin1 cuando el archivo no es UTF-8 válido', () => {
    const latin1 = Buffer.from([0x53, 0x4b, 0x55, 0x2c, 0x4e, 0xf3, 0x6d, 0x62, 0x72, 0x65]);
    expect(decodeCsvBuffer(latin1)).toBe('SKU,Nómbre');
  });
});

describe('detectDelimiter', () => {
  it('detecta coma, punto y coma y tabulador', () => {
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a;b;c\n1;2;3')).toBe(';');
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('usa coma cuando la primera línea no tiene separadores', () => {
    expect(detectDelimiter('solo-una-columna')).toBe(',');
  });
});

describe('makeUniqueHeaders', () => {
  it('nombra cabeceras vacías y repetidas sin pisar columnas', () => {
    expect(makeUniqueHeaders(['SKU', '', 'SKU', ' SKU '])).toEqual([
      'SKU',
      'columna_2',
      'SKU_2',
      'SKU_3',
    ]);
  });
});

describe('pipeline del fixture real catalogo-demo.csv', () => {
  const parsed = parseImportFile(readFixture(), 'csv');
  const { mapping } = resolveHeaderMapping(parsed.headers);

  it('lee 42 filas de datos y conserva los acentos y las comas entrecomilladas', () => {
    expect(parsed.headers).toEqual([
      'SKU',
      'Nombre',
      'Descripción',
      'Categoría',
      'Marca',
      'Precio',
      'Costo',
      'Stock',
      'Imagen',
    ]);
    expect(parsed.rows).toHaveLength(42);
    expect(parsed.rows[6]?.Nombre).toBe('Producto 7');
    expect(parsed.rows[6]?.['Descripción']).toBe(
      'Artículo de prueba con acentos: ñandú, café, medición',
    );
  });

  it('valida en 37 productos y 5 issues (3 DUPLICATE_SKU + 2 MISSING_PRICE)', () => {
    const result = validateImportRows(parsed.rows, { mapping, currency: 'CRC' });

    expect(result.totalRows).toBe(42);
    expect(result.products).toHaveLength(37);
    expect(result.quarantineRows).toBe(5);
    expect(result.issues).toHaveLength(5);

    const byCode = result.issues.reduce<Record<string, number>>((accumulator, issue) => {
      accumulator[issue.code] = (accumulator[issue.code] ?? 0) + 1;
      return accumulator;
    }, {});
    expect(byCode).toEqual({ DUPLICATE_SKU: 3, MISSING_PRICE: 2 });
    expect(
      result.issues.filter((issue) => issue.code === 'DUPLICATE_SKU').map((i) => i.rowNumber),
    ).toEqual([39, 40, 41]);
    expect(
      result.issues.filter((issue) => issue.code === 'MISSING_PRICE').map((i) => i.rowNumber),
    ).toEqual([42, 43]);
  });

  it('normaliza precios con separador de miles y conserva el costo y el stock', () => {
    const result = validateImportRows(parsed.rows, { mapping, currency: 'CRC' });
    const sku3 = result.products.find((product) => product.sku === 'SKU-003');
    const sku1 = result.products.find((product) => product.sku === 'SKU-001');

    // El archivo trae 12.800 (separador de miles costarricense) y 12600.
    expect(sku3?.priceMinor).toBe(12800n);
    expect(sku1?.priceMinor).toBe(12600n);
    expect(sku1?.costMinor).toBe(8050n);
    expect(sku1?.stock).toBe(3);
    expect(sku1?.category).toBe('Jardín');
    expect(sku1?.imageRef).toBe('img/sku-001.jpg');
  });

  it('la cuarentena guarda la fila original en rawData', () => {
    const result = validateImportRows(parsed.rows, { mapping, currency: 'CRC' });
    const duplicate = result.issues.find((issue) => issue.code === 'DUPLICATE_SKU');
    expect(duplicate?.rawData).toMatchObject({
      SKU: 'SKU-005',
      Nombre: 'Producto duplicado SKU-005',
    });
  });
});

describe('parseImportFile con delimitador explícito', () => {
  it('parsea un CSV con punto y coma sin perder columnas', () => {
    const parsed = parseImportFile(
      Buffer.from('SKU;Nombre;Precio\nA-1;Producto uno;1000\n', 'utf8'),
      'csv',
      ';',
    );
    const { mapping } = resolveHeaderMapping(parsed.headers);
    const result = validateImportRows(parsed.rows, { mapping, currency: 'CRC' });

    expect(parsed.rows).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      sku: 'A-1',
      name: 'Producto uno',
      priceMinor: 1000n,
    });
  });
});

describe('decodeCsvBuffer · Windows-1252 y U+FFFD', () => {
  it('decodifica café exportado como Latin-1/Windows-1252', () => {
    const csv = 'SKU,Nombre\nA-1,café';
    const latin1 = Buffer.from(csv, 'latin1');
    expect(decodeCsvBuffer(latin1)).toBe(csv);
  });

  it('mapea bytes 0x80-0x9F de Windows-1252 (€, comillas tipográficas)', () => {
    const cafe = Buffer.from([
      0x53, 0x4b, 0x55, 0x2c, 0x41, 0x2d, 0x31, 0x2c, 0x63, 0x61, 0x66, 0xe9,
    ]);
    expect(decodeCsvBuffer(cafe)).toBe('SKU,A-1,café');
    expect(decodeCsvBuffer(Buffer.from([0x80]))).toBe('€');
    expect(decodeCsvBuffer(Buffer.from([0x92]))).toBe('’');
  });

  it('si el UTF-8 es válido pero trae U+FFFD literal, NO lo repara: queda para cuarentena', () => {
    const csv = Buffer.from('SKU,Nombre\nA-1,Ferreter\uFFFDa', 'utf8');
    expect(decodeCsvBuffer(csv)).toContain('\uFFFD');
  });
});
