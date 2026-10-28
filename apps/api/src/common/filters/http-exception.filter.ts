import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { isErrorCode, type ErrorCode } from '@ventascatalogo/contracts';
import { AppException } from '../errors/app-exception';
import { isApiErrorCode, type ApiErrorCode } from '../errors/api-error-codes';

interface ErrorResponseBody {
  code?: string;
  message?: string | string[];
  details?: unknown;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { traceId?: string }>();
    const traceId = req.traceId ?? randomUUID();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let body: ErrorResponseBody | undefined;
    if (isHttp) {
      const raw = exception.getResponse();
      body = typeof raw === 'string' ? { message: raw } : (raw as ErrorResponseBody);
    }

    const rawCode = body?.code;
    const code: ErrorCode | ApiErrorCode = isErrorCode(rawCode)
      ? rawCode
      : isApiErrorCode(rawCode)
        ? rawCode
        : status >= 500
          ? 'INTERNAL_ERROR'
          : 'HTTP_ERROR';
    const message =
      status >= 500
        ? 'Error interno del servidor'
        : Array.isArray(body?.message)
          ? body.message.join(', ')
          : (body?.message ?? 'Error');

    if (status >= 500) {
      this.logger.error({ err: exception, traceId }, 'unhandled_exception');
    }

    res.status(status).json({
      code,
      message,
      details: body?.details ?? null,
      traceId,
    });
  }
}

export function httpStatusForCode(code: ErrorCode): number {
  if (code === 'UNAUTHORIZED' || code.startsWith('AUTH_SESSION')) return 401;
  if (code === 'AUTH_WRONG_AUDIENCE' || code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND' || code === 'CATALOG_NOT_FOUND') return 404;
  if (code === 'VALIDATION_FAILED') return 400;
  return 400;
}

export { AppException };
