# Pruebas de `apps/api` (F0)

Batería unitaria y E2E de la API de VentasCatálogo para los criterios de
verificación de F0 de `docs/04-GUIA-IMPLEMENTACION.md` §4.1.

- **Unit:** 36 tests en 5 archivos (`src/**/*.spec.ts`), con Vitest. No requieren
  infraestructura: los servicios externos (ioredis, MinIO) se sustituyen por
  dobles.
- **E2E:** 16 tests en 5 archivos (`test/**/*.e2e-spec.ts`), con Supertest contra
  una instancia real de Nest (`Test.createTestingModule({ imports: [AppModule] })`)
  en el mismo proceso. No abren puerto fijo ni dependen del `pnpm dev` de la API.

## Requisitos

1. Node 24 y pnpm 9 (los del monorepo).
2. Infraestructura local arriba: `pnpm infra:up` (Postgres 55432, Redis 6379,
   MinIO 9000, Mailpit 1025/8025).
3. Migraciones aplicadas y seed ejecutado (idempotente):

   ```bash
   pnpm db:deploy
   pnpm db:seed
   ```

   El seed deja las organizaciones `demo` y `aliada`, los roles de sistema y los
   usuarios demo. Los E2E **crean sus propios usuarios/catálogos** con emails y
   slugs únicos (`*@qa.ventascatalogo.test`) y los borran en `afterAll`; no
   modifican el seed y se pueden ejecutar repetidas veces.

## Comandos

```bash
# Unit (sin infraestructura)
pnpm --filter @ventascatalogo/api test

# E2E (requiere infra + seed del punto anterior)
pnpm --filter @ventascatalogo/api test:e2e
```

Los E2E usan `fileParallelism: false` porque comparten Postgres/Redis/MinIO y los
usuarios del seed. `vitest.e2e.config.ts` incluye un plugin que transforma los
`.ts` con el compilador de TypeScript para emitir `design:paramtypes`
(`emitDecoratorMetadata`), algo que el esbuild por defecto de Vite no hace y que
NestJS necesita para resolver la inyección de dependencias.

Variables de entorno: se cargan del `.env` de la raíz, igual que `main.ts`. El
setup de E2E fuerza `NODE_ENV=test` (cookies sin `Secure` para HTTP local) y
`LOG_LEVEL=silent` (los tests afirman sobre HTTP, no sobre logs). No se usa SMTP:
los flujos probados no envían correo, así que no hay dependencia de Mailpit.

## Cobertura por criterio de §4.1

### Unitarios

| Archivo                                       | Qué verifica                                                                                                                                                                                               | Criterio / invariante   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/modules/auth/token.service.spec.ts`      | access token con `aud=staff`/`aud=customer`, `iss`, `sub`, `org`, TTL de 15 min, token vencido, MFA token con `aud=mfa` y TTL 5 min, rechazo de tokens cruzados/falsificados, el token no incluye permisos | §4.1.2, AUTHZ-T14       |
| `src/common/guards/audience.guard.spec.ts`    | deja pasar la audiencia correcta (handler y clase), rechaza el cruce con `403 AUTH_WRONG_AUDIENCE` + `details.expected/received`, sin `@Audience` no restringe, sin usuario → 401                          | §4.1.2, AUTHZ-T09, A-R9 |
| `src/common/guards/permissions.guard.spec.ts` | permite con permiso, `403 FORBIDDEN` con `details.missing`, comodín `*`, `@SkipPermissions`, `@Public`, sin `@RequirePermissions` → 500 `PERMISSION_UNDECLARED`, sin usuario → 401                         | §4.1.1, A-R1, AUTHZ-T06 |
| `src/modules/health/health.service.spec.ts`   | agregación de `database/redis/storage/queues`, `degraded` si falla Postgres/Redis/MinIO, tolerancia a errores de conexión sin lanzar                                                                       | §4.1.6                  |
| `src/modules/storage/storage.service.spec.ts` | buckets por configuración, creación idempotente de buckets, arranque tolerante a MinIO caído, `ping()` true/false                                                                                          | §4.1.6                  |

### E2E

| Archivo                                | Qué verifica                                                                                                                                                                                                                                                                                           | Criterio / invariante           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `test/two-faces.e2e-spec.ts`           | login de cliente → `aud=customer`, permisos `self:*`, cookies `vc_customer_at/rt` HttpOnly; `/auth/me`; token de cliente → `403 AUTH_WRONG_AUDIENCE` en `/users` y `/catalogs`; sin sesión → 401; body inválido → `400 VALIDATION_FAILED` con `details`; credenciales malas → 401 sin enumeración      | §4.1.2, §4.1.5, AUTHZ-T09       |
| `test/staff-mfa.e2e-spec.ts`           | primer login de `org_admin` → `mfa_enrollment_required`; `/auth/mfa/enroll` (otplib) → secreto; OTP inválido → `401 AUTH_MFA_INVALID`; OTP válido → cookies `vc_staff_at/rt`; `/users` 200 acotado a su org (no ve miembros de Aliada); segundo login → `mfa_required` + TOTP; mfaToken inválido → 401 | §4.1.4, RF-USR-02, A-R12        |
| `test/sessions.e2e-spec.ts`            | refresh rota el token; reutilizar el refresh anterior → `401 AUTH_SESSION_REVOKED` (revoca la familia); `DELETE /auth/sessions/{id}` → el siguiente refresh responde `401 AUTH_SESSION_REVOKED`; refresh sin cookie → 401 `reason=refresh_cookie_missing`; refresh de cliente no sirve como staff      | §4.1.5, RF-USR-03, AUTHZ-T13    |
| `test/multi-org-isolation.e2e-spec.ts` | `mixto` staff en Demo: `/catalogs` solo devuelve catálogos de Demo (no el de Aliada) y sin `user:manage` → 403; `mixto` cliente en Aliada: `/auth/me` con org Aliada, solo permisos `self:*`, sin `vendedor`; su token customer contra `/catalogs` → 403 `AUTH_WRONG_AUDIENCE`                         | §4.1.2, §4.1.3, AUTHZ-T11, A-R9 |
| `test/health.e2e-spec.ts`              | `/health` 200 (público) y `/health/ready` 200 con `database/redis/storage/queues` en `up` contra la infra real                                                                                                                                                                                         | §4.1.6                          |

Criterio §4.1.1 (`lint` + `typecheck` + `test` en verde) se comprueba con
`pnpm lint`, `pnpm typecheck` y los dos comandos de test de este README. El
criterio §4.1.6 en su variante `503` con Redis detenido no se automatiza aquí
porque exige parar el contenedor; la lógica de degradación está cubierta por los
unitarios de `HealthService`.

## Hallazgos de la implementación F0 (no son fallos de los tests)

- El access JWT se firma hoy con `{ sub, org, aud, iat, exp }`: no incluye `sid`
  ni `jti` (SPEC §2.5) y el guard no consulta una blocklist. Por eso la
  revocación inmediata de tokens en vuelo (A-R13) no queda garantizada; el
  criterio §4.1.5 sí se cumple porque la revocación invalida el **refresh**.
- Dos access tokens emitidos en el mismo segundo para el mismo usuario son
  idénticos (JWT determinista). La rotación del refresh es la que se verifica;
  el access se reemite con `exp` nueva.

## Añadir un test

- Unitario: `src/<módulo>/<archivo>.spec.ts` (misma carpeta que el fuente).
- E2E: `test/<flujo>.e2e-spec.ts`. Reutilizá `test/helpers/test-harness.ts`
  (crea la app sin `listen`) y `test/helpers/fixtures.ts` (usuarios/catálogos
  efímeros y limpieza). Nunca compartas datos entre archivos: cada archivo crea
  y borra lo suyo.
