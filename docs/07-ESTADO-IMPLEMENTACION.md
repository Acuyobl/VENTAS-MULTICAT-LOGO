---
title: Estado de implementación
tipo: bitacora
estado: en-curso
fase: F0
version: 0.1.0
fecha: 2026-10-28
idioma: es-CR
---

# Estado de implementación — F0

Bitácora de lo construido y verificado contra `docs/04-GUIA-IMPLEMENTACION.md` §4.1.
La fuente de verdad del diseño sigue siendo el paquete documental (`docs/00`–`docs/06`).

## 1. Resumen

| Dimensión | Estado |
|---|---|
| Monorepo y tooling (F0.1) | ✅ `pnpm` workspaces + Turborepo + ESLint 9 + Prettier + Husky |
| API NestJS con config validada y pino (F0.2) | ✅ `/api/docs` (Swagger), `traceId`, `HttpExceptionFilter` |
| Infra Docker + extensiones (F0.3) | ✅ postgres, redis, minio, mailpit; `pg_trgm`, `unaccent`, `pgcrypto` |
| Prisma + migración de identidad (F0.4) | ✅ `20261028140137_init_identity_and_users` (34 modelos) |
| Módulo de usuarios y roles (F0.5) | ✅ `User`, `Membership`, `Role`, `Permission`, `RoleAssignment`, `CustomerAccount`, `AuthSession`, `VerificationToken`, `Consent`, `UserInvitation`, `Address` |
| Seed de 8 roles + 3 usuarios demo (F0.6) | ✅ org Demo y org Aliada, catálogo demo con 12 productos |
| Auth de dos audiencias (F0.7) | ✅ `staff-jwt` / `customer-jwt`, cookies separadas, Argon2id, bloqueo y rate limit |
| Refresh rotation + revocación (F0.8) | ✅ rotación y detección de reutilización; sesiones por dispositivo |
| Invitaciones (F0.9) | ✅ token de un solo uso, email en Mailpit, aceptación con rol y scope |
| MFA TOTP, magic link, recuperación (F0.10) | ✅ flujo staff completo; magic link y reset implementados y expuestos |
| Guards y permisos (F0.11) | ✅ `AudienceGuard` (403 `AUTH_WRONG_AUDIENCE`) + `PermissionsGuard` + scopes |
| Health, errores, Swagger (F0.12) | ✅ `/health` y `/health/ready` con `database`, `redis`, `storage`, `queues` |
| CI + Husky (F0.13) | ✅ CI en GitHub Actions verde (80–89 s) y cobertura de API/web publicada como artefacto |
| Web con dos caras (F0.14) | ✅ route groups `(backoffice)`, `(tienda)`, `(portal)`, `(auth)`, middleware por host |
| Pruebas automáticas | ✅ 36 tests unitarios + 16 e2e en verde (`apps/api`), más los specs de `packages/contracts`, `packages/ai` y `apps/web` |

## 2. Entorno real de esta máquina (desviaciones respecto a la guía)

| Punto | Guía | Esta máquina | Motivo / decisión |
|---|---|---|---|
| Node | 22 LTS | 24.21 | Ya instalado; el código compila y corre. `engines: >=20.11` |
| pnpm | 9 | 9.15.4 | Instalado global |
| Puerto Postgres | 5432 | **55432** | 5432 lo usa otro proyecto y 5433 un PostgreSQL local de otra app |
| Imagen MinIO | `minio/minio` | `elestio/minio` | Docker Hub rechaza `minio/minio` en esta red; es el mismo binario |
| Buckets | contenedor `minio/mc` | `StorageService.ensureBuckets()` | La API crea `vc-products`, `vc-docs`, `vc-public` al arrancar |
| Puerto web de verificación | 3000 | 3010 | 3000 está ocupado por otro proceso del equipo |

Los cambios de puerto viven solo en `.env` (no versionado); `docker-compose.yml` usa
`${POSTGRES_PORT:-5432}` y `.env.example` documenta el valor por defecto.

## 3. Evidencia de verificación (ejecutada)

```text
pnpm typecheck                     → 7/7 tareas OK
pnpm lint                          → 7/7 tareas OK (0 errores)
pnpm build                         → 5/5 tareas OK (API dist + Next 13 rutas + middleware)
GET  /api/v1/health                → 200 {"status":"ok"}
GET  /api/v1/health/ready          → 200 database/redis/storage/queues = up
POST /api/v1/auth/login (cliente)  → 200 authenticated, cookie vc_customer_at
POST /api/v1/auth/login (admin)    → 200 mfa_enrollment_required + mfaToken
POST /api/v1/auth/mfa/enroll       → 200 secret + otpauthUrl
POST /api/v1/auth/mfa/verify       → 200 authenticated, cookie vc_staff_at (org_admin)
GET  /api/v1/users (cookie cliente) → 403 AUTH_WRONG_AUDIENCE {expected:staff, received:customer}
GET  /api/v1/users (staff)         → 200 (2 miembros, 7 roles asignables)
GET  /api/v1/catalogs (staff)      → 200 Catálogo Demo v1, 12 productos
POST /api/v1/users/invitations     → 201 + email entregado en Mailpit
GET  /api/v1/auth/invitation?token → 200 (preview)
POST /api/v1/auth/invitation/accept→ 201; el colaborador entra con rol vendedor y ve 1 catálogo
POST /api/v1/auth/refresh          → 200 (rota el refresh token)
POST /api/v1/auth/refresh (viejo)  → 401 (reutilización detectada, familia revocada)
GET  /c/catalogo-demo (Host tienda) → 200, 12 productos desde la API pública
Host app.localhost /panel sin sesión → 307 a /login?next=/panel
Host tienda.localhost /mi-cuenta    → 307 a /mi-cuenta/entrar
pnpm test                          → 6/6 tareas OK: 36 unit API + 16 e2e API + 6 contracts + 2 ai + 6 web
docker compose stop redis          → /health/ready 503 {redis:down, queues:down}; al reiniciar → 200
git commit 9ad0a77                 → 193 archivos, 36.853 líneas (primer commit de F0)
git push origin main               → https://github.com/Acuyobl/VENTAS-MULTICAT-LOGO (repo público)
CI run 40711946749 (717a9b3)       → success, 80 s (lint, typecheck, test, build)
CI run 40712350231 (6d44a25)       → success, 89 s + artefacto `coverage` (326 KB, API y web)
```

## 4. Defectos encontrados y corregidos en esta fase

| Defecto | Síntoma | Corrección |
|---|---|---|
| 5 errores de TypeScript heredados del scaffold | `pnpm typecheck` fallaba | Declaraciones exportadas, tipo de `RequestWithTrace`, `expiresIn` de JWT y objeto con `key` duplicado |
| `cn()` recibía `ReactNode` | `packages/ui` no compilaba | `error ? 'vc-input--error' : undefined` |
| Asignaciones `ORGANIZATION` con `scopeId = null` | Un colaborador invitado entraba sin rol ni permisos | `scopeId = organizationId` al aceptar (igual que el seed); reparación de datos existentes |
| Sin migraciones | La BD no se materializaba | Migración `init_identity_and_users` |
| MinIO sin buckets | `/health/ready` reportaba `storage: down` | `StorageModule` global que crea buckets al arrancar |
| Imagen `minio/minio` no descargable | `docker compose up` fallaba | `elestio/minio` documentado |
| Puerto 5432/5433 ocupados | Prisma recibía `P1010` | Puerto 55432 vía `POSTGRES_PORT` |
| `toMinorAmount('5.000','CRC')` devolvía 5 colones | Importes de Excel/Sheets mal convertidos (riesgo directo de dinero) | Parser reescrito con reglas de separador decimal/miles por moneda y 6 casos de prueba |
| Convención de descuento/IVA ambigua entre §3.4 y el `CHECK` de totales | Totales no cuadraban con la prueba de dinero | Se adopta §3.4: descuento reduce la base, subtotal neto, `total = subtotal + IVA`; el `CHECK` queda anotado para alinear |
| Access JWT sin `sid`/`jti` (hallazgo de QA) | No hay blocklist de access tokens en vuelo | Revocación efectiva por refresh; se planifica el `jti` en F1 sin romper el contrato actual |

## 5. Pendiente antes de cerrar F0

1. **Criterio 8**: cronometrar el bootstrap completo de un dev nuevo (< 30 min) y corregir la guía.
2. **Demo de F0** con las dos caras y tag `v0.1.0`.
3. **Alinear la convención de dinero** en `docs/03`: §3.4 define descuento antes de impuesto y
   `subtotal = Σ neto`, mientras que el `CHECK` de `quotes`/`orders` usa
   `total = subtotal + IVA − descuento`. La implementación sigue §3.4; el `CHECK` debe ajustarse.
4. **Blocklist de `jti`/`sid`** (hallazgo de QA): el access token no lleva identificador de sesión,
   así que la revocación es efectiva vía refresh (criterio §4.1.5 cumplido) pero no hay corte
   inmediato del access token en vuelo (A-R13). Planificado para F1.
5. Aviso de `path-to-regexp` en Swagger: migrar la ruta comodín a `/*path` para no depender del
   conversor legacy.
6. **Cobertura**: hoy se publica como artefacto; falta fijar umbrales mínimos por app en F1.

## 6. Cómo levantar el proyecto hoy

```powershell
# 1. Infraestructura (Postgres 55432, Redis 6379, MinIO 9000/9001, Mailpit 8025)
docker compose up -d

# 2. Dependencias y base de datos
pnpm install
pnpm db:migrate
pnpm db:seed

# 3. API (3001) y web (3000; en esta máquina 3010 si está ocupado)
pnpm --filter @ventascatalogo/api dev
pnpm --filter @ventascatalogo/web dev

# 4. Verificación rápida
curl http://localhost:3001/api/v1/health/ready
```

Usuarios demo (`Demo1234!`): `admin@ventascatalogo.local` (org_admin, MFA obligatorio),
`cliente@ventascatalogo.local` (cliente), `mixto@ventascatalogo.local` (staff en Demo y cliente en Aliada).

### 6.1 MFA de los usuarios demo

`org_admin` exige segundo factor. En desarrollo el seed **reinicia** el MFA de los usuarios demo
(sin secreto y sin bloqueos), así que el primer login muestra el **QR de enrolamiento** con la
clave manual; se escanea con Google Authenticator, Authy o 1Password y se confirma con los 6 dígitos.

Si el login pide un código que no tenés (por ejemplo, tras una prueba automatizada):

```powershell
# Desactiva MFA del usuario y permite enrolarse de nuevo con QR
pnpm --filter @ventascatalogo/api mfa:dev reset admin@ventascatalogo.local

# Imprime el código TOTP vigente (útil para demos guiadas o scripts)
pnpm --filter @ventascatalogo/api mfa:dev code admin@ventascatalogo.local
```

Los códigos TOTP cambian cada 30 segundos: un código copiado de una sesión anterior ya no sirve.

### 6.2 Autocompletado del código en desarrollo

Con `DEV_AUTH_HELPERS=true` (API) y `NEXT_PUBLIC_DEV_AUTH_HELPERS=true` (web) **el campo se llena
solo** y el usuario únicamente confirma:

- **Enrolamiento**: la web recibe el `secret` del QR y genera el TOTP en el navegador
  (`apps/web/src/lib/totp.ts`, validado con los vectores del RFC 6238). El campo se refresca cada
  segundo con la cuenta atrás de la ventana.
- **Logins posteriores**: la web llama a `POST /auth/dev/totp` con el `mfaToken` del login y recibe
  `{ code, expiresInSeconds }` para completar el campo (se refresca cada 25 s).
- **El código se sigue validando** en `/auth/mfa/verify`; el helper no salta la verificación.
- **Producción**: ambos flags deben estar en `false`. La API **aborta el arranque** si
  `NODE_ENV=production` con `DEV_AUTH_HELPERS=true`, y el endpoint responde `404` cuando el flag
  está apagado.

```powershell
# .env (raíz) y apps/web/.env.local — solo desarrollo
DEV_AUTH_HELPERS=true
NEXT_PUBLIC_DEV_AUTH_HELPERS=true
```

Recordá reiniciar la API y **recompilar la web** al cambiar el flag (Next lo inlinea en el build).



## 7. Siguiente hito

**F1 — Catálogo y ventas** (`docs/04` §4.2): OAuth de Google Drive, pipeline de importación
(Sheets/XLSX/CSV/PDF), versionado `draft → validated → active`, catálogo público con carrito,
cotizaciones y pedidos con PDF. Antes de empezar: cerrar los 6 puntos de §5.
