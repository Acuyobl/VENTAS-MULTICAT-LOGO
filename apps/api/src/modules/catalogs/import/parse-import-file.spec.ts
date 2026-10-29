import * as XLSX from 'xlsx';
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

describe('importador universal · formatos adaptativos', () => {
  it('parsea un JSON con arreglo de productos', () => {
    const json = JSON.stringify([
      { sku: 'J-1', nombre: 'Zapatos de cuero', precio: '25000' },
      { sku: 'J-2', nombre: 'Camisa formal', precio: '18000' },
    ]);
    const parsed = parseImportFile(Buffer.from(json, 'utf8'), 'json');
    expect(parsed.headers).toContain('nombre');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.nombre).toBe('Zapatos de cuero');
  });

  it('parsea un archivo TXT con líneas desestructuradas (nombre y precio)', () => {
    const txt = 'Camisa Blanca $15.000\nPantalón Negro 25000 CRC\nZapatos Cuero - 35000';
    const parsed = parseImportFile(Buffer.from(txt, 'utf8'), 'txt');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.Nombre).toBe('Camisa Blanca');
    expect(parsed.rows[0]?.Precio).toBe('15.000');
    expect(parsed.rows[1]?.Nombre).toBe('Pantalón Negro');
  });

  it('adapta archivos con delimitador pipe (|)', () => {
    const pipeText = 'SKU|Nombre|Precio\nP-01|Gorra deportiva|5000';
    const parsed = parseImportFile(Buffer.from(pipeText, 'utf8'), 'csv');
    expect(parsed.headers).toEqual(['SKU', 'Nombre', 'Precio']);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.Nombre).toBe('Gorra deportiva');
  });

  it('soporta archivos de una sola fila de datos sin cabecera', () => {
    const single = 'Camisa Polo, 12000';
    const parsed = parseImportFile(Buffer.from(single, 'utf8'), 'csv');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.Producto).toBe('Camisa Polo');
    expect(parsed.rows[0]?.Precio).toBe('12000');
  });

  it('adapta buffers PDF devolviendo estructura válida', () => {
    const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
    const parsed = parseImportFile(fakePdf, 'pdf');
    expect(parsed.headers).toEqual(['SKU', 'Nombre', 'Precio']);
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it('analiza y combina múltiples pestañas de Excel descartando hojas de portada', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    // Pestaña 1: Portada (sin productos)
    const coverSheet = XLSX.utils.aoa_to_sheet([
      ['Catálogo Verano 2026'],
      ['Instrucciones de llenado'],
    ]);
    XLSX.utils.book_append_sheet(wb, coverSheet, 'Portada');

    // Pestaña 2: Ropa Hombre
    const menSheet = XLSX.utils.aoa_to_sheet([
      ['SKU', 'Nombre', 'Precio'],
      ['H-1', 'Camisa Lino', '22000'],
      ['H-2', 'Bermuda', '15000'],
    ]);
    XLSX.utils.book_append_sheet(wb, menSheet, 'Hombre');

    // Pestaña 3: Ropa Mujer
    const womenSheet = XLSX.utils.aoa_to_sheet([
      ['SKU', 'Nombre', 'Precio'],
      ['M-1', 'Vestido Seda', '35000'],
    ]);
    XLSX.utils.book_append_sheet(wb, womenSheet, 'Mujer');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parseImportFile(buffer, 'xlsx');

    expect(parsed.headers).toContain('Categoría');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]?.Categoría).toBe('Hombre');
    expect(parsed.rows[2]?.Categoría).toBe('Mujer');
    expect(parsed.sheetSelection).toContain('Se combinaron 2 pestañas');
  });

  it('procesa tablas compuestas vinculando la sub-tabla de imágenes por cliente', () => {
    const csvContent = [
      'CLIENTE,TALLA,CAMISA,PRECIO',
      'KENDALL ACUÑA,L,CAMISA BLACK CLOVER,10000',
      'MAGALY BARBOZA,4,CAMISA MOTOCROSS,10000',
      ',,,',
      ',,,20000',
      'Total,,saldo ,debo',
      'Pedido ID,Cliente,Imagen',
      '378,KENDALL ACUÑA,pedido_378.jpeg',
      '379,MAGALY BARBOZA,pedido_379.jpeg',
    ].join('\n');

    const parsed = parseImportFile(Buffer.from(csvContent, 'utf-8'), 'csv');

    expect(parsed.headers).toContain('Imagen');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.Imagen).toBe('pedido_378.jpeg');
    expect(parsed.rows[1]?.Imagen).toBe('pedido_379.jpeg');
    expect(parsed.rows[0]?.CAMISA).toBe('CAMISA BLACK CLOVER');
  });

  it('combina libro Excel con pestaña principal de productos y pestaña auxiliar de imágenes', () => {
    const wb = XLSX.utils.book_new();
    const prodSheet = XLSX.utils.aoa_to_sheet([
      ['CLIENTE', 'TALLA', 'CAMISA', 'PRECIO'],
      ['KENDALL ACUÑA', 'L', 'CAMISA BLACK CLOVER', '10000'],
      ['MAGALY BARBOZA', '4', 'CAMISA MOTOCROSS', '10000'],
      ['', '', '', ''],
      [null, null, null, '20000'],
      [null, null, 'Total', 'debo'],
    ]);
    XLSX.utils.book_append_sheet(wb, prodSheet, 'Pedido SUBLIMANIA CR');

    const imgSheet = XLSX.utils.aoa_to_sheet([
      ['Pedido ID', 'Cliente', 'Imagen'],
      ['378', 'KENDALL ACUÑA', 'pedido_378.jpeg'],
      ['379', 'MAGALY BARBOZA', 'pedido_379.jpeg'],
    ]);
    XLSX.utils.book_append_sheet(wb, imgSheet, 'Imagenes');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = parseImportFile(buffer, 'xlsx');

    expect(parsed.headers).toContain('Imagen');
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.Imagen).toBe('pedido_378.jpeg');
    expect(parsed.rows[1]?.Imagen).toBe('pedido_379.jpeg');
    expect(parsed.sheetSelection).toContain('vinculada con fotos de "Imagenes"');
  });

  it('parsea correctamente el archivo real Pedido_15-10-2026_SUBLIMANIA_CR.xlsx', () => {
    const realPath =
      'C:/Users/Usuario/.gemini/antigravity/brain/8ef4ed41-cdc6-4d74-9e67-352b89fb81e9/.user_uploaded/media_1793286968976_095aa1a6.xlsx';
    if (!existsSync(realPath)) return;
    const buf = readFileSync(realPath);
    const parsed = parseImportFile(buf, 'xlsx');
    expect(parsed.headers).toContain('Imagen');
    expect(parsed.rows).toHaveLength(22);
    expect(parsed.rows[0]?.Imagen).toBe(
      'pedido_378_88282395-c558-4912-869e-82d2c120001d.jpeg',
    );
    expect(parsed.rows[21]?.Imagen).toBe(
      'pedido_392_facd6090-4afd-4969-8962-ef715347df2d.jpg',
    );

    const { mapping } = resolveHeaderMapping(parsed.headers);
    expect(mapping.image).toBe('Imagen');
    expect(mapping.price).toBe('PRECIO');
    expect(mapping.name).toBe('CAMISA');

    const validation = validateImportRows(parsed.rows, { mapping, currency: 'CRC' });
    expect(validation.totalRows).toBe(22);
    expect(validation.quarantineRows).toBe(0);
    expect(validation.products).toHaveLength(22);
    expect(validation.products[0]?.imageRef).toBe(
      'pedido_378_88282395-c558-4912-869e-82d2c120001d.jpeg',
    );
  });
});
