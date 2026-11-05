import { describe, expect, it } from 'vitest';
import { inferColumnType, inferColumns } from './infer-columns';

describe('inferColumnType', () => {
  it('detecta moneda con símbolo y separadores', () => {
    const result = inferColumnType('Precio final ₡', ['₡1.234,56', '₡2.000,00', '₡500']);
    expect(result.type).toBe('CURRENCY');
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('detecta fecha en formato local e ISO', () => {
    expect(inferColumnType('Fecha', ['28/10/2026', '01/11/2026']).type).toBe('DATE');
    expect(inferColumnType('fecha_iso', ['2026-10-28', '2026-02-01']).type).toBe('DATE');
  });

  it('detecta booleanos solo con palabras (no 1/0 ambiguos)', () => {
    expect(inferColumnType('Activo', ['Sí', 'No', 'Sí']).type).toBe('BOOLEAN');
  });

  it('detecta URL e imagen', () => {
    expect(inferColumnType('Link', ['https://a.com/x', 'https://b.com/y']).type).toBe('URL');
    expect(inferColumnType('Foto', ['https://cdn.test/a.png', 'https://cdn.test/b.jpg']).type).toBe(
      'IMAGE',
    );
  });

  it('detecta enum, número y texto', () => {
    expect(inferColumnType('Medida', ['1 kg', '1 kg', '500 g', '250 g']).type).toBe('TEXT');
    expect(inferColumnType('Cantidad', ['1', '2', '3']).type).toBe('NUMBER');
    expect(inferColumnType('Material', ['madera', 'cerámica', 'vidrio', 'metal']).type).toBe(
      'TEXT',
    );
  });

  it('columna vacía es UNKNOWN con confianza 0', () => {
    expect(inferColumnType('vacía', [])).toEqual({ type: 'UNKNOWN', confidence: 0 });
  });
});

describe('inferColumns', () => {
  it('calcula emptyRatio, samples y normaliza encabezados', () => {
    const columns = inferColumns(
      ['Código', 'Precio final ₡', 'Siempre vacía'],
      [
        { Código: 'A1', 'Precio final ₡': '₡1.000', 'Siempre vacía': '' },
        { Código: 'A2', 'Precio final ₡': '', 'Siempre vacía': '' },
      ],
    );
    expect(columns[0]).toMatchObject({ normalized: 'codigo', type: 'TEXT', samples: ['A1', 'A2'] });
    expect(columns[1].type).toBe('CURRENCY');
    expect(columns[1].emptyRatio).toBe(0.5);
    expect(columns[2]).toMatchObject({ emptyRatio: 1, type: 'UNKNOWN' });
  });
});

describe('inferColumnType · casos reales (Ferretería)', () => {
  it('medidas con muchos valores únicos son TEXT, no ENUM', () => {
    expect(inferColumnType('Medida', ['1/4', '1/4 x 2', '16 oz', 'Acero']).type).toBe('TEXT');
    expect(inferColumnType('Medida', ['1/4', '1/4', '1/4 x 2', '16 oz']).type).toBe('TEXT');
  });

  it('ENUM solo con pocos valores y repetición real', () => {
    expect(inferColumnType('Material', ['Acero', 'Acero', 'Cobre', 'Acero']).type).toBe('ENUM');
    expect(
      inferColumnType('Material', ['Acero', 'Cobre', 'Latón', 'Hierro', 'Aluminio']).type,
    ).toBe('TEXT');
  });

  it('detecta moneda, fecha ISO, booleano, número y URLs', () => {
    expect(inferColumnType('Precio', ['₡1.234,56', '$12,50']).type).toBe('CURRENCY');
    expect(inferColumnType('Fecha', ['2027-03-01', '2027-04-15']).type).toBe('DATE');
    expect(inferColumnType('Activo', ['Sí', 'No', 'Sí']).type).toBe('BOOLEAN');
    expect(inferColumnType('Peso', ['10', '2.5', '3']).type).toBe('NUMBER');
    expect(
      inferColumnType('Foto', ['https://cdn.test/a.jpg', 'https://cdn.test/b.webp']).type,
    ).toBe('IMAGE');
    expect(inferColumnType('Link', ['https://test/a', 'https://test/b']).type).toBe('URL');
  });

  it('no confunde 1/4 ni 16 oz con fecha o número', () => {
    expect(inferColumnType('Medida', ['1/4', '1/4', '1/4', '1/4']).type).not.toBe('DATE');
    expect(inferColumnType('Medida', ['16 oz', '16 oz']).type).not.toBe('NUMBER');
  });
});
