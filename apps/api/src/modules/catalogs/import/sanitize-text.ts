/**
 * Limpieza de texto antes de persistir en PostgreSQL.
 *
 * El OCR de PDF e imágenes puede devolver celdas con `\u0000` (NUL) u otros
 * caracteres de control que Postgres rechaza en columnas `text`
 * (`22P05 unsupported Unicode escape sequence`). Se eliminan sin tocar el resto
 * del contenido.
 */
// eslint-disable-next-line no-control-regex -- quitar caracteres de control es justamente el objetivo
const CONTROL_INVALIDO = /[\u0000\u0001-\u0008\u000B\u000C\u000E-\u001F]/g;

export function limpiarTexto(valor: string): string {
  return valor.replace(CONTROL_INVALIDO, '');
}

/** Limpia recursivamente strings de objetos/arrays antes de guardarlos. */
export function limpiarParaGuardar<T>(valor: T): T {
  if (typeof valor === 'string') return limpiarTexto(valor) as unknown as T;
  if (Array.isArray(valor)) {
    return valor.map((item) => limpiarParaGuardar(item)) as unknown as T;
  }
  if (valor && typeof valor === 'object' && !(valor instanceof Date)) {
    const salida: Record<string, unknown> = {};
    for (const [clave, dato] of Object.entries(valor as Record<string, unknown>)) {
      salida[clave] = limpiarParaGuardar(dato);
    }
    return salida as T;
  }
  return valor;
}
