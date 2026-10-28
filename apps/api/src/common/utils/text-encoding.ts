import { AppException } from '../errors/app-exception';

/** Carácter de reemplazo Unicode que delata texto con codificación rota. */
export const REPLACEMENT_CHAR = '\uFFFD';

/** `true` si el string contiene U+FFFD (�). */
export function containsReplacementChar(value: unknown): boolean {
  return typeof value === 'string' && value.includes(REPLACEMENT_CHAR);
}

/**
 * Busca el primer string con U+FFFD dentro de un body JSON y devuelve su path
 * (`customer.fullName`, `items[0].name`, …). `null` si todo está limpio.
 */
export function findInvalidEncodingPath(value: unknown, path = ''): string | null {
  if (typeof value === 'string') {
    return value.includes(REPLACEMENT_CHAR) ? path || 'body' : null;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const childPath = path ? `${path}[${index}]` : `[${index}]`;
      const found = findInvalidEncodingPath(value[index], childPath);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      const found = findInvalidEncodingPath(child, childPath);
      if (found) return found;
    }
  }
  return null;
}

/** Lanza 422 `VALIDATION_FAILED` con `reason=invalid_encoding` y el path. */
export function assertValidEncoding(value: unknown): void {
  const path = findInvalidEncodingPath(value);
  if (path) {
    throw new AppException('VALIDATION_FAILED', 422, {
      reason: 'invalid_encoding',
      path,
      message: `El campo "${path}" contiene el carácter de reemplazo U+FFFD; revisá la codificación del texto.`,
    });
  }
}
