# Pruebas de `apps/api`

Batería unitaria y E2E de la API de VentasCatálogo. Cubre los criterios de
verificación de F0 (`docs/04-GUIA-IMPLEMENTACION.md` §4.1) y el incremento F1 de
versionado, importación CSV/XLSX y productos por versión.

- **Unit:** 77 tests en 10 archivos (`src/**/*.spec.ts`), con Vitest. No requieren
  infraestructura: los servicios externos (ioredis, MinIO) se sustituyen por
  dobles.
- **E2E:** 30 tests en 7 archivos (`test/**/*.e2e-spec.ts`), con Supertest contra
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

| Archivo                                                 | Qué verifica                                                                                                                                                                                                                                                                                                                              | Criterio / invariante   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/modules/auth/token.service.spec.ts`                | access token con `aud=staff`/`aud=customer`, `iss`, `sub`, `org`, TTL de 15 min, token vencido, MFA token con `aud=mfa` y TTL 5 min, rechazo de tokens cruzados/falsificados, el token no incluye permisos                                                                                                                                | §4.1.2, AUTHZ-T14       |
| `src/common/guards/audience.guard.spec.ts`              | deja pasar la audiencia correcta (handler y clase), rechaza el cruce con `403 AUTH_WRONG_AUDIENCE` + `details.expected/received`, sin `@Audience` no restringe, sin usuario → 401                                                                                                                                                         | §4.1.2, AUTHZ-T09, A-R9 |
| `src/common/guards/permissions.guard.spec.ts`           | permite con permiso, `403 FORBIDDEN` con `details.missing`, comodín `*`, `@SkipPermissions`, `@Public`, sin `@RequirePermissions` → 500 `PERMISSION_UNDECLARED`, sin usuario → 401                                                                                                                                                        | §4.1.1, A-R1, AUTHZ-T06 |
| `src/modules/health/health.service.spec.ts`             | agregación de `database/redis/storage/queues`, `degraded` si falla Postgres/Redis/MinIO, tolerancia a errores de conexión sin lanzar                                                                                                                                                                                                      | §4.1.6                  |
| `src/modules/storage/storage.service.spec.ts`           | buckets por configuración, creación idempotente de buckets, arranque tolerante a MinIO caído, `ping()` true/false                                                                                                                                                                                                                         | §4.1.6                  |
| `src/modules/catalogs/import/normalize-header.spec.ts`  | normalización de cabeceras (acentos, mayúsculas, signos), sinónimos del contrato F1, `mapping` explícito gana, columnas inexistentes reportadas, sin reutilizar columnas                                                                                                                                                                  | F1 importación          |
| `src/modules/catalogs/import/parse-import-file.spec.ts` | decodificación CSV UTF-8/BOM/latin1, detección de delimitador, cabeceras vacías/duplicadas, pipeline completo sobre `tools/fixtures/catalogo-demo.csv` (42 filas → 37 productos + 5 issues) y CSV con `;`                                                                                                                                 | F1 importación          |
| `src/modules/catalogs/import/row-validator.spec.ts`     | normalización de dinero con `toMinorAmount` (`₡`, `$`, miles, USD), `MISSING_PRICE`/`INVALID_PRICE`, `DUPLICATE_SKU` insensible a mayúsculas, `MISSING_SKU`/`MISSING_NAME`, `rawData` original, costo y stock opcionales                                                                                                                  | F1 importación          |
| `src/config/env.schema.spec.ts`                         | `DEV_AUTH_HELPERS`: default `false`, parseo `true`, fail-fast si `NODE_ENV=production` + flag encendido, valor no booleano rechazado                                                                                                                                                                                                      | Tarea 10 (dev MFA)      |
| `src/modules/auth/dev-auth.service.spec.ts`             | flag apagado → `404 NOT_FOUND` sin tocar Prisma/tokens; flag encendido + secreto → TOTP de 6 dígitos con `expiresInSeconds` 1-30; enrolamiento (`mfaEnabled=false` + `purpose=mfa:enroll`) permitido; sin secreto → `409 AUTH_MFA_INVALID` (`mfa_not_enrolled`); `mfaToken` inválido → `401 AUTH_MFA_REQUIRED`; usuario inexistente → 401 | Tarea 10 (dev MFA)      |

### E2E

| Archivo                                | Qué verifica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Criterio / invariante           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `test/two-faces.e2e-spec.ts`           | login de cliente → `aud=customer`, permisos `self:*`, cookies `vc_customer_at/rt` HttpOnly; `/auth/me`; token de cliente → `403 AUTH_WRONG_AUDIENCE` en `/users` y `/catalogs`; sin sesión → 401; body inválido → `400 VALIDATION_FAILED` con `details`; credenciales malas → 401 sin enumeración                                                                                                                                                                                                                                                                                                                                                                                                                                  | §4.1.2, §4.1.5, AUTHZ-T09       |
| `test/staff-mfa.e2e-spec.ts`           | primer login de `org_admin` → `mfa_enrollment_required`; `/auth/mfa/enroll` (otplib) → secreto; OTP inválido → `401 AUTH_MFA_INVALID`; OTP válido → cookies `vc_staff_at/rt`; `/users` 200 acotado a su org (no ve miembros de Aliada); segundo login → `mfa_required` + TOTP; mfaToken inválido → 401                                                                                                                                                                                                                                                                                                                                                                                                                             | §4.1.4, RF-USR-02, A-R12        |
| `test/sessions.e2e-spec.ts`            | refresh rota el token; reutilizar el refresh anterior → `401 AUTH_SESSION_REVOKED` (revoca la familia); `DELETE /auth/sessions/{id}` → el siguiente refresh responde `401 AUTH_SESSION_REVOKED`; refresh sin cookie → 401 `reason=refresh_cookie_missing`; refresh de cliente no sirve como staff                                                                                                                                                                                                                                                                                                                                                                                                                                  | §4.1.5, RF-USR-03, AUTHZ-T13    |
| `test/multi-org-isolation.e2e-spec.ts` | `mixto` staff en Demo: `/catalogs` solo devuelve catálogos de Demo (no el de Aliada) y sin `user:manage` → 403; `mixto` cliente en Aliada: `/auth/me` con org Aliada, solo permisos `self:*`, sin `vendedor`; su token customer contra `/catalogs` → 403 `AUTH_WRONG_AUDIENCE`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | §4.1.2, §4.1.3, AUTHZ-T11, A-R9 |
| `test/health.e2e-spec.ts`              | `/health` 200 (público) y `/health/ready` 200 con `database/redis/storage/queues` en `up` contra la infra real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | §4.1.6                          |
| `test/catalog-f1.e2e-spec.ts`          | importa el fixture real (42 filas → versión `VALIDATED` con 37 productos y 5 issues: 3 `DUPLICATE_SKU` + 2 `MISSING_PRICE`), snapshot en MinIO, auditoría `catalog.imported`; reimport idempotente (200, misma versión, 0 duplicados); `GET /imports/:jobId`; v2 con checksum distinto, activación (v1 `ARCHIVED` intacta con 37 productos, `activeVersionId`=v2, `catalog.version.activated`), `/products` por versión activa y por `versionId`; cursor `limit=10` sin repetidos ni mezcla; filtros `q`/`category`; 404 `CATALOG_NOT_FOUND` multi-org; 403 `AUTH_WRONG_AUDIENCE` cliente; 400 `INVALID_IMPORT_FILE`/`UNSUPPORTED_FILE_TYPE`/`EMPTY_IMPORT`; 409 `NO_ACTIVE_VERSION` y `VERSION_NOT_ACTIVATABLE`; validate/archive | F1 versionado/importación       |
| `test/dev-auth-helpers.e2e-spec.ts`    | con `DEV_AUTH_HELPERS=true`: login del admin sembrado → `mfa_enrollment_required` → `/auth/mfa/enroll` → `POST /auth/dev/totp` devuelve un TOTP de 6 dígitos válido (`authenticator.check`) y `expiresInSeconds` 1-30 → `/auth/mfa/verify` emite sesión staff; segundo login `mfa_required` resuelto solo con el helper; `mfaToken` inválido → 401; con el flag apagado (app nueva tras reiniciar el registro de módulos) → `404 NOT_FOUND` y el login sigue funcionando                                                                                                                                                                                                                                                           | Tarea 10 (dev MFA)              |

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

## Hallazgos de la implementación F1

- `packages/contracts` no tiene todavía los códigos de error que exige F1
  (`INVALID_IMPORT_FILE`, `UNSUPPORTED_FILE_TYPE`, `EMPTY_IMPORT`,
  `VERSION_NOT_ACTIVATABLE`, `NO_ACTIVE_VERSION`). Como la tarea prohíbe tocar
  `packages/`, viven en `src/common/errors/api-error-codes.ts` y el filtro HTTP
  los deja pasar; conviene promoverlos al catálogo compartido en un follow-up.
- `GET /products` dejó de leer `X-Catalog-Id` y ahora exige `?catalogId=` (más
  `versionId?`) según el contrato de `packages/contracts`. Las páginas web de F0
  que usaban el header deben migrarse en la tarea de web F1.
- Archivar la versión activa limpia `Catalog.activeVersionId` (el catálogo queda
  sin versión publicada y `/products` responde `409 NO_ACTIVE_VERSION`); se
  permite archivar `ACTIVE`/`VALIDATED` como pide el encargo de F1, aunque la
  SPEC ERR-047 sugiera exigir un reemplazo.

## Hallazgos del helper de MFA de desarrollo (tarea 10)

- `DEV_AUTH_HELPERS` es `false` por defecto en el schema y en `.env.example`;
  `validateEnv` aborta el arranque si se combina con `NODE_ENV=production`
  (verificado también con `node dist/main.js`: exit 1 y mensaje claro).
- El E2E usa el **admin sembrado** y lo deja temporalmente sin MFA durante el
  flujo (~1 s), restaurando `mfaEnabled`/`mfaSecretEnc` originales y borrando las
  sesiones/auditoría que crea. Si estás probando la web al mismo tiempo, el login
  puede pedir MFA de nuevo mientras corre ese test.
- `POST /auth/dev/totp` no salta la verificación: el código se valida igual en
  `/auth/mfa/verify`. El flag se evalúa en el handler para no romper el DI y el
  endpoint responde `404 NOT_FOUND` cuando está apagado.

## Añadir un test

- Unitario: `src/<módulo>/<archivo>.spec.ts` (misma carpeta que el fuente).
- E2E: `test/<flujo>.e2e-spec.ts`. Reutilizá `test/helpers/test-harness.ts`
  (crea la app sin `listen`) y `test/helpers/fixtures.ts` (usuarios/catálogos
  efímeros y limpieza). Nunca compartas datos entre archivos: cada archivo crea
  y borra lo suyo.
