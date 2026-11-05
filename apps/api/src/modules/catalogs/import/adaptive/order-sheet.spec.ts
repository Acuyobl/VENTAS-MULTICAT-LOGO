import { describe, expect, it, vi } from 'vitest';
import { buildHeuristicProposal, headersSignature } from './heuristic-mapping';
import { inferColumns } from './infer-columns';
import { resolveHeaderMapping } from '../normalize-header';
import { resolveImportImages } from '../import-images';

const ORDER_HEADERS = [
  'CLIENTE',
  'TALLA',
  'CAMISA',
  'TELA',
  'TIPO',
  'CUELLO',
  'GENERO',
  'CANTIDAD',
  'DETALLE',
  'MANGA',
  'COSTO',
  'URGENCIA',
  'ESTADO',
];

const ORDER_ROWS = [
  {
    CLIENTE: 'María Solís',
    TALLA: 'M',
    CAMISA: 'Camisa sublimada manga corta',
    TELA: 'Dry fit',
    TIPO: 'Sublimación',
    CUELLO: 'Redondo',
    GENERO: 'Dama',
    CANTIDAD: '2',
    DETALLE: 'Diseño floral',
    MANGA: 'Corta',
    COSTO: '12000',
    URGENCIA: 'Alta',
    ESTADO: 'Pendiente',
  },
  {
    CLIENTE: 'Carlos Pérez',
    TALLA: 'L',
    CAMISA: 'Camisa deportiva cuello V',
    TELA: 'Piqué',
    TIPO: 'Bordado',
    CUELLO: 'V',
    GENERO: 'Caballero',
    CANTIDAD: '3',
    DETALLE: 'Logo empresa',
    MANGA: 'Larga',
    COSTO: '15000',
    URGENCIA: 'Media',
    ESTADO: 'En proceso',
  },
];

function proposal(headers: readonly string[], rows: readonly Record<string, unknown>[]) {
  return buildHeuristicProposal({
    headers,
    columns: inferColumns(headers, rows),
    signature: headersSignature(headers),
  });
}

describe('hojas de pedido (SUBLIMANIA)', () => {
  it('mapea CAMISA como nombre y COSTO como precio y costo', () => {
    const result = proposal(ORDER_HEADERS, ORDER_ROWS);
    expect(result.mapping.name).toBe('CAMISA');
    expect(result.mapping.price).toBe('COSTO');
    expect(result.mapping.cost).toBe('COSTO');
    expect(result.mapping.stock).toBe('CANTIDAD');
    expect(result.warnings).toContain(
      'No se detectó precio; se usó la columna de costo como precio de venta.',
    );
    expect(result.warnings.some((warning) => warning.includes('costo como precio'))).toBe(true);
  });

  it('el fallback de nombre elige una columna de producto y nunca CLIENTE', () => {
    const headers = ['CLIENTE', 'MODELO', 'FECHA', 'TOTAL'];
    const rows = [
      {
        CLIENTE: 'María Solís Vega',
        MODELO: 'Camisa fluorescente',
        FECHA: '2026-10-27',
        TOTAL: '12000',
      },
      {
        CLIENTE: 'Carlos Pérez Mora',
        MODELO: 'Camisa oversize',
        FECHA: '2026-10-27',
        TOTAL: '9000',
      },
    ];
    const result = proposal(headers, rows);
    expect(result.mapping.name).toBe('MODELO');
    expect(result.mapping.name).not.toBe('CLIENTE');
    expect(result.warnings.some((warning) => warning.includes('se usó "MODELO"'))).toBe(true);
  });

  it('con cabeceras normales el comportamiento no cambia', () => {
    const headers = ['SKU', 'Nombre', 'Precio', 'Costo', 'Stock'];
    const rows = [
      { SKU: 'A1', Nombre: 'Café de altura', Precio: '6000', Costo: '3000', Stock: '5' },
    ];
    const result = proposal(headers, rows);
    expect(result.mapping).toMatchObject({
      name: 'Nombre',
      price: 'Precio',
      cost: 'Costo',
      stock: 'Stock',
    });
    expect(result.warnings).not.toContain(
      'No se detectó precio; se usó la columna de costo como precio de venta.',
    );
  });

  it('resolveHeaderMapping también usa COSTO como precio sin columna de precio', () => {
    const { mapping } = resolveHeaderMapping(['CAMISA', 'COSTO', 'CANTIDAD'], {});
    expect(mapping.name).toBe('CAMISA');
    expect(mapping.price).toBe('COSTO');
    expect(mapping.cost).toBe('COSTO');
  });
});

describe('resolveImportImages con data URI', () => {
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const row = {
    rowNumber: 2,
    sku: 'IMP-1',
    name: 'Camisa sublimada',
    description: null,
    category: null,
    brand: null,
    priceMinor: 12000n,
    costMinor: null,
    stock: 1,
    imageRef: `data:image/png;base64,${PNG.toString('base64')}`,
    rawData: {},
  };

  it('decodifica la imagen embebida y la sube con la misma key', async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    const download = vi.fn();
    const result = await resolveImportImages([row], {
      catalogId: 'cat-1',
      catalogVersionId: 'ver-1',
      download,
      upload,
    });
    expect(result.warnings).toEqual([]);
    expect(download).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledWith(result.products[0]?.imageKey, PNG, 'image/png');
    expect(result.products[0]?.imageKey).toMatch(/\.png$/);
  });

  it('un data URI inválido deja warning IMAGE_DOWNLOAD_FAILED y no rompe la fila', async () => {
    const result = await resolveImportImages([{ ...row, imageRef: 'data:image/png;base64,###' }], {
      catalogId: 'cat-1',
      catalogVersionId: 'ver-1',
      download: vi.fn(),
      upload: vi.fn(),
    });
    expect(result.products[0]?.imageKey).toBeNull();
    expect(result.warnings[0]).toMatchObject({ code: 'IMAGE_DOWNLOAD_FAILED' });
  });
});
