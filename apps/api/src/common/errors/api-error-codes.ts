import type { ErrorCode } from '@ventascatalogo/contracts';
import { AppException } from './app-exception';

/**
 * Códigos del flujo de versionado e importación (F1). Ya forman parte de
 * `ERROR_CODES` en `@ventascatalogo/contracts`, así que este módulo solo acota
 * el subconjunto que usa el pipeline y evita repetir literales.
 */
export const API_ERROR_CODES = [
  'INVALID_IMPORT_FILE',
  'UNSUPPORTED_FILE_TYPE',
  'EMPTY_IMPORT',
  'VERSION_NOT_ACTIVATABLE',
  'NO_ACTIVE_VERSION',
] as const satisfies readonly ErrorCode[];

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

export function apiException(
  code: ApiErrorCode,
  status: number,
  details?: unknown,
  message?: string,
): AppException {
  return new AppException(code, status, details, message);
}
