import { describe, expect, it } from 'vitest';
import { limpiarParaGuardar, limpiarTexto } from './sanitize-text';

describe('sanitize-text', () => {
  it('quita NUL y controles inválidos sin tocar acentos ni saltos de línea', () => {
    expect(limpiarTexto('Camis\u0000a Niño\nTalle\u0007 M')).toBe('Camisa Niño\nTalle M');
  });

  it('limpia strings anidados en objetos y arrays', () => {
    const entrada = {
      nombre: 'Zapatilla\u0000 Runner',
      precio: 1200,
      extra: { nota: 'ok\u0000' },
      filas: ['a\u0000b', 3, null],
    };
    const salida = limpiarParaGuardar(entrada);
    expect(salida.nombre).toBe('Zapatilla Runner');
    expect(salida.precio).toBe(1200);
    expect(salida.extra.nota).toBe('ok');
    expect(salida.filas).toEqual(['ab', 3, null]);
  });

  it('deja intactos números, booleanos y fechas', () => {
    const fecha = new Date('2026-01-01T00:00:00Z');
    expect(limpiarParaGuardar(12)).toBe(12);
    expect(limpiarParaGuardar(true)).toBe(true);
    expect(limpiarParaGuardar(fecha)).toBe(fecha);
  });
});
