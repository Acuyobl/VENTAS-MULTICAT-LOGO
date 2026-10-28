import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '@ventascatalogo/contracts';

const DEFAULT_MESSAGES: Partial<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Los datos enviados no son válidos.',
  UNAUTHORIZED: 'Credenciales inválidas o sesión ausente.',
  FORBIDDEN: 'No tenés permiso para realizar esta acción.',
  NOT_FOUND: 'El recurso no existe.',
  AUTH_WRONG_AUDIENCE: 'Esta sesión no corresponde a la cara solicitada.',
  AUTH_SESSION_REVOKED: 'La sesión fue revocada.',
  AUTH_SESSION_EXPIRED: 'La sesión expiró. Volvé a iniciar sesión.',
  AUTH_INVITATION_EXPIRED: 'La invitación expiró o ya fue utilizada.',
  AUTH_MFA_REQUIRED: 'Se requiere el segundo factor.',
  AUTH_MFA_INVALID: 'El código de verificación no es válido.',
  PERMISSION_UNDECLARED: 'La ruta no declara un permiso atómico.',
  CATALOG_SCOPE_REQUIRED: 'Falta el encabezado X-Catalog-Id.',
  CATALOG_NOT_FOUND: 'El catálogo no existe.',
  RATE_LIMITED: 'Demasiados intentos. Esperá unos minutos.',
  INTEGRATION_NOT_CONFIGURED: 'La integración no está configurada.',
};

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: number,
    public readonly details?: unknown,
    message?: string,
  ) {
    super(
      {
        code,
        statusCode: status,
        message: message ?? DEFAULT_MESSAGES[code] ?? 'Error',
        details: details ?? null,
      },
      status,
    );
  }
}
