import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request } from 'express';
import { assertValidEncoding } from '../utils/text-encoding';

/** Rutas públicas de webhooks: su cuerpo se valida por firma, no por encoding. */
const WEBHOOK_PATH = /\/webhooks\//;

/**
 * Guardia global de entrada: rechaza bodies JSON (y campos de texto de
 * multipart, que multer deja como strings) con U+FFFD antes de llegar al
 * controller, con 422 `VALIDATION_FAILED` `reason=invalid_encoding` + path.
 */
@Injectable()
export class EncodingGuardInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const url = request.originalUrl ?? request.url ?? '';
    if (WEBHOOK_PATH.test(url)) return next.handle();
    if (request.body !== undefined && request.body !== null) {
      assertValidEncoding(request.body);
    }
    return next.handle();
  }
}
