import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
  detectImageMime,
  extractXlsxImages,
  findImageColumnIndex,
  findImageSheet,
} from './xlsx-images';
import { parseImportFileWithEmbeddedImages } from './parse-with-images';
import { parseImportFile } from './parse-import-file';

const FIXTURE_PATH = resolve(process.cwd(), '../../tools/fixtures/pedido-con-imagenes.xlsx');

function fixtureBuffer(): Buffer {
  if (!existsSync(FIXTURE_PATH)) {
    throw new Error(`Falta el fixture ${FIXTURE_PATH}`);
  }
  return readFileSync(FIXTURE_PATH);
}

function decodeDataUri(dataUri: string): Buffer {
  return Buffer.from(dataUri.split(',')[1] ?? '', 'base64');
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('extractXlsxImages', () => {
  it('encuentra las 3 PNG ancladas en C2:C4 de la hoja Imagenes', async () => {
    const images = await extractXlsxImages(fixtureBuffer());
    const sheet = images.get('Imagenes');
    expect(sheet).toBeDefined();
    expect([...(sheet?.keys() ?? [])].sort()).toEqual([1, 2, 3]);
    for (const row of [1, 2, 3]) {
      const list = sheet?.get(row) ?? [];
      expect(list).toHaveLength(1);
      expect(list[0]?.mime).toBe('image/png');
      expect(list[0]?.col).toBe(2);
      expect(list[0]?.dataUri).toMatch(/^data:image\/png;base64,/);
      expect(decodeDataUri(list[0]!.dataUri).subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    }
    expect(findImageSheet(images)).toBe('Imagenes');
  });

  it('un XLSX sin dibujos devuelve un mapa vacío sin lanzar', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['SKU', 'Nombre', 'Precio'],
        ['A1', 'Café', '1000'],
      ]),
      'Productos',
    );
    const buffer = Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    await expect(extractXlsxImages(buffer)).resolves.toEqual(new Map());
  });

  it('un archivo corrupto devuelve un mapa vacío sin lanzar', async () => {
    await expect(extractXlsxImages(Buffer.from('no soy un zip'))).resolves.toEqual(new Map());
  });

  it('detecta la columna de imágenes por cabecera', () => {
    expect(findImageColumnIndex(['Cliente', 'Imagen', 'Precio'])).toBe(1);
    expect(findImageColumnIndex(['Cliente', 'Foto'])).toBe(1);
    expect(findImageColumnIndex(['Cliente', 'Precio'])).toBe(-1);
    expect(detectImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });
});

describe('importación del pedido con imágenes incrustadas', () => {
  it('enriquece la hoja Imagenes con data URIs y las vincula por cliente', async () => {
    const parsed = await parseImportFileWithEmbeddedImages(fixtureBuffer(), 'xlsx');

    expect(parsed.headers).toContain('Imagen');
    expect(parsed.rows).toHaveLength(3);
    for (const row of parsed.rows) {
      expect(String(row.Imagen)).toMatch(/^data:image\/png;base64,/);
    }

    const names = parsed.rows.map((row) => String(row.CAMISA ?? row.Nombre ?? ''));
    expect(new Set(names).size).toBe(3);
    const decoded = decodeDataUri(String(parsed.rows[0]?.Imagen));
    expect(decoded.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(decoded.subarray(0, 4).toString('latin1')).not.toContain('<svg');
  });

  it('parseImportFile sync con sheetImages produce el mismo resultado', async () => {
    const images = await extractXlsxImages(fixtureBuffer());
    const parsed = parseImportFile(fixtureBuffer(), 'xlsx', undefined, images);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.every((row) => String(row.Imagen).startsWith('data:image/'))).toBe(true);
  });
});
