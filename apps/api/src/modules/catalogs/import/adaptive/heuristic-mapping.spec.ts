import { describe, expect, it } from 'vitest';
import {
  buildHeuristicProposal,
  headersSignature,
  isNoiseColumn,
  levenshtein,
  similarity,
  suggestMapping,
} from './heuristic-mapping';
import { inferColumns } from './infer-columns';

const headers = ['Código', 'Artículo', 'Precio final ₡', 'Cant.', 'Medida', 'Material', 'Total'];
const rows = [
  {
    Código: 'A1',
    Artículo: 'Café de altura',
    'Precio final ₡': '₡1.234,56',
    'Cant.': '10',
    Medida: '1 kg',
    Material: 'cerámica',
    Total: '₡12.345',
  },
  {
    Código: 'A2',
    Artículo: 'Miel de abeja',
    'Precio final ₡': '₡2.000',
    'Cant.': '5',
    Medida: '500 g',
    Material: 'vidrio',
    Total: '₡10.000',
  },
];

describe('similarity / levenshtein', () => {
  it('calcula distancia y similitud', () => {
    expect(levenshtein('codigo', 'codigo')).toBe(0);
    expect(levenshtein('codigo', 'codigos')).toBe(1);
    expect(similarity('Código', 'codigo')).toBe(1);
    expect(similarity('Artículo', 'nombre')).toBeLessThan(0.72);
    expect(similarity('Precio final', 'precio')).toBeGreaterThanOrEqual(0.72);
  });

  it('la firma de encabezados es estable y cambia con otro set', () => {
    const signature = headersSignature(headers);
    expect(signature).toBe(headersSignature(headers));
    expect(signature).toBe(
      headersSignature([
        'CÓDIGO',
        'Articulo',
        'precio final ₡',
        'cant.',
        'medida',
        'material',
        'total',
      ]),
    );
    expect(signature).not.toBe(headersSignature(['Código', 'Artículo']));
  });
});

describe('suggestMapping', () => {
  it('mapea encabezados raros por sinónimos y similitud', () => {
    const { mapping } = suggestMapping(headers);
    expect(mapping.sku).toBe('Código');
    expect(mapping.name).toBe('Artículo');
    expect(mapping.price).toBe('Precio final ₡');
    expect(mapping.stock).toBe('Cant.');
    // Material no es un campo estándar: queda para extraFields.
    expect(Object.values(mapping)).not.toContain('Material');
  });
});

describe('isNoiseColumn', () => {
  it('detecta totales, notas y columnas casi vacías', () => {
    expect(isNoiseColumn('Total', 0)).toBe(true);
    expect(isNoiseColumn('Subtotal', 0)).toBe(true);
    expect(isNoiseColumn('IVA', 0)).toBe(true);
    expect(isNoiseColumn('Notas', 0)).toBe(true);
    expect(isNoiseColumn('Medida', 0)).toBe(false);
    expect(isNoiseColumn('Relleno', 0.9)).toBe(true);
  });
});

describe('buildHeuristicProposal', () => {
  it('devuelve mapping, extraFields, ignoradas, warnings y confianza', () => {
    const columns = inferColumns(headers, rows);
    const proposal = buildHeuristicProposal({
      headers,
      columns,
      signature: headersSignature(headers),
    });

    expect(proposal.mapping).toMatchObject({
      sku: 'Código',
      name: 'Artículo',
      price: 'Precio final ₡',
      stock: 'Cant.',
    });
    const extraLabels = proposal.extraFields.map((field) => field.label);
    expect(extraLabels).toContain('Medida');
    expect(extraLabels).toContain('Material');
    expect(proposal.ignoredColumns.map((column) => column.column)).toContain('Total');
    expect(proposal.confidence).toBeGreaterThan(0.6);
    expect(proposal.explanation).toContain('Analicé');
  });

  it('aplica una plantilla base y avisa si falta un campo requerido', () => {
    const columns = inferColumns(['Código', 'Medida'], [{ Código: 'A1', Medida: '1 kg' }]);
    const proposal = buildHeuristicProposal({
      headers: ['Código', 'Medida'],
      columns,
      signature: headersSignature(['Código', 'Medida']),
      baseMapping: { sku: 'Código', name: 'Artículo', price: 'Precio' },
      baseExtraFields: [{ column: 'Medida', key: 'medida', label: 'Medida', type: 'TEXT' }],
      presetName: 'Plantilla vieja',
    });
    expect(proposal.mapping.sku).toBe('Código');
    expect(proposal.extraFields.map((field) => field.key)).toContain('medida');
    expect(proposal.warnings.some((warning) => warning.includes('Plantilla vieja'))).toBe(true);
  });
});
