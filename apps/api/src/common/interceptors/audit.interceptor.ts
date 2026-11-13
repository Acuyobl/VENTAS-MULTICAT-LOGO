import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { AuditService } from '../../modules/audit/audit.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Prefijos de infraestructura que no identifican al recurso auditado. */
const INFRA_SEGMENTS = new Set(['api', 'v1', 'v2', 'v3', 'v4']);

type AuditedRequest = Request & {
  traceId?: string;
  id?: string;
  user?: AuthenticatedUser;
};

/** `/api/v1/orders/:id` → `api/v1/orders/:id` (sin barras sobrantes). */
export function normalizeRouteTemplate(request: Request): string {
  const route = request.route as { path?: unknown } | undefined;
  const routePath = typeof route?.path === 'string' ? route.path : request.path;
  const raw = routePath.length > 0 ? routePath : request.path;
  return raw.replace(/\/+/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

/** Primer segmento que representa un recurso (ignora prefijo y parámetros). */
export function resourceSegment(routeTemplate: string): string {
  const segments = routeTemplate
    .split('/')
    .filter(
      (segment) => segment.length > 0 && !segment.startsWith(':') && !INFRA_SEGMENTS.has(segment),
    );
  return segments[0] ?? 'unknown';
}

/** `orders` → `order`, `payments` → `payment`, `categories` → `category`. */
export function singularize(segment: string): string {
  if (segment.endsWith('ies') && segment.length > 3) return `${segment.slice(0, -3)}y`;
  if (segment.endsWith('s') && segment.length > 1) return segment.slice(0, -1);
  return segment;
}

/**
 * Auditoría transversal de escrituras HTTP. Solo actúa sobre métodos con efecto
 * y con usuario autenticado; nunca registra el body completo (solo sus claves)
 * y nunca lanza: un fallo de auditoría no puede tumbar la respuesta.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditedRequest>();
    const method = (request.method ?? '').toUpperCase();
    if (!MUTATING_METHODS.has(method) || !request.user) return next.handle();

    const routeTemplate = normalizeRouteTemplate(request);

    return next.handle().pipe(
      tap(() => {
        void this.record(request, method, routeTemplate);
      }),
    );
  }

  private async record(
    request: AuditedRequest,
    method: string,
    routeTemplate: string,
  ): Promise<void> {
    try {
      const user = request.user;
      if (!user) return;

      const bodyKeys =
        request.body && typeof request.body === 'object' ? Object.keys(request.body) : [];
      const headers = request.headers;

      await this.audit.write({
        organizationId: user.organizationId ?? null,
        actorUserId: user.id,
        action: `http.${method.toLowerCase()}.${routeTemplate || 'unknown'}`,
        entityType: singularize(resourceSegment(routeTemplate)),
        entityId: typeof request.params?.id === 'string' ? request.params.id : '',
        before: { keys: bodyKeys },
        after: { keys: bodyKeys },
        ip: request.ip ?? null,
        userAgent: headers['user-agent'] ?? null,
        traceId: request.traceId ?? request.id ?? randomUUID(),
      });
    } catch (error) {
      this.logger.error(
        { err: error, route: routeTemplate, method },
        'audit_http_write_failed',
      );
    }
  }
}
