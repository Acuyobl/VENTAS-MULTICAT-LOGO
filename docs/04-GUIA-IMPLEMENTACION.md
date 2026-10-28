---
title: Guía de implementación paso a paso
tipo: runbook
estado: aprobado
version: 1.1
fecha: 2026-10-28
idioma: es-CR
audiencia: desarrolladores full-stack que arrancan VentasCatálogo desde cero
objetivo: que una persona sin contexto previo levante el entorno local, comprenda la arquitectura y entregue las fases F0–F4 en 15 semanas (14 con 2 devs en F1–F3)
documentos_relacionados:
  - docs/00-BRIEF.md
  - docs/01-CONTEXTO-Y-DECISIONES.md
  - docs/02-ANALISIS.md
  - docs/03-SPEC.md
  - docs/05-IDEAS.md
duracion_estimada_lectura: 90 min
---

# Guía de implementación paso a paso

> **Este documento es un runbook, no un ensayo.** Se ejecuta en orden. Cada comando es
> literal, cada ruta es relativa a la raíz del monorepo y los puertos son siempre los
> mismos en todo el documento. Si algo no coincide con `docs/01-CONTEXTO-Y-DECISIONES.md`,
> manda ese documento: aquí solo se operacionaliza.
>
> Las decisiones de arquitectura citadas como `ADR-01`..`ADR-18` y las reglas duras
> `R1`..`R11` provienen de `docs/01-CONTEXTO-Y-DECISIONES.md` y **no se reinterpretan**.
> El producto tiene **dos caras** (backoffice staff y tienda/portal del cliente) sobre un
> mismo backend: ver ADR-17, ADR-18 y §5.1 de ese documento.

## 0. Cómo usar esta guía

| Si sos… | Empezá por | Después |
|---|---|---|
| Dev nuevo en el proyecto | §1, §2, §3 (bootstrap completo) | §13 checklist de arranque |
| Dev que va a picar código en F1–F2 | §4 (fases), §5 (patrones), §6 (Prisma) | §9 (testing) |
| Dev que va a trabajar IA o importación | §5.8, §5.11, §7, §8 | §11 (coste y observabilidad) |
| Dev de usuarios, roles o portal del cliente | §2.1 (route groups), §5.3, §5.15, §6.2, §11.6.7 | §9.2 (T-11 a T-15) |
| DevOps / quien despliega | §3 (Docker), §10 (CI/CD y VPS) | §11 (runbook) |
| Tech lead / planificación | §4, §12 (plan de 15 semanas y capacidad) | §10.7 (checklists de salida) |

Reglas de lectura:

1. **Los puertos no cambian:** API `3001`, web `3000`, PostgreSQL `5432`, Redis `6379`,
   MinIO `9000` (S3) y `9001` (consola), Mailpit `8025` (UI) y `1025` (SMTP).
2. **Siempre se ejecuta desde la raíz del monorepo** salvo que el bloque diga otra cosa.
3. Los bloques marcados `PowerShell 7` son para Windows; los marcados `bash` para
   macOS/Linux. Si un bloque no tiene marca, el comando es idéntico en ambos.
4. Los valores `<...>` son reemplazos obligatorios; los `...` dentro de un secreto son
   parte del formato, no del valor real.
5. Todo lo que se crea en una fase lleva tests y se registra en `docs/03-SPEC.md`
   (DoD de `docs/01-CONTEXTO-Y-DECISIONES.md §4.14`).

Ruta del proyecto en Windows (con acentos y espacios, siempre entre comillas):

```text
C:\Users\Usuario\Documents\Programación\APLICACIÓN DE VENTAS MULTICATÁLOGO CON IA
```

## 1. Requisitos de máquina y herramientas

> El cronograma base es de **15 semanas con 1,5 dev**; los supuestos de capacidad, la variante
> de 14 semanas con 2 devs y el criterio de recorte están en §12.1. Consultá esa sección antes
> de comprometer fechas.

### 1.1 Hardware mínimo

| Recurso | Mínimo | Recomendado | Por qué |
|---|---|---|---|
| CPU | 4 vCPU | 8 vCPU | Next.js en dev + NestJS + Postgres + Redis + MinIO |
| RAM | 16 GB | 32 GB | Docker Desktop con WSL2 consume 4–8 GB |
| Disco libre | 20 GB | 40 GB SSD | Imágenes Docker, `node_modules` (~1.5 GB), volúmenes |
| Red | 20 Mbps | 50 Mbps | Descarga de catálogos desde Drive y llamadas a IA |

### 1.2 Software obligatorio

| Herramienta | Versión objetivo | Para qué |
|---|---|---|
| Node.js | **22.x LTS** (22.18 o superior) | API y web; no usar Node 23/24 (ADR-02) |
| pnpm | **9.15.x** (vía corepack) | Workspaces del monorepo |
| Docker Desktop / Docker Engine | 26+ con Compose v2 | Postgres, Redis, MinIO, Mailpit |
| Git | 2.40+ | Control de versiones |
| PowerShell 7 | 7.4+ | Shell en Windows |
| WSL2 | 2.x | Backend de Docker Desktop en Windows |
| GitHub CLI (`gh`) | 2.40+ (opcional) | PRs y releases |
| Stripe CLI | 1.19+ (opcional) | Reenviar webhooks en local |

### 1.3 Verificación de versiones

`PowerShell 7` (Windows):

```powershell
node --version          # v22.x
pnpm --version          # 9.15.x
docker --version        # 26.x o superior
docker compose version  # v2.x
git --version           # 2.40+
$PSVersionTable.PSVersion  # 7.4+
```

`bash` (macOS/Linux):

```bash
node --version && pnpm --version && docker --version && docker compose version && git --version
```

Si falta Node 22:

```bash
# macOS (Homebrew)
brew install node@22 && brew link --overwrite node@22

# Linux (nvm)
nvm install 22 && nvm use 22
```

Instalación de pnpm 9 con corepack (idéntico en los tres sistemas):

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm --version
```

> Si `corepack prepare` falla por permisos, alternativa:
> `npm install -g pnpm@9.15.4`.

### 1.4 Notas específicas de Windows

1. Habilitar rutas largas (algunos `node_modules` superan 260 caracteres):

   ```powershell
   git config --system core.longpaths true
   ```

2. Docker Desktop → *Settings → Resources*: asignar al menos **4 GB de RAM** y
   **2 CPUs** al motor WSL2.
3. Ejecutar los comandos en **PowerShell 7** (`pwsh`), no en PowerShell 5.1 ni en CMD.
4. Antivirus: excluir la carpeta del proyecto y `%LOCALAPPDATA%\pnpm` para que
   `pnpm install` no tarde 20 minutos.
5. Scripts de shell (`infra/scripts/*.sh`) se ejecutan con Git Bash o WSL, no con `cmd`.

### 1.5 Cuentas externas necesarias (antes de F1)

| Servicio | Uso | Plan de desarrollo | Qué se necesita |
|---|---|---|---|
| GitHub | Repositorio + Actions + GHCR | Free | Cuenta y organización |
| Google Cloud Console | OAuth de Drive | Free con cuota | Proyecto, pantalla de consentimiento, credencial OAuth |
| DeepSeek Platform | IA | Pago por uso (< USD 30/mes) | API key |
| Stripe | Pagos | Test mode | API key + secreto de webhook |
| MercadoPago | Pagos LATAM | Sandbox | Access token + secreto |
| WhatsApp Business Cloud | Mensajería | Sandbox | WABA, número, token, app secret |
| Resend (o SMTP propio) | Email | Free 3 000/mes | API key |

Sin `GOOGLE_CLIENT_ID`, sin `DEEPSEEK_API_KEY` y sin las claves de pago **el entorno levanta
igual** (Mailpit, MinIO y Postgres son locales); las features que dependen de ellos
responden con error controlado `INTEGRATION_NOT_CONFIGURED`.

## 2. Estructura del repositorio

### 2.1 Árbol completo (comentado)

```text
ventascatalogo/
├─ apps/
│  ├─ api/                                  # Backend NestJS 11 (ADR-02)
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma                   # Esquema único de BD (§6)
│  │  │  ├─ migrations/                     # Migraciones versionadas (§6.3)
│  │  │  └─ seed.ts                         # Org demo + catálogo de prueba (§6.4)
│  │  ├─ src/
│  │  │  ├─ main.ts                         # Bootstrap HTTP, Swagger, pino, Socket.IO
│  │  │  ├─ app.module.ts                   # Módulos de la app
│  │  │  ├─ common/                         # Transversal, sin dominio
│  │  │  │  ├─ decorators/                  # @CurrentUser, @CatalogScope, @Public
│  │  │  │  ├─ filters/                     # HttpExceptionFilter (§5.5)
│  │  │  │  ├─ guards/                      # JwtAuthGuard, AudienceGuard, PermissionsGuard, CatalogScopeGuard
│  │  │  │  ├─ interceptors/                # IdempotencyInterceptor, AuditInterceptor
│  │  │  │  ├─ pipes/                       # ZodValidationPipe
│  │  │  │  ├─ errors/                      # ErrorCode + catálogo de códigos
│  │  │  │  └─ utils/                       # money, cursor, uuidv7, dates
│  │  │  ├─ config/                         # ConfigModule + validación de env con Zod
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/                        # Login, refresh, JWT, Google OAuth
│  │  │  │  ├─ orgs/                        # Organizations + memberships (RBAC)
│  │  │  │  ├─ catalogs/                    # Catálogos, versiones, activación
│  │  │  │  │  ├─ import/                   # Pipeline Google Drive (§8)
│  │  │  │  │  └─ versions/                 # Máquina de estados draft→archived
│  │  │  │  ├─ products/                    # Productos de la versión activa
│  │  │  │  ├─ sales/                       # Cotizaciones y pedidos
│  │  │  │  ├─ payments/                    # Cobros + adaptadores por pasarela
│  │  │  │  │  └─ gateways/{stripe,mercadopago,paypal}/
│  │  │  │  ├─ finance/                     # Gastos, márgenes, reportes, exportación
│  │  │  │  ├─ ai/                          # Orquestación IA, cuotas, caché (§7)
│  │  │  │  ├─ social/                      # Generación de posts, calendario, aprobación
│  │  │  │  ├─ messaging/                   # WhatsApp Cloud API + email
│  │  │  │  ├─ chat/                        # Chat M6 (F5; contrato congelado en F3)
│  │  │  │  ├─ realtime/                    # Gateway Socket.IO + adapter Redis (§5.12; M6 en F5)
│  │  │  │  ├─ storage/                     # MinIO, URLs firmadas (§5.11)
│  │  │  │  ├─ queue/                       # Registro de colas BullMQ (§5.10)
│  │  │  │  ├─ audit/                       # Lectura de audit_log (append-only)
│  │  │  │  ├─ health/                      # /health y /health/ready
│  │  │  │  └─ admin/                       # Superadmin: orgs, cuotas, planes
│  │  │  ├─ outbox/                         # Publicador de eventos (ADR-13)
│  │  │  └─ test/                           # Utilidades de test compartidas
│  │  ├─ test/                              # E2E con Supertest + Testcontainers
│  │  ├─ Dockerfile                         # Multi-stage (§10.2)
│  │  └─ package.json
│  └─ web/                                  # Frontend Next.js 15 App Router (ADR-03 + ADR-17)
│     ├─ src/
│     │  ├─ middleware.ts                   # Resuelve la cara por host y protege cada route group
│     │  ├─ app/
│     │  │  ├─ layout.tsx                   # Root layout mínimo: fuentes, providers, tokens
│     │  │  ├─ globals.css                  # Design tokens compartidos; cada shell define su piel
│     │  │  ├─ c/[slug]/                    # Catálogo público compartible (SSR, ambas caras)
│     │  │  ├─ (backoffice)/                # CARA A — staff (desktop-first)
│     │  │  │  ├─ layout.tsx                # Shell con sidebar, topbar y breadcrumbs
│     │  │  │  └─ panel/
│     │  │  │     ├─ page.tsx               # Dashboard del negocio
│     │  │  │     ├─ catalogos/             # Listado, versiones, activación
│     │  │  │     ├─ productos/             # Grilla con cursor pagination
│     │  │  │     ├─ ventas/                # Cotizaciones y pedidos
│     │  │  │     ├─ finanzas/              # Panel y gastos
│     │  │  │     ├─ social/                # Generador IA e historial
│     │  │  │     ├─ chat/                  # Bandeja de chat web (F5; WhatsApp va en F3)
│     │  │  │     ├─ usuarios/              # Invitaciones, roles, permisos y sesiones
│     │  │  │     └─ ajustes/               # Org, integraciones, uso de IA
│     │  │  ├─ (tienda)/                    # CARA B — tienda pública (mobile-first, PWA)
│     │  │  │  ├─ layout.tsx                # Shell sin navegación de backoffice
│     │  │  │  ├─ page.tsx                  # Home de la tienda
│     │  │  │  ├─ tienda/                   # Catálogo, búsqueda y filtros
│     │  │  │  └─ checkout/                 # Carrito en 3 pasos (invitado o aud=customer)
│     │  │  ├─ (portal)/                    # CARA B — portal del cliente autenticado
│     │  │  │  ├─ layout.tsx                # Shell de cuenta (móvil)
│     │  │  │  └─ mi-cuenta/
│     │  │  │     ├─ pedidos/               # Historial y seguimiento
│     │  │  │     ├─ cotizaciones/          # Cotizaciones propias
│     │  │  │     ├─ pagos/                 # Pagos y recibos
│     │  │  │     ├─ direcciones/           # Libreta de direcciones
│     │  │  │     └─ perfil/                # Datos, consentimientos y sesiones
│     │  │  └─ (auth)/{login,recuperar}/    # Login staff; magic link cliente en /mi-cuenta/entrar
│     │  ├─ components/
│     │  │  ├─ backoffice/                  # Sidebar, DataTable, KpiCard, PermissionGate
│     │  │  ├─ tienda/                      # ProductCard, CatalogGrid, CartSheet, CheckoutSteps
│     │  │  ├─ portal/                      # OrderTimeline, InvoiceList, AddressForm
│     │  │  └─ ui/                          # shadcn/ui reexportado desde packages/ui
│     │  ├─ lib/                            # api-client por audiencia, socket, indexeddb, money
│     │  ├─ hooks/                          # useCatalog, useSocket, useCursorList, useSession
│     │  └─ providers/                      # QueryClient, Theme, StaffSession, CustomerSession
│     ├─ public/                            # manifest.webmanifest, sw.js, iconos
│     ├─ next.config.ts
│     ├─ Dockerfile
│     └─ package.json
├─ packages/
│  ├─ contracts/                            # Zod + tipos compartidos api↔web (ADR-07 convención 7)
│  │  └─ src/{auth,catalogs,products,sales,payments,finance,ai,social,chat,common}/
│  ├─ ai/                                   # Abstracción de proveedor IA + plantillas (§7)
│  │  └─ src/{providers,prompts,budget,stream}/
│  ├─ ui/                                   # Componentes reutilizables (shadcn/ui base)
│  └─ config/                               # eslint-config, tsconfig base, tailwind preset
├─ docker-compose.yml                       # Infra de desarrollo (§3.3)
├─ infra/
│  ├─ docker/
│  │  └─ docker-compose.prod.yml            # VPS (§10.3)
│  ├─ postgres/init/                        # Extensiones iniciales (pg_trgm, unaccent)
│  ├─ caddy/Caddyfile                       # TLS automático (§10.3)
│  ├─ scripts/{backup.sh,restore.sh,deploy.sh,wait-for.sh}
│  └─ systemd/{vc-backup.service,vc-backup.timer}
├─ tools/
│  ├─ bootstrap.ps1                         # Instala y verifica el entorno (Windows)
│  ├─ bootstrap.sh                          # Equivalente macOS/Linux
│  └─ seed-demo.ts                          # Datos de demo reproducibles
├─ docs/
│  ├─ 00-BRIEF.md … 05-IDEAS.md             # Paquete documental
│  └─ ADR/                                  # ADRs extendidos (si se abren)
├─ .github/workflows/{ci.yml,deploy.yml}    # CI/CD (§10.1)
├─ .env.example                             # Copia de .env sin secretos (§3.2)
├─ turbo.json                               # Pipeline de Turborepo (§3.4)
├─ pnpm-workspace.yaml
├─ package.json                             # Scripts raíz
├─ tsconfig.base.json
├─ .editorconfig
├─ .nvmrc                                   # 22
├─ .prettierrc
├─ eslint.config.js
└─ README.md
```

### 2.2 Propósito de cada paquete

| Ruta | Qué contiene | Qué NO debe contener |
|---|---|---|
| `apps/api` | Reglas de negocio, persistencia, integraciones, colas | Componentes React, lógica de presentación |
| `apps/web` | UI de las dos caras (backoffice y tienda/portal), SSR, PWA, cliente HTTP | Acceso directo a base de datos o lógica de permisos |
| `packages/contracts` | Esquemas Zod, tipos DTO, códigos de error, enums de API | Dependencias de NestJS o Next |
| `packages/ai` | Interfaz `AiProvider`, adaptadores HTTP, plantillas versionadas, cálculo de coste | Acceso a Prisma o al request HTTP de la API |
| `packages/ui` | Botones, tablas, diálogos, formularios base y design tokens | Navegación o shell de una cara concreta, lógica de dominio, fetching |
| `packages/config` | ESLint, tsconfig base, preset de Tailwind | Código ejecutable de producto |
| `infra` | Compose, Caddy, scripts de backup/restore/deploy | Secretos reales (solo referencias a `.env`) |
| `tools` | Scripts de bootstrap y datos de demo | Código importado por apps |
| `docs` | Documentación del paquete y ADRs | Código |

### 2.3 Convenciones de nombres

| Tipo | Convención | Ejemplo |
|---|---|---|
| Archivos TypeScript | `kebab-case` con sufijo de rol | `catalog-import.service.ts` |
| Módulos NestJS | `<recurso>.module.ts` + controller/service/repository | `sales.controller.ts`, `order.repository.ts` |
| DTO de API | `<accion>-<recurso>.dto.ts` | `create-order.dto.ts` |
| Esquemas Zod | `<dominio>.schemas.ts` en `packages/contracts` | `orders.schemas.ts` |
| Componentes React | archivo `kebab-case`, export `PascalCase` | `product-card.tsx` → `ProductCard` |
| Tests unitarios | colocado junto al archivo | `money.spec.ts` |
| Tests de integración | `apps/api/test/<dominio>.e2e-spec.ts` | `catalog-isolation.e2e-spec.ts` |
| Migraciones | `<timestamp>_<verbo>_<objeto>` | `20261102120000_create_catalog_versioning` |
| Ramas | `<tipo>/<fase>-<tema>` | `feat/f1-import-drive` |
| Commits | Conventional Commits | `feat(catalogs): activar versión con auditoría` |
| Tablas BD | `snake_case` plural (`@@map`) | `catalog_versions` |
| Variables de entorno | `SCREAMING_SNAKE_CASE` | `AI_MONTHLY_QUOTA_TOKENS` |
| Documentos | `NN-TEMA.md` en mayúsculas | `04-GUIA-IMPLEMENTACION.md` |
| Route groups web | `(backoffice)`, `(tienda)`, `(portal)` con su propio `layout.tsx` | `app/(backoffice)/panel/usuarios/page.tsx` |
| Audiencia (`aud`) | `staff` o `customer`, nunca intercambiables | `@Audience('customer')`, `sub` del JWT |

### 2.4 Reglas de dependencia entre paquetes

```text
apps/web  →  packages/contracts, packages/ui, packages/config
apps/api  →  packages/contracts, packages/ai, packages/config
packages/ai        →  (solo Node estándar + fetch)
packages/contracts →  solo zod
packages/ui        →  react, tailwind, packages/config
```

Prohibido: `apps/api` importa de `apps/web`, `packages/*` importa de `apps/*`, cualquier
paquete importa Prisma excepto `apps/api`. El incumplimiento se detecta en CI con
`eslint-plugin-boundaries` (§9.4).

## 3. Bootstrap paso a paso

### 3.1 Preparar la raíz del proyecto

`PowerShell 7` (Windows):

```powershell
$VC = "C:\Users\Usuario\Documents\Programación\APLICACIÓN DE VENTAS MULTICATÁLOGO CON IA"
Set-Location $VC
git status
```

`bash` (macOS/Linux):

```bash
export VC="$HOME/proyectos/ventascatalogo"
cd "$VC" && git status
```

Si el repositorio todavía no existe, se crea una vez (esto **no** se repite en cada máquina):

```bash
git clone https://github.com/<organizacion>/ventascatalogo.git
# o, si se parte de cero:
git init -b main && git add . && git commit -m "chore: bootstrap del monorepo"
```

Instalar dependencias desde la raíz (respeta `pnpm-lock.yaml`):

```bash
pnpm install
```

En la primera instalación de una máquina limpia, `pnpm install` sin `--frozen-lockfile`;
en CI y en cualquier máquina con lockfile existente, `pnpm install --frozen-lockfile`.

### 3.2 Variables de entorno

Se usan **dos** archivos:

- `.env` en la raíz: lo lee Docker Compose y lo lee la API en desarrollo
  (`envFilePath: ['.env', '../../.env']`).
- `apps/web/.env.local`: solo variables `NEXT_PUBLIC_*` del frontend (Next.js no lee el
  `.env` de la raíz).

Crear la copia base y completar los secretos:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

`PowerShell 7` equivalente:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

#### 3.2.1 Tabla completa de variables

| Variable | Ejemplo (dev) | Obligatoria | Descripción | Dónde se obtiene |
|---|---|---|---|---|
| `POSTGRES_USER` | `vc` | Sí (compose) | Usuario de Postgres | Se define aquí |
| `POSTGRES_PASSWORD` | `vc_dev_password` | Sí (compose) | Contraseña de Postgres (solo dev) | Se define aquí |
| `POSTGRES_DB` | `ventascatalogo` | Sí (compose) | Nombre de la base | Se define aquí |
| `MINIO_ROOT_USER` | `minioadmin` | Sí (compose) | Usuario root de MinIO | Se define aquí |
| `MINIO_ROOT_PASSWORD` | `minioadmin` | Sí (compose) | Contraseña root de MinIO | Se define aquí |
| `NODE_ENV` | `development` | Sí | Entorno de ejecución | Fijo por entorno |
| `API_PORT` | `3001` | Sí | Puerto HTTP de la API | Fijo por convención |
| `API_PREFIX` | `api/v1` | Sí | Prefijo global de rutas | Fijo por convención |
| `API_PUBLIC_URL` | `http://localhost:3001` | Sí | URL pública de la API (links, OAuth) | Fijo por convención |
| `WEB_PUBLIC_URL` | `http://localhost:3000` | Sí | URL pública del frontend | Fijo por convención |
| `CORS_ORIGINS` | `http://localhost:3000,http://app.localhost:3000,http://tienda.localhost:3000` | Sí | Orígenes permitidos, separados por coma | Fijo por convención |
| `DATABASE_URL` | `postgresql://vc:vc_dev_password@localhost:5432/ventascatalogo?schema=public` | Sí | Conexión Prisma | Compose local / proveedor en prod |
| `REDIS_URL` | `redis://localhost:6379` | Sí | Conexión Redis/BullMQ | Compose local / proveedor en prod |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` | Sí | Firma de access tokens | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` | Sí | Firma de refresh tokens | `openssl rand -base64 48` |
| `JWT_ACCESS_TTL` | `15m` | Sí | Vida del access token | Fijo por política |
| `JWT_REFRESH_TTL` | `30d` | Sí | Vida del refresh token de cliente (legado) | Fijo por política |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` | Sí | Cifra refresh tokens de Google y secretos MFA en reposo (AES-256-GCM) | `openssl rand -base64 32` |
| `AUTH_STAFF_AUDIENCE` | `staff` | Sí | `aud` de los tokens de backoffice (ADR-17) | Fijo por convención |
| `AUTH_CUSTOMER_AUDIENCE` | `customer` | Sí | `aud` de los tokens de tienda/portal | Fijo por convención |
| `STAFF_REFRESH_TTL` | `7d` | Sí | Vida del refresh de staff | Fijo por política |
| `CUSTOMER_REFRESH_TTL` | `30d` | Sí | Vida del refresh de cliente | Fijo por política |
| `MAGIC_LINK_TTL` | `20m` | Sí | Validez del magic link de cliente | Fijo por política |
| `MFA_ISSUER` | `VentasCatálogo` | Sí | Emisor TOTP (`otpauth://`) | Fijo por producto |
| `AUTH_COOKIE_DOMAIN` | *(vacío en dev)* / `.ventascatalogo.com` | No | Dominio de cookies; vacío = host-only por cara | Dominio de producción |
| `AUTH_LOGIN_MAX_ATTEMPTS` | `5` | No | Intentos fallidos antes de bloqueo temporal | Fijo por política |
| `AUTH_LOGIN_LOCK_MINUTES` | `15` | No | Duración del bloqueo | Fijo por política |
| `LOG_LEVEL` | `debug` | No | Nivel de pino (`debug` en dev, `info` en prod) | Fijo por entorno |
| `RATE_LIMIT_WINDOW_MS` | `60000` | No | Ventana de rate limit | Fijo por política |
| `RATE_LIMIT_MAX` | `120` | No | Peticiones por ventana e IP | Fijo por política |
| `MINIO_ENDPOINT` | `localhost` | Sí | Host de MinIO | Compose local |
| `MINIO_PORT` | `9000` | Sí | Puerto S3 de MinIO | Compose local |
| `MINIO_USE_SSL` | `false` | Sí | TLS hacia MinIO | `true` en prod con TLS |
| `MINIO_ACCESS_KEY` | `minioadmin` | Sí | Access key S3 | `MINIO_ROOT_USER` en dev |
| `MINIO_SECRET_KEY` | `minioadmin` | Sí | Secret key S3 | `MINIO_ROOT_PASSWORD` en dev |
| `MINIO_BUCKET_PRODUCTS` | `vc-products` | Sí | Imágenes de producto | Se define aquí |
| `MINIO_BUCKET_DOCS` | `vc-docs` | Sí | PDFs, comprobantes, snapshots de importación | Se define aquí |
| `MINIO_BUCKET_PUBLIC` | `vc-public` | Sí | Imágenes de catálogo público | Se define aquí |
| `MINIO_PRESIGN_TTL` | `900` | No | Segundos de validez de URL firmada | Fijo por política |
| `DOMAIN` | `ventascatalogo.com` | Prod | Dominio raíz para Caddy y hosts `app.`/`tienda.`/`api.` | Registrador/DNS |
| `GITHUB_REPOSITORY` | `<organizacion>/ventascatalogo` | Prod | Prefijo de las imágenes en GHCR | GitHub → repo |
| `IMAGE_TAG` | `v1.0.0` | Prod | Tag inmutable a desplegar | CI o release manual |
| `MINIO_IMAGE` | `minio/minio:latest` (fijar digest en prod) | Prod | Imagen fijada de MinIO | min.io |
| `GOOGLE_CLIENT_ID` | `<id>.apps.googleusercontent.com` | Fase F1 | Cliente OAuth de Drive | Google Cloud Console → Credenciales |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-...` | Fase F1 | Secreto OAuth | Google Cloud Console → Credenciales |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3001/api/v1/integrations/google/callback` | Fase F1 | Callback registrado | Debe coincidir con Google Console |
| `GOOGLE_SCOPES` | `https://www.googleapis.com/auth/drive.readonly,openid,email,profile` | Fase F1 | Scopes mínimos (solo lectura) | Fijo por diseño (§8.1) |
| `AI_PROVIDER` | `deepseek` | Fase F3 | Proveedor por defecto | Fijo por ADR-11 |
| `DEEPSEEK_API_KEY` | `sk-...` | Fase F3 | API key de DeepSeek | platform.deepseek.com → API keys |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com/v1` | Fase F3 | Endpoint compatible OpenAI | Documentación de DeepSeek |
| `AI_MODEL_DEFAULT` | `deepseek-chat` | Fase F3 | Modelo económico por defecto | Catálogo de modelos |
| `AI_MODEL_REASONER` | `deepseek-reasoner` | No | Modelo de razonamiento (calendarios) | Catálogo de modelos |
| `AI_TIMEOUT_MS` | `45000` | No | Timeout por llamada | Fijo por política |
| `AI_MAX_RETRIES` | `3` | No | Reintentos con backoff | Fijo por política |
| `AI_MAX_OUTPUT_TOKENS` | `1200` | No | Tope de salida por generación | Fijo por presupuesto |
| `AI_MONTHLY_QUOTA_TOKENS` | `2000000` | Sí | Cuota por defecto por organización | Fijo por presupuesto |
| `AI_USD_PER_1K_INPUT` | `0.00027` | Sí | Precio de entrada (USD/1K tokens) | Tarifa vigente del proveedor |
| `AI_USD_PER_1K_OUTPUT` | `0.0011` | Sí | Precio de salida (USD/1K tokens) | Tarifa vigente del proveedor |
| `AI_CACHE_TTL_SECONDS` | `86400` | No | Vida de la caché de generaciones | Fijo por política |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Fase F2 | API key de Stripe | Dashboard Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Fase F2 | Secreto de firma de webhook | `stripe listen` o Dashboard → Webhooks |
| `MERCADOPAGO_ACCESS_TOKEN` | `TEST-...` | Fase F2 | Access token de MercadoPago | Panel de desarrolladores |
| `MERCADOPAGO_WEBHOOK_SECRET` | `...` | Fase F2 | Secreto de firma | Panel de desarrolladores → Webhooks |
| `PAYPAL_CLIENT_ID` | `AX...` | Fase F2 | Client ID de PayPal | developer.paypal.com |
| `PAYPAL_CLIENT_SECRET` | `EL...` | Fase F2 | Client Secret | developer.paypal.com |
| `PAYPAL_WEBHOOK_ID` | `WH-...` | Fase F2 | ID de webhook para verificar firma | developer.paypal.com → Webhooks |
| `PAYMENTS_RETURN_URL` | `http://localhost:3000/pago/gracias` | Fase F2 | Retorno tras pagar | Fijo por convención |
| `PAYMENTS_DEFAULT_PROVIDER` | `stripe` | Fase F2 | Pasarela por defecto por org | Fijo por configuración |
| `WHATSAPP_ACCESS_TOKEN` | `EAAG...` | Fase F3 | Token de Cloud API | Meta for Developers |
| `WHATSAPP_PHONE_NUMBER_ID` | `1234567890` | Fase F3 | ID del número emisor | Meta for Developers |
| `WHATSAPP_WABA_ID` | `9876543210` | Fase F3 | ID de la cuenta Business | Meta for Developers |
| `WHATSAPP_VERIFY_TOKEN` | `cadena-aleatoria` | Fase F3 | Verificación del webhook GET | Se define aquí |
| `WHATSAPP_APP_SECRET` | `...` | Fase F3 | Firma `X-Hub-Signature-256` | Meta for Developers → App settings |
| `EMAIL_PROVIDER` | `smtp` | Sí | `smtp` (Mailpit dev) o `resend` (prod) | Fijo por entorno |
| `SMTP_HOST` | `localhost` | Sí (smtp) | Host SMTP | Mailpit local |
| `SMTP_PORT` | `1025` | Sí (smtp) | Puerto SMTP | Mailpit local |
| `SMTP_USER` | *(vacío)* | No | Usuario SMTP | Proveedor de correo |
| `SMTP_PASS` | *(vacío)* | No | Contraseña SMTP | Proveedor de correo |
| `EMAIL_FROM` | `VentasCatálogo <no-reply@ventascatalogo.local>` | Sí | Remitente | Se define aquí |
| `RESEND_API_KEY` | `re_...` | Prod | API key de Resend | resend.com → API keys |
| `SENTRY_DSN_API` | *(vacío en dev)* | No | DSN de Sentry backend | sentry.io → Proyecto API |
| `SENTRY_ENVIRONMENT` | `development` | No | Nombre del entorno en Sentry | Fijo por entorno |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | No | Muestreo de trazas | Fijo por política |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | Sí | Base de la API para el navegador | Fijo por convención |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:3001` | Sí | URL de Socket.IO | Fijo por convención |
| `NEXT_PUBLIC_STAFF_URL` | `http://app.localhost:3000` | Sí | URL de la cara backoffice | Fijo por convención |
| `NEXT_PUBLIC_TIENDA_URL` | `http://tienda.localhost:3000` | Sí | URL de la tienda y portal | Fijo por convención |
| `NEXT_PUBLIC_APP_NAME` | `VentasCatálogo` | No | Nombre visible en la UI | Fijo por producto |
| `NEXT_PUBLIC_SENTRY_DSN` | *(vacío en dev)* | No | DSN de Sentry web | sentry.io → Proyecto web |
| `NEXT_PUBLIC_DEFAULT_CURRENCY` | `CRC` | No | Moneda por defecto de la UI | Fijo por mercado |
| `NEXT_PUBLIC_TZ` | `America/Costa_Rica` | No | Zona horaria de presentación | Fijo por mercado |
| `SEED_STAFF_EMAIL` | `admin@ventascatalogo.local` | No | Email del admin demo | `.env.seed.example` |
| `SEED_STAFF_PASSWORD` | `Demo1234!` | No | Contraseña del admin demo (solo dev) | `.env.seed.example` |
| `SEED_CUSTOMER_EMAIL` | `cliente@ventascatalogo.local` | No | Email del cliente demo | `.env.seed.example` |
| `SEED_CUSTOMER_PASSWORD` | `Demo1234!` | No | Contraseña del cliente demo (solo dev) | `.env.seed.example` |
| `SEED_DUAL_EMAIL` | `mixto@ventascatalogo.local` | No | Usuario staff en org A / cliente en org B | `.env.seed.example` |
| `SEED_DUAL_PASSWORD` | `Demo1234!` | No | Contraseña del usuario mixto (solo dev) | `.env.seed.example` |

#### 3.2.2 `.env` de la raíz (contenido completo de ejemplo)

```dotenv
# ── Infraestructura local (docker compose) ─────────────────────────────
POSTGRES_USER=vc
POSTGRES_PASSWORD=vc_dev_password
POSTGRES_DB=ventascatalogo
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin

# ── API ────────────────────────────────────────────────────────────────
NODE_ENV=development
API_PORT=3001
API_PREFIX=api/v1
API_PUBLIC_URL=http://localhost:3001
WEB_PUBLIC_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000,http://app.localhost:3000,http://tienda.localhost:3000
DATABASE_URL=postgresql://vc:vc_dev_password@localhost:5432/ventascatalogo?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=CAMBIA_ESTO_openssl_rand_base64_48
JWT_REFRESH_SECRET=CAMBIA_ESTO_openssl_rand_base64_48
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
AUTH_STAFF_AUDIENCE=staff
AUTH_CUSTOMER_AUDIENCE=customer
STAFF_REFRESH_TTL=7d
CUSTOMER_REFRESH_TTL=30d
MAGIC_LINK_TTL=20m
MFA_ISSUER=VentasCatálogo
AUTH_COOKIE_DOMAIN=
AUTH_LOGIN_MAX_ATTEMPTS=5
AUTH_LOGIN_LOCK_MINUTES=15
ENCRYPTION_KEY=CAMBIA_ESTO_openssl_rand_base64_32
LOG_LEVEL=debug
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# ── Almacenamiento (MinIO) ─────────────────────────────────────────────
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_PRODUCTS=vc-products
MINIO_BUCKET_DOCS=vc-docs
MINIO_BUCKET_PUBLIC=vc-public
MINIO_PRESIGN_TTL=900

# ── Google Drive (F1) ──────────────────────────────────────────────────
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3001/api/v1/integrations/google/callback
GOOGLE_SCOPES=https://www.googleapis.com/auth/drive.readonly,openid,email,profile

# ── IA (F3) ────────────────────────────────────────────────────────────
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
AI_MODEL_DEFAULT=deepseek-chat
AI_MODEL_REASONER=deepseek-reasoner
AI_TIMEOUT_MS=45000
AI_MAX_RETRIES=3
AI_MAX_OUTPUT_TOKENS=1200
AI_MONTHLY_QUOTA_TOKENS=2000000
AI_USD_PER_1K_INPUT=0.00027
AI_USD_PER_1K_OUTPUT=0.0011
AI_CACHE_TTL_SECONDS=86400

# ── Pagos (F2) ─────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MERCADOPAGO_ACCESS_TOKEN=
MERCADOPAGO_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_WEBHOOK_ID=
PAYMENTS_RETURN_URL=http://localhost:3000/pago/gracias
PAYMENTS_DEFAULT_PROVIDER=stripe

# ── WhatsApp (F3) ──────────────────────────────────────────────────────
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_WABA_ID=
WHATSAPP_VERIFY_TOKEN=cambia-este-token
WHATSAPP_APP_SECRET=

# ── Email ──────────────────────────────────────────────────────────────
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=VentasCatálogo <no-reply@ventascatalogo.local>
RESEND_API_KEY=

# ── Observabilidad ─────────────────────────────────────────────────────
SENTRY_DSN_API=
SENTRY_ENVIRONMENT=development
SENTRY_TRACES_SAMPLE_RATE=0.1
```

`apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
NEXT_PUBLIC_STAFF_URL=http://app.localhost:3000
NEXT_PUBLIC_TIENDA_URL=http://tienda.localhost:3000
NEXT_PUBLIC_APP_NAME=VentasCatálogo
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_DEFAULT_CURRENCY=CRC
NEXT_PUBLIC_TZ=America/Costa_Rica
```

Generar los secretos (una vez por entorno):

`PowerShell 7`:

```powershell
$jwt = [Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

`bash`:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY (32 bytes → AES-256)
```

> `.env`, `apps/web/.env.local` y cualquier `*.local` están en `.gitignore`. El archivo
> versionado es `.env.example`, sin secretos.

### 3.3 Infraestructura local con Docker Compose

Archivo `docker-compose.yml` en la raíz (desarrollo). Incluye PostgreSQL 16, Redis 7,
MinIO y Mailpit con healthchecks, volúmenes persistentes y creación automática de buckets:

```yaml
name: ventascatalogo-dev

services:
  postgres:
    image: postgres:16-alpine
    container_name: vc-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-vc}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-vc_dev_password}
      POSTGRES_DB: ${POSTGRES_DB:-ventascatalogo}
      TZ: UTC
      PGTZ: UTC
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./infra/postgres/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 12
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: vc-redis
    restart: unless-stopped
    command:
      - redis-server
      - --appendonly
      - "yes"
      - --maxmemory
      - 256mb
      - --maxmemory-policy
      - noeviction
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12

  minio:
    image: minio/minio:latest
    container_name: vc-minio
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
      MINIO_BROWSER_REDIRECT_URL: http://localhost:9001
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:latest
    container_name: vc-minio-init
    depends_on:
      minio:
        condition: service_started
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    entrypoint: >
      /bin/sh -c '
      until mc alias set local http://minio:9000 "$$MINIO_ROOT_USER" "$$MINIO_ROOT_PASSWORD"; do
        echo "esperando MinIO"; sleep 2;
      done;
      mc mb --ignore-existing local/vc-products;
      mc mb --ignore-existing local/vc-docs;
      mc mb --ignore-existing local/vc-public;
      mc anonymous set none local/vc-products;
      mc anonymous set none local/vc-docs;
      mc anonymous set download local/vc-public;
      echo "MinIO listo: vc-products, vc-docs, vc-public";
      '
    restart: "no"

  mailpit:
    image: axllent/mailpit:v1.21
    container_name: vc-mailpit
    restart: unless-stopped
    environment:
      MP_MAX_MESSAGES: 500
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres-data:
  redis-data:
  minio-data:
```

> Para producción se fija la imagen de MinIO por digest (`minio/minio@sha256:...`) y se
> protege la consola `9001` detrás de la red privada; en desarrollo `latest` es aceptable.
> El healthcheck de MinIO se omite a propósito: sus imágenes cambian binarios entre
> releases; la disponibilidad la garantiza `minio-init` con reintentos.

Comandos de infraestructura (raíz del monorepo):

```bash
pnpm infra:up      # docker compose up -d
pnpm infra:ps      # docker compose ps
pnpm infra:logs    # docker compose logs -f --tail=100
pnpm infra:down    # docker compose down (conserva volúmenes)
pnpm infra:reset   # docker compose down -v && docker compose up -d (borra datos)
```

### 3.4 Pipeline del monorepo: `pnpm-workspace.yaml`, `turbo.json` y scripts

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

`turbo.json` (Turborepo 2.x):

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "stream",
  "globalDependencies": [".env", "tsconfig.base.json"],
  "globalEnv": ["NODE_ENV"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^build"]
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e": { "cache": false, "dependsOn": ["build"] }
  }
}
```

Scripts de la raíz (`package.json`):

```json
{
  "name": "ventascatalogo",
  "private": true,
  "packageManager": "pnpm@9.15.4",
  "engines": { "node": ">=22.0.0 <23" },
  "scripts": {
    "dev": "turbo run dev --parallel",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "db:generate": "pnpm --filter @ventascatalogo/api prisma:generate",
    "db:migrate": "pnpm --filter @ventascatalogo/api prisma:migrate",
    "db:deploy": "pnpm --filter @ventascatalogo/api prisma:deploy",
    "db:seed": "pnpm --filter @ventascatalogo/api prisma:seed",
    "db:studio": "pnpm --filter @ventascatalogo/api prisma:studio",
    "infra:up": "docker compose up -d",
    "infra:ps": "docker compose ps",
    "infra:logs": "docker compose logs -f --tail=100",
    "infra:down": "docker compose down",
    "infra:reset": "docker compose down -v && docker compose up -d",
    "format": "prettier --write ."
  }
}
```

La API ejecuta Prisma con `dotenv -e ../../.env`, de modo que un único `.env` en la raíz
sirve a API, Compose y CLI:

```json
{
  "scripts": {
    "prisma:generate": "dotenv -e ../../.env -- prisma generate",
    "prisma:migrate": "dotenv -e ../../.env -- prisma migrate dev",
    "prisma:deploy": "dotenv -e ../../.env -- prisma migrate deploy",
    "prisma:seed": "dotenv -e ../../.env -- prisma db seed",
    "prisma:studio": "dotenv -e ../../.env -- prisma studio"
  },
  "prisma": { "seed": "tsx prisma/seed.ts" }
}
```

### 3.5 Base de datos: migraciones y seed

Secuencia desde cero (infra arriba, `.env` completo):

```bash
pnpm db:generate                                   # Prisma Client desde schema.prisma
pnpm --filter @ventascatalogo/api prisma:migrate -- --name init
pnpm db:seed                                       # usuarios, roles, orgs y catálogo demo (§6.4)
```

El seed lee `.env.seed` (versionado como `.env.seed.example`); si no existe, usa las
credenciales de demo documentadas en §6.4. Crea **tres** usuarios: staff, cliente y un
usuario mixto staff en la org A / cliente en la org B, para probar el aislamiento entre caras.

Migraciones posteriores: `pnpm db:migrate -- --name <verbo_objeto>` y luego
`pnpm db:seed` solo si el seed es idempotente (lo es: usa upsert por clave natural).
En CI y producción se invoca Prisma directo con las variables del entorno
(`prisma migrate deploy`), **nunca** `migrate dev`; ver §10.4.

Verificar que las tablas existen:

```bash
docker compose exec postgres psql -U vc -d ventascatalogo -c "\dt"
docker compose exec postgres psql -U vc -d ventascatalogo -c "select count(*) from products;"
```

### 3.6 Arranque y verificación de punta a punta

1. Levantar infraestructura y esperar `healthy`:

   ```bash
   pnpm infra:up
   docker compose ps
   ```

   Verificar los tres servicios y las URLs:

   | Servicio | URL local | Credenciales |
   |---|---|---|
   | Backoffice (cara A) | http://app.localhost:3000 | `admin@ventascatalogo.local` / `Demo1234!` |
   | Tienda y portal (cara B) | http://tienda.localhost:3000 | `cliente@ventascatalogo.local` / `Demo1234!` |
   | Fallback local | http://localhost:3000 (`/panel`, `/tienda`, `/mi-cuenta`) | — |
   | API (NestJS) | http://localhost:3001/api/v1 | login por email/contraseña |
   | Swagger | http://localhost:3001/api/docs | — |
   | PostgreSQL | `localhost:5432/ventascatalogo` | `vc` / `vc_dev_password` |
   | Redis | `localhost:6379` | sin contraseña en dev |
   | MinIO S3 | http://localhost:9000 | `minioadmin` / `minioadmin` |
   | MinIO Console | http://localhost:9001 | `minioadmin` / `minioadmin` |
   | Mailpit UI | http://localhost:8025 | — (SMTP en `1025`) |

   Los hosts `app.localhost` y `tienda.localhost` resuelven a `127.0.0.1` en navegadores
   modernos; el middleware de la web decide la cara por `Host`. En macOS/Linux, si el
   navegador no los resuelve, agregar al `/etc/hosts`:
   `127.0.0.1 app.localhost tienda.localhost`.

2. Arrancar API y web en paralelo:

   ```bash
   pnpm dev
   ```

3. Verificar salud (API arriba, DB/Redis/MinIO/colas en verde):

   ```bash
   curl http://localhost:3001/api/v1/health
   curl http://localhost:3001/api/v1/health/ready
   ```

   Respuesta esperada de `/health`:

   ```json
   { "status": "ok", "version": "0.1.0", "uptimeSeconds": 24 }
   ```

   Respuesta esperada de `/health/ready` (200 solo si todo responde):

   ```json
   {
     "status": "ok",
     "checks": { "database": "up", "redis": "up", "storage": "up", "queues": "up" }
   }
   ```

4. Verificar autenticación y datos de demo:

   ```bash
   curl -X POST http://localhost:3001/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@ventascatalogo.local","password":"Demo1234!"}'
   ```

   `PowerShell 7` (usar `curl.exe`, no el alias `curl`):

   ```powershell
   curl.exe -X POST http://localhost:3001/api/v1/auth/login `
     -H "Content-Type: application/json" `
     -d '{\"email\":\"admin@ventascatalogo.local\",\"password\":\"Demo1234!\"}'
   ```

5. Abrir http://app.localhost:3000/login y entrar con `admin@ventascatalogo.local` /
   `Demo1234!`: el backoffice muestra el “Catálogo Demo” con 12 productos y el menú de
   usuarios/roles. Luego abrir http://tienda.localhost:3000/mi-cuenta/entrar con
   `cliente@ventascatalogo.local` / `Demo1234!` y comprobar que el portal solo muestra sus
   pedidos. Revisar los correos en http://localhost:8025 y los buckets en http://localhost:9001.

6. Prueba de humo automatizada del entorno:

   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   ```

Si los seis pasos pasan, el entorno está listo para F0. Cualquier fallo se resuelve con la
tabla de §3.7 antes de seguir.

### 3.7 Problemas comunes de instalación

| Síntoma | Causa probable | Solución |
|---|---|---|
| `port is already allocated` | Otro Postgres/Redis local usa el puerto | `docker compose down`; en Windows `Get-NetTCPConnection -LocalPort 5432`; en macOS/Linux `lsof -i :5432` y detener el proceso |
| `pnpm EPERM` en Windows | Antivirus o ruta larga | Excluir el proyecto del antivirus; `git config --system core.longpaths true` |
| `P1001: Can't reach database server` | Contenedor no listo o `DATABASE_URL` mal | `docker compose ps`; esperar `healthy`; revisar usuario/puerto en `.env` |
| `P1012` al migrar | `schema.prisma` inválido o versión de Prisma distinta | `pnpm db:generate`; usar la versión de `pnpm-lock.yaml` |
| Web carga pero API da CORS | `CORS_ORIGINS` no incluye `http://localhost:3000` | Corregir `.env` y reiniciar `pnpm dev` |
| `NoSuchBucket` | `minio-init` no terminó | `docker compose logs minio-init`; recrear con `pnpm infra:reset` |
| `ERR_OSSL_EVP_UNSUPPORTED` | Node distinto de 22 | `nvm use 22` / `fnm use 22`; verificar `.nvmrc` |
| `corepack` no descarga pnpm | Proxy o versión de corepack antigua | `npm install -g pnpm@9.15.4` |
| Redis lleno de memoria | `maxmemory` bajo y colas grandes | Subir `--maxmemory` a `512mb`; revisar colas en §11 |

## 4. Fases de implementación F0–F4

Reglas de trabajo para todas las fases:

- Una rama por tarea numerada (`feat/f1-import-drive`), PR con título Conventional Commits.
- Ninguna tarea se considera terminada sin: test que la cubre, ruta en OpenAPI, error
  documentado, `audit_log` si muta datos y actualización de `docs/03-SPEC.md`.
- El orden de las tareas dentro de una fase es el orden de ejecución.
- Al final de cada fase hay **demo con un usuario real** (con las dos caras: login staff, login
  cliente y flujo invitado→cuenta) y **tag de release** (`v0.X.0`).
- El cronograma base es de **15 semanas**; capacidad, buffer y criterio de recorte están en
  §12.1 y en `docs/02-ANALISIS.md §10.6`. No se prometen 14 semanas sin 2 devs en F1–F3.

### 4.1 F0 — Fundaciones (semanas 1–2)

**Objetivo:** monorepo reproducible, autenticación, multi-org, CI verde y esquema base de
base de datos. Sin F0 no se empieza ninguna feature.

| # | Tarea | Rutas a crear |
|---|---|---|
| F0.1 | Inicializar monorepo, pnpm workspaces, Turborepo, tsconfig base, ESLint 9 y Prettier | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `.nvmrc` |
| F0.2 | Scaffold NestJS con `ConfigModule` validado por Zod (fail-fast) y pino | `apps/api/src/main.ts`, `app.module.ts`, `config/env.schema.ts` |
| F0.3 | Docker Compose dev + `infra/postgres/init/01-extensions.sql` (`pg_trgm`, `unaccent`, `pgcrypto`) | `docker-compose.yml`, `infra/postgres/init/01-extensions.sql` |
| F0.4 | Prisma init + primera migración de identidad y usuarios | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_init_identity_and_users` |
| F0.5 | **Módulo de usuarios**: `User`, `Membership`, `Role`, `Permission`, `RoleAssignment`, `CustomerAccount`, `AuthSession`, `VerificationToken`, `Consent`, `UserInvitation`, `Address`; estados `invited → active → suspended → deleted` | `apps/api/prisma/schema.prisma`, `modules/users/*` |
| F0.6 | **Seed de 8 roles del sistema + permisos atómicos** (`superadmin`, `org_admin`, `catalog_admin`, `vendedor`, `finanzas`, `social_manager`, `agente_chat`, `customer`) y asignación por scope organización/catálogo; 3 usuarios demo (staff, cliente, mixto) | `apps/api/prisma/seed.ts`, `.env.seed.example` |
| F0.7 | **Auth de dos audiencias**: estrategias Passport `staff-jwt` y `customer-jwt`, claim `aud`, cookies separadas por cara, Argon2id, política de contraseña, rate limit de login y bloqueo temporal | `modules/auth/strategies/{staff-jwt,customer-jwt}.strategy.ts`, `modules/auth/auth.service.ts` |
| F0.8 | **Refresh token rotation + detección de reutilización** y revocación de sesiones por dispositivo | `modules/auth/session.service.ts`, `modules/users/sessions.controller.ts` |
| F0.9 | **Invitación de colaborador** con token de un solo uso + email en Mailpit, y aceptación con asignación de rol | `modules/users/invitations/*`, `apps/web/src/app/(auth)/invitacion/[token]/page.tsx` |
| F0.10 | **MFA TOTP** (obligatorio para `org_admin` y `superadmin`), magic link de cliente y recuperación de contraseña | `modules/auth/mfa.service.ts`, `modules/auth/magic-link.service.ts` |
| F0.11 | Guards `JwtAuthGuard` + `AudienceGuard` + `PermissionsGuard` + `CatalogScopeGuard`; evaluación de permisos en servicio; `AUTH_WRONG_AUDIENCE` | `common/guards/*`, `common/decorators/{audience,permissions}.decorator.ts` |
| F0.12 | Health (`/health`, `/health/ready`), filtro global de errores, `traceId`, Swagger | `modules/health/*`, `common/filters/http-exception.filter.ts` |
| F0.13 | GitHub Actions CI (lint, typecheck y test por app, build) y Husky + lint-staged | `.github/workflows/ci.yml`, `.husky/pre-commit` |
| F0.14 | Scaffold Next.js 15 con `middleware.ts` de dos caras, layouts de backoffice, tienda y portal, y login staff | `apps/web/src/middleware.ts`, `(backoffice)/layout.tsx`, `(tienda)/layout.tsx`, `(portal)/layout.tsx`, `(auth)/login/page.tsx` |

**Criterios de verificación**

1. `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` termina en verde
   desde un clon limpio.
2. Login staff en `http://app.localhost:3000` devuelve tokens con `aud=staff`; login cliente en
   `http://tienda.localhost:3000` devuelve `aud=customer`. Un token de cliente en un endpoint de
   backoffice responde `403 AUTH_WRONG_AUDIENCE`.
3. La invitación de un colaborador envía el correo a Mailpit, el token es de un solo uso, expira
   y permite elegir contraseña; al aceptar, el usuario solo ve los catálogos de su scope.
4. Un `org_admin` sin MFA configurado es redirigido a enrolamiento; el segundo login exige TOTP.
5. Revocar una sesión desde el panel de usuarios invalida el refresh token y el siguiente
   `refresh` responde `401 AUTH_SESSION_REVOKED`.
6. `/health/ready` responde 200 con `database`, `redis` y `storage` en `up`; si se detiene
   Redis (`docker compose stop redis`), responde `503` y `redis: down`.
7. La CI tarda menos de 8 minutos y publica el reporte de cobertura de ambas apps.
8. Un dev nuevo ejecuta §3 completo en menos de 30 minutos (se mide en la demo).

**Riesgos:** configuración de Docker en Windows (mitigación: WSL2 + `tools/bootstrap.ps1`);
complejidad del módulo de usuarios (mitigación: entidades mínimas de ADR-18 y permisos
atómicos desde el día 1); escalado de privilegios entre caras (mitigación: `AudienceGuard`
+ `PermissionsGuard` + pruebas de autorización); deriva entre entorno local y CI
(mitigación: mismo `node`/`pnpm` fijados por `.nvmrc` y `packageManager`).

**DoD:** tag `v0.1.0`; `docs/03-SPEC.md` con RF de usuarios, roles, auth por audiencia y
orgs; seed con 8 roles y 3 usuarios demo; 0 secretos en el repo; CI obligatoria en PR;
demo de las dos caras (login staff y login cliente) con el usuario piloto.

### 4.2 F1 — Catálogo, importación y ventas (semanas 3–6)

**Objetivo:** importar una carpeta de Drive, versionar el catálogo, vender cotizaciones y
pedidos con PDF, y publicar un catálogo compartible con PWA de lectura offline.

| # | Tarea | Rutas a crear |
|---|---|---|
| F1.1 | OAuth Google (scopes mínimos, `access_type=offline`), refresh token cifrado AES-256-GCM | `modules/catalogs/integrations/google-oauth.service.ts`, `common/utils/crypto.ts` |
| F1.2 | Cliente Drive (listar carpetas, exportar Sheets, descargar binarios) con reintentos y cuotas | `modules/catalogs/integrations/drive.client.ts` |
| F1.3 | Modelo de versionado y máquina de estados `draft → validated → active → archived` | `modules/catalogs/versions/catalog-version.service.ts` |
| F1.4 | Pipeline de importación: descarga → checksum → snapshot en MinIO → parseo → normalización → validación → cuarentena | `modules/catalogs/import/import.processor.ts`, `parsers/{sheets,xlsx,csv,pdf}.parser.ts` |
| F1.5 | Mapeo visual de columnas (endpoint + UI) y validaciones de integridad | `modules/catalogs/import/column-mapping.service.ts`, `apps/web/src/app/(backoffice)/catalogos/[id]/mapeo/page.tsx` |
| F1.6 | Productos: listado por versión activa con cursor pagination, búsqueda y filtros | `modules/products/*`, `packages/contracts/src/products/` |
| F1.7 | Cotizaciones y pedidos con dinero en enteros, numeración por org e historial de precios | `modules/sales/{quotes,orders}/*` |
| F1.8 | PDF de cotización/recibo server-side y almacenamiento en `vc-docs` | `modules/sales/pdf/quote-pdf.service.ts` |
| F1.9 | Catálogo público `/c/[slug]` con SSR, token revocable e imágenes firmadas desde `vc-public` | `apps/web/src/app/c/[slug]/page.tsx`, `modules/catalogs/public-catalog.controller.ts` |
| F1.10 | **Tienda (cara B)**: home, listado, búsqueda, carrito y checkout de invitado con enlace firmado | `apps/web/src/app/(tienda)/*`, `modules/sales/storefront/*` |
| F1.11 | **Auth de cliente**: registro, magic link, Google y reclamo de cuenta después del checkout | `modules/auth/magic-link.service.ts`, `apps/web/src/app/(portal)/mi-cuenta/entrar/page.tsx` |
| F1.12 | **Portal del cliente (esqueleto)**: pedidos y cotizaciones propias con filtro `customer_id` en repositorio | `apps/web/src/app/(portal)/mi-cuenta/{pedidos,cotizaciones}/page.tsx`, `modules/sales/customer-orders.repository.ts` |
| F1.13 | PWA instalable de tienda/portal: manifest, service worker e IndexedDB del catálogo activo (solo lectura) | `apps/web/public/{manifest.webmanifest,sw.js}`, `apps/web/src/lib/offline-db.ts` |

**Criterios de verificación**

1. Importar el fixture `tools/fixtures/catalogo-demo.xlsx` (40 filas, 3 SKU duplicados,
   2 precios vacíos) crea una versión `validated` con 37 productos y 5 filas en cuarentena
   con códigos `DUPLICATE_SKU` y `MISSING_PRICE`.
2. Importar dos veces el mismo archivo (mismo SHA-256) devuelve la versión existente y no
   duplica productos (`IDEMPOTENT_IMPORT`).
3. Activar la versión 2 no altera las cotizaciones de la versión 1: el histórico conserva
   `catalog_version_id` y los precios originales.
4. `GET /api/v1/products?limit=20&cursor=...` devuelve `nextCursor` y nunca mezcla versiones.
5. Un usuario de otra organización recibe `404 CATALOG_NOT_FOUND` (no `403`): no se filtra
   la existencia de recursos ajenos.
6. El PDF generado abre correctamente, muestra totales con IVA 13 % y se descarga desde una
   URL firmada de MinIO.
7. Desconectar la red y recargar `/c/[slug]` muestra el catálogo cacheado en IndexedDB.
8. Un visitante navega la tienda sin login, agrega productos y completa el checkout como
   invitado con un enlace firmado de un solo uso (R11).
9. Al reclamar la cuenta, el cliente ve su pedido en `/mi-cuenta/pedidos` y recibe
   `403 AUTH_WRONG_AUDIENCE` al llamar a cualquier endpoint de backoffice.
10. Un usuario `aud=staff` recibe `403 AUTH_WRONG_AUDIENCE` en carrito y checkout (R8).

**Riesgos:** catálogos sucios (mitigación: cuarentena y reintento manual); PDFs escaneados
sin OCR (mitigación: marcar `UNSUPPORTED_PDF` y pedir Excel/CSV); imágenes de Drive lentas
(mitigación: copia asíncrona a MinIO con cola `catalog.import`); permisos OAuth revocados
(mitigación: reconexión guiada en ajustes).

**DoD:** tag `v0.2.0`; cobertura ≥ 70 % en `catalogs` y `sales`; E2E de importar→activar→
cotizar→PDF; prueba de aislamiento entre dos organizaciones en CI; demo con un catálogo real
del usuario piloto y **dos caras**: cotización/PDF en backoffice y compra como invitado en
`tienda.`

### 4.3 F2 — Dinero: pagos, finanzas y reportes (semanas 7–9)

**Objetivo:** cobrar por link y webhook, registrar pagos totales/parciales, controlar gastos
y responder con reportes exportables.

| # | Tarea | Rutas a crear |
|---|---|---|
| F2.1 | Interfaz `PaymentGateway` + registro por proveedor (Stripe, MercadoPago, PayPal) | `modules/payments/gateways/payment-gateway.interface.ts`, `gateways/registry.ts` |
| F2.2 | Generación de link de pago por pedido con expiración y reintento | `modules/payments/payment-links.service.ts` |
| F2.3 | Webhook idempotente: firma por proveedor, `gateway_event_id` único, transacción + outbox | `modules/payments/payments.webhook.controller.ts`, `modules/payments/webhook-event.repository.ts` |
| F2.4 | Registro de pagos totales/parciales, estado del pedido y recibo PDF | `modules/payments/payments.service.ts`, `modules/sales/pdf/receipt-pdf.service.ts` |
| F2.5 | Gastos con comprobante en MinIO y categorías | `modules/finance/expenses/*` |
| F2.6 | Panel financiero: ingresos, egresos, margen bruto/neto, flujo de caja por catálogo | `modules/finance/reports/*`, `apps/web/src/app/(backoffice)/finanzas/page.tsx` |
| F2.7 | Reportes filtrables por catálogo, periodo, vendedor y método de pago | `modules/finance/reports/report-query.service.ts` |
| F2.8 | Exportación CSV en streaming (XLSX con formato y reportes programados → F5, §12.1) | `modules/finance/export/export.service.ts` |
| F2.9 | Recordatorios de cobro por email (Mailpit/Resend) y conciliación programada | `modules/finance/reminders/*`, `modules/queue/jobs/reconcile.job.ts` |
| F2.10 | **Portal del cliente completo**: pedidos, cotizaciones, pagos con recibo descargable, direcciones y perfil (cara B) | `apps/web/src/app/(portal)/mi-cuenta/*`, `modules/customers/portal.controller.ts` |
| F2.11 | Reclamo de cuenta post-checkout, autoservicio de magic link y consentimientos (términos, privacidad, marketing) | `modules/users/account-claim.service.ts`, `modules/users/consents.service.ts` |

**Criterios de verificación**

1. `stripe listen --forward-to localhost:3001/api/v1/payments/webhook/stripe` y pagar una
   sesión de prueba: el pedido pasa a `paid`, se crea un `Payment` y un recibo.
2. Reenviar el mismo evento dos veces produce **un solo** `Payment`; la segunda respuesta es
   `200` con `{ "duplicate": true }`.
3. Firma inválida responde `401 PAYMENT_SIGNATURE_INVALID` y no muta datos.
4. Pago parcial (`50 %`) deja `balanceMinor` correcto; el total pagado coincide con la suma
   exacta de pagos en centavos.
5. El reporte mensual del catálogo A no incluye gastos ni pagos del catálogo B.
6. El export CSV abre en Excel/LibreOffice con acentos correctos (UTF-8 con BOM); el XLSX
   con formato queda para F5 (§12.1).
7. `pnpm test` cubre redondeo de IVA y totales con enteros en ambos sentidos (CRC/USD).
8. El cliente descarga el recibo desde `/mi-cuenta/pagos` con URL firmada y el staff ve el
   mismo pago en el backoffice, sin acceso cruzado a otros clientes (R9).
9. Un cliente de la org A que intenta ver un pedido de la org B recibe `404` (no `403`).

**Riesgos:** webhooks perdidos (mitigación: reconciliación cada 15 min + `gateway_event_id`);
diferencias de redondeo (mitigación: IVA calculado por línea y total recalculado); proveedores
sin sandbox estable (mitigación: adaptador mock en tests).

**DoD:** tag `v0.3.0`; conciliación documentada en §11.6; ningún endpoint de pago sin
idempotencia; prueba de webhook duplicado en CI; demo de **dos caras** con cobro real en modo
test: el cliente reclama cuenta, paga y descarga recibo; el staff concilia el mismo pago.

### 4.4 F3 — IA social y WhatsApp (semanas 10–12); chat en vivo → F5

**Objetivo:** generar contenido multicanal con coste medido y cuotas, y operar WhatsApp con
plantillas aprobadas. El chat en vivo (M6) sigue siendo requisito del brief, pero se entrega
en F5 según la decisión de capacidad de §12.1; su spec y contrato quedan congelados aquí.

| # | Tarea | Rutas a crear |
|---|---|---|
| F3.1 | Contrato `AiProvider` + adaptador DeepSeek (streaming SSE, timeouts, reintentos) y fallback | `packages/ai/src/providers/*`, `apps/api/src/modules/ai/ai.service.ts` |
| F3.2 | Plantillas de prompt versionadas (`prompt_version`) y registro en BD | `packages/ai/src/prompts/*.ts`, `modules/ai/prompt-registry.service.ts` |
| F3.3 | Cuotas, caché por hash y `AiUsageLedger` con coste en micro-USD | `modules/ai/{quota.service,cache.service,usage-ledger.service}.ts` |
| F3.4 | Generación de posts (stream), historial, edición y aprobación | `modules/social/*`, `apps/web/src/app/(backoffice)/social/page.tsx` |
| F3.5 | Calendario masivo (batch) por cola `ai.generate` con límite por lote | `modules/social/calendar.service.ts`, `modules/queue/processors/ai.processor.ts` |
| F3.6 | WhatsApp Cloud API: envío de plantillas aprobadas, ventana de 24 h, webhook con firma e inbound | `modules/messaging/whatsapp/*` |
| F3.7 | Bandeja de mensajería WhatsApp en backoffice e historial vinculado a cliente y pedido | `apps/web/src/app/(backoffice)/panel/mensajes/page.tsx`, `modules/messaging/inbox.service.ts` |
| F3.8 | Plantillas versionadas, reintentos en cola `reminder.send`/`whatsapp.send` y email de respaldo | `modules/messaging/templates/*`, `modules/queue/processors/whatsapp.processor.ts` |
| F3.9 | Coste y uso por organización visibles en ajustes (solo admin) | `modules/admin/usage.controller.ts`, `apps/web/src/app/(backoffice)/ajustes/uso/page.tsx` |
| F3.10 | Congelar contrato REST y evento Socket.IO del chat M6 (spec intacta, sin UI) para su entrega en F5 | `docs/03-SPEC.md` (chat), `packages/contracts/src/chat/` |

**Criterios de verificación**

1. `POST /api/v1/social/generate` con `Idempotency-Key` devuelve un post con título, cuerpo,
   hashtags y CTA; repetir con la misma clave devuelve la misma respuesta sin llamar al LLM.
2. La misma petición dos veces en 24 h con la misma entrada responde desde caché
   (`cacheHit: true`) y el ledger registra coste 0.
3. Con cuota agotada responde `429 AI_QUOTA_EXCEEDED` y no llama al proveedor.
4. El streaming llega por SSE (`text/event-stream`) con eventos `token`, `usage`, `done`.
5. Un webhook de WhatsApp con firma inválida responde `401`; con firma válida se encola y
   aparece en la bandeja con el cliente y el pedido vinculados.
6. Fuera de la ventana de 24 h solo se permiten plantillas aprobadas; si falta la plantilla,
   responde `WHATSAPP_TEMPLATE_REQUIRED` y se encola el email de respaldo.
7. El panel de uso muestra tokens y coste por organización y coincide con la suma del ledger.

**Riesgos:** coste descontrolado (mitigación: cuota por org, tope por generación y caché);
bloqueo de plantillas de WhatsApp (mitigación: email de respaldo y plantillas versionadas);
prompts que alucinan precios (mitigación: precios inyectados desde la versión activa y
validados en el post); chat diferido a F5 (mitigación: contrato congelado en F3 y pruebas de
contrato para no descubrir el diseño tarde).

**DoD:** tag `v0.4.0`; pruebas de cuota y caché en CI; `AiUsageLedger` consultable por org;
runbook de cuota agotada en §11.6; demo de **dos caras**: staff genera 3 posts para Instagram y
el cliente recibe un WhatsApp con plantilla en sandbox; spec de chat congelada para F5.

### 4.5 F4 — Endurecimiento, E2E de dos caras y despliegue (semanas 13–15)

**Objetivo:** cerrar seguridad, observabilidad, backups y despliegue; demostrar que el
sistema aguanta uso real. La semana 15 es **buffer de cierre**: se consume solo si hay desvío
y se devuelve al plan si no lo hay.

| # | Tarea | Rutas a crear |
|---|---|---|
| F4.1 | Matriz RBAC completa por rol y scope + tests de autorización | `test/rbac.e2e-spec.ts`, `common/guards/*` |
| F4.2 | Auditoría de todas las mutaciones sensibles y visor de auditoría | `modules/audit/*`, `apps/web/src/app/(backoffice)/ajustes/auditoria/page.tsx` |
| F4.3 | Rate limit por IP y por organización, Helmet, CSP, cookies seguras | `apps/api/src/main.ts`, `modules/orgs/rate-limit.guard.ts` |
| F4.4 | Observabilidad: pino estructurado, Sentry API/web, métricas de negocio y de IA | `apps/api/src/observability/*`, `apps/web/src/instrumentation.ts` |
| F4.5 | E2E Playwright de las dos caras (proyectos `backoffice` y `tienda`): login, invitar, importar, vender, cobrar, comprar como cliente, reclamar cuenta | `apps/web/e2e/{backoffice,tienda}/*.spec.ts` |
| F4.6 | Prueba de carga (k6, 50 usuarios concurrentes, 10 min) y ajuste de índices | `tools/load/api-smoke.js`, migración de índices |
| F4.7 | Compose de producción, Caddy con TLS, backups y restauración ensayada | `infra/docker/docker-compose.prod.yml`, `infra/caddy/Caddyfile`, `infra/scripts/*.sh` |
| F4.8 | Checklist de seguridad y de producción firmado; documentación final | `docs/04-GUIA-IMPLEMENTACION.md §10.7`, `docs/03-SPEC.md` |
| F4.9 | **Soporte de accesos**: reenviar verificación/invitación, desbloquear cuenta, revocar sesiones y baja/anonimización de datos (Ley 8968) preservando históricos contables | `modules/users/support.service.ts`, `modules/users/anonymize.service.ts`, `apps/web/src/app/(backoffice)/panel/usuarios/soporte/page.tsx` |
| F4.10 | **Semana de buffer y cierre**: deuda priorizada, correcciones de la demo, release `v1.0.0`, alertas probadas y post-mortem | tag `v1.0.0`, `docs/04-GUIA-IMPLEMENTACION.md §10.7` |

**Criterios de verificación**

1. Suite E2E completa en verde contra un entorno limpio (CI y local).
2. `pnpm test` con cobertura global ≥ 70 % (dominio) y 0 tests omitidos sin justificación.
3. Prueba de restauración: `pg_dump` + `mc mirror` → restaurar en un VPS de staging y validar
   login, productos y pagos (documentar tiempo de restauración).
4. k6 con 50 VU: p95 < 400 ms en `GET /products` y p95 < 800 ms en `POST /orders`; 0 % errores 5xx.
5. Sentry recibe un error provocado y pino incluye `traceId` correlacionado.
6. Escaneo de dependencias sin vulnerabilidades críticas (`pnpm audit --prod`).
7. Checklist §10.7 completo y demo final de **las dos caras** con el usuario piloto y datos
   reales: login staff, login cliente, compra como invitado, reclamo de cuenta y consulta del
   pedido en `/mi-cuenta`.
8. El buffer de la semana 15 se devuelve si no hizo falta: el release `v1.0.0` se etiqueta a
   más tardar el viernes de la semana 15.

**Riesgos:** deuda acumulada de tests (mitigación: gates desde F0); migraciones destructivas
(mitigación: expandir/contraer y backup previo); TLS/DNS mal configurado (mitigación: staging
primero); bus factor (mitigación: runbooks §11 y este documento); desvío de cronograma
(mitigación: buffer de la semana 15 y criterio de recorte de §12.1).

**DoD:** tag `v1.0.0`; despliegue en VPS con TLS en `app.`, `tienda.` y `api.`, backups diarios
verificados y alertas activas; demo final de las dos caras con flujo invitado→cuenta;
post-mortem de la demo; backlog F5 alimentado por `docs/05-IDEAS.md` y por los ítems
diferidos (chat M6, exportación XLSX y reparación de imágenes, §12.1).

## 5. Patrones de código obligatorios

Reglas que aplican a cada fragmento de esta sección:

- El controlador **no** contiene lógica: valida DTO, resuelve scope y delega.
- El repositorio es el único que toca Prisma; devuelve modelos de dominio, no entidades Prisma.
- El servicio vuelve a comprobar `organizationId`/`catalogId` aunque el guard ya lo hizo
  (convención 8 de `docs/01-CONTEXTO-Y-DECISIONES.md §4`).
- Todo import usa rutas absolutas del workspace (`@ventascatalogo/contracts`), nunca `../../../`.
- Toda ruta declara su **audiencia** (`staff` o `customer`) y su **permiso** atómico; ninguna
  ruta de negocio queda sin `@Audience` y `@RequirePermissions` (R8).

### 5.1 Estructura de un módulo NestJS

```text
apps/api/src/modules/sales/
├─ sales.module.ts
├─ orders.controller.ts
├─ orders.service.ts
├─ orders.repository.ts
├─ dto/
│  ├─ create-order.dto.ts
│  └─ order-response.dto.ts
└─ orders.service.spec.ts
```

```ts
// orders.controller.ts
@Controller('orders')
@UseGuards(JwtAuthGuard, AudienceGuard, PermissionsGuard, CatalogScopeGuard)
@Audience('staff')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @RequirePermissions('order:create')
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() dto: CreateOrderDto, @CatalogScope() scope: CatalogScope) {
    return this.orders.create(dto, scope);
  }

  @Get()
  @RequirePermissions('order:read')
  list(@Query() query: ListOrdersQuery, @CatalogScope() scope: CatalogScope) {
    return this.orders.list(query, scope);
  }
}

// orders.service.ts
@Injectable()
export class OrdersService {
  constructor(
    private readonly repo: OrdersRepository,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateOrderDto, scope: CatalogScope): Promise<OrderResponse> {
    const active = await this.repo.requireActiveVersion(scope.catalogId, scope.organizationId);
    const order = await this.repo.createWithItems(dto, scope, active);
    await this.audit.write({ ...scope, action: 'order.created', entityType: 'order', entityId: order.id });
    return toOrderResponse(order);
  }
}
```

### 5.2 `catalogScope`: resolución de organización, catálogo y versión

El scope viaja en el request y se construye **solo** con datos verificados en base de datos.
El cliente envía `X-Catalog-Id` (obligatorio en rutas de negocio) y opcionalmente
`X-Catalog-Version-Id` (solo para históricos; por defecto se usa la versión activa).

```ts
// common/catalog/catalog-scope.types.ts
export interface CatalogScope {
  organizationId: string;
  catalogId: string;
  catalogVersionId: string;
  userId: string;
  audience: 'staff' | 'customer';
  roleKeys: string[];
  permissions: string[];
}

// common/decorators/catalog-scope.decorator.ts
export const CatalogScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CatalogScope => {
    const req = ctx.switchToHttp().getRequest<{ catalogScope?: CatalogScope }>();
    if (!req.catalogScope) throw new AppException('CATALOG_SCOPE_REQUIRED', 400);
    return req.catalogScope;
  },
);

// common/guards/catalog-scope.guard.ts
@Injectable()
export class CatalogScopeGuard implements CanActivate {
  constructor(private readonly catalogs: CatalogsRepository) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser;
    const catalogId = req.headers['x-catalog-id'] as string | undefined;
    if (!catalogId) throw new AppException('CATALOG_SCOPE_REQUIRED', 400);

    const catalog = await this.catalogs.findForMember(catalogId, user.id);
    if (!catalog) throw new AppException('CATALOG_NOT_FOUND', 404); // no se filtra existencia

    const requestedVersion = req.headers['x-catalog-version-id'] as string | undefined;
    const versionId = requestedVersion ?? catalog.activeVersionId;
    if (!versionId) throw new AppException('CATALOG_VERSION_NOT_ACTIVE', 409);

    req.catalogScope = {
      organizationId: catalog.organizationId,
      catalogId: catalog.id,
      catalogVersionId: versionId,
      userId: user.id,
      audience: user.audience,
      roleKeys: user.roleKeys,
      permissions: user.permissions,
    };
    return true;
  }
}
```

Regla R4: si `requestedVersion` pertenece a una versión `archived`, el servicio de ventas
lanza `CATALOG_ARCHIVED` (409) incluso si el guard resolvió el scope.

### 5.3 Guards de audiencia y permisos (RBAC de ADR-18)

La audiencia se valida primero (R8) y después el permiso atómico. Los permisos se resuelven
desde `RoleAssignment → Role → Permission` al autenticar y viajan en el contexto del request.

```ts
// common/guards/audience.guard.ts
export const Audience = (audience: 'staff' | 'customer') => SetMetadata('audience', audience);

@Injectable()
export class AudienceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const expected = this.reflector.getAllAndOverride<'staff' | 'customer'>('audience', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser;
    if (expected && user.audience !== expected) {
      throw new AppException('AUTH_WRONG_AUDIENCE', 403, { expected, received: user.audience });
    }
    return true;
  }
}

// common/guards/permissions.guard.ts
export const RequirePermissions = (...permissions: string[]) => SetMetadata('permissions', permissions);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>('permissions', [ctx.getHandler(), ctx.getClass()]) ?? [];
    if (required.length === 0) throw new AppException('PERMISSION_UNDECLARED', 500);

    const user = ctx.switchToHttp().getRequest().user as AuthenticatedUser;
    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission) && !granted.has('*'));
    if (missing.length > 0) throw new AppException('FORBIDDEN', 403, { missing });
    return true;
  }
}

// modules/users/permissions.service.ts — permisos según audiencia (R8, R9)
async resolve(userId: string, organizationId: string, audience: 'staff' | 'customer'): Promise<string[]> {
  if (audience === 'customer') {
    const account = await this.prisma.customerAccount.findFirst({
      where: { userId, organizationId, status: 'ACTIVE' },
    });
    if (!account) throw new AppException('FORBIDDEN', 403);
    return ['self:order:read', 'self:quote:read', 'self:payment:read', 'self:profile:write', 'self:chat:write'];
  }

  const assignments = await this.prisma.roleAssignment.findMany({
    where: {
      userId,
      scopeType: { in: ['ORGANIZATION', 'CATALOG'] },
      membership: { organizationId, status: 'ACTIVE' },
    },
    include: { role: { include: { permissions: true } } },
  });
  return [...new Set(assignments.flatMap((a) => a.role.permissions.map((p) => p.key)))];
}
```

El `AuthenticatedUser` del JWT contiene `{ id, audience, organizationId, roleKeys, permissions }`.
El servicio de dominio vuelve a validar con `PermissionsService` en pagos, importación, IA y
usuarios (convención 8). Prueba obligatoria: `test/rbac.e2e-spec.ts` recorre matriz
audiencia × rol × endpoint y verifica 403/200 (T-11 a T-13, §9.2).

### 5.4 Paginación por cursor

El cursor es el `id` UUIDv7 del último elemento (ordenable por tiempo, ADR-10). Nunca se usa
`OFFSET`: con 5 000 SKU y escrituras concurrentes produce páginas inconsistentes.

```ts
// packages/contracts/src/common/pagination.ts
export const cursorPageSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CursorPageQuery = z.infer<typeof cursorPageSchema>;

// products.repository.ts
async listPage(versionId: string, query: CursorPageQuery) {
  const rows = await this.prisma.product.findMany({
    where: {
      catalogVersionId: versionId,
      deletedAt: null,
      ...(query.cursor ? { id: { gt: query.cursor } } : {}),
    },
    orderBy: { id: 'asc' },
    take: query.limit + 1,
    select: { id: true, sku: true, name: true, priceMinor: true, currency: true },
  });

  const hasNext = rows.length > query.limit;
  const page = hasNext ? rows.slice(0, query.limit) : rows;
  return {
    items: page.map((row) => ({ ...row, priceMinor: row.priceMinor.toString() })),
    nextCursor: hasNext ? page[page.length - 1].id : null,
  };
}
```

El contrato de respuesta es siempre `{ items, nextCursor }`; `nextCursor: null` significa fin.

### 5.5 Filtro global de errores y catálogo de códigos

Formato único: `{ code, message, details, traceId }` (convención 5). El catálogo vive en
`packages/contracts/src/common/error-codes.ts` y lo consumen API y web.

```ts
export const ERROR_CODES = [
  'VALIDATION_FAILED', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'HTTP_ERROR',
  'AUTH_WRONG_AUDIENCE', 'AUTH_SESSION_REVOKED', 'AUTH_SESSION_EXPIRED', 'AUTH_INVITATION_EXPIRED',
  'AUTH_MFA_REQUIRED', 'PERMISSION_UNDECLARED',
  'CATALOG_SCOPE_REQUIRED', 'CATALOG_NOT_FOUND', 'CATALOG_ARCHIVED', 'CATALOG_VERSION_NOT_ACTIVE',
  'DUPLICATE_SKU', 'MISSING_PRICE', 'IMPORT_IN_PROGRESS', 'IDEMPOTENT_IMPORT',
  'IMPORT_REJECTED', 'IMPORT_LIMIT_EXCEEDED', 'UNSUPPORTED_PDF',
  'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_IN_PROGRESS', 'IDEMPOTENCY_KEY_REUSED',
  'PAYMENT_SIGNATURE_INVALID', 'PAYMENT_ALREADY_PROCESSED', 'PAYMENT_PROVIDER_UNAVAILABLE',
  'AI_QUOTA_EXCEEDED', 'AI_PROVIDER_ERROR', 'AI_TIMEOUT', 'AI_CONTENT_BLOCKED',
  'WHATSAPP_TEMPLATE_REQUIRED', 'WHATSAPP_WINDOW_CLOSED',
  'INTEGRATION_NOT_CONFIGURED', 'RATE_LIMITED', 'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    status: number,
    public readonly details?: unknown,
  ) {
    super({ code, statusCode: status, details }, status);
  }
}

// common/filters/http-exception.filter.ts
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { traceId?: string }>();
    const traceId = req.traceId ?? randomUUID();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const body = isHttp ? (exception.getResponse() as Record<string, unknown>) : undefined;
    const code = (body?.code as ErrorCode) ?? (status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR');
    const message = status >= 500 ? 'Error interno del servidor' : String(body?.message ?? 'Error');

    if (status >= 500) this.logger.error({ err: exception, traceId }, 'unhandled_exception');
    res.status(status).json({ code, message, details: body?.details ?? null, traceId });
  }
}
```

### 5.6 Prisma: dinero, soft-delete y transacciones con outbox

**Dinero en enteros.** Se define `amountMinor` como `BigInt` y un factor por moneda
(CRC = 1, USD = 100). El JSON de la API serializa `BigInt` como string; nunca se usa `Number`
para sumar.

```ts
// packages/contracts/src/common/money.ts
export type Currency = 'CRC' | 'USD';
export const MINOR_FACTOR: Record<Currency, number> = { CRC: 1, USD: 100 };

export function toMinorAmount(amount: string, currency: Currency): bigint {
  const factor = BigInt(MINOR_FACTOR[currency]);
  const [units, decimals = ''] = amount.replace(',', '.').split('.');
  const normalizedDecimals = decimals.padEnd(currency === 'USD' ? 2 : 0, '0').slice(0, currency === 'USD' ? 2 : 0);
  return BigInt(units) * factor + BigInt(normalizedDecimals || '0');
}

export function formatMoney(amountMinor: bigint, currency: Currency, locale = 'es-CR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    currencyDisplay: 'code', // '₡' no existe en WinAnsi: el PDF también usa código ISO
    minimumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(Number(amountMinor) / MINOR_FACTOR[currency]);
}
```

En `main.ts`, antes de crear la app:

```ts
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function toJSON(this: bigint) {
  return this.toString();
};
```

**Soft-delete (R5).** Extensión de Prisma que filtra `deletedAt` y convierte `delete` en
`update`; el borrado físico solo se hace con un job de retención explícito.

```ts
// apps/api/src/prisma/soft-delete.extension.ts
const SOFT_DELETE_MODELS = new Set([
  'Organization', 'User', 'Catalog', 'CatalogVersion', 'Product',
  'Customer', 'Quote', 'Order', 'Expense', 'SocialPost', 'ChatConversation',
]);

export const softDeleteExtension = Prisma.defineExtension((client) =>
  client.$extends({
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) args.where = { AND: [{ deletedAt: null }, args.where ?? {}] };
          return query(args);
        },
        async delete({ model, args, query }) {
          if (SOFT_DELETE_MODELS.has(model)) {
            const delegate = (client as unknown as Record<string, any>)[model];
            return delegate.update({ where: args.where, data: { deletedAt: new Date() } });
          }
          return query(args);
        },
      },
    },
  }),
);
```

**Transacción + outbox (ADR-13).** El evento se escribe en la misma transacción que el
cambio de negocio; un publicador independiente lo envía a BullMQ o a webhooks.

```ts
// orders.repository.ts
async createWithItems(dto: CreateOrderDto, scope: CatalogScope, active: ActiveVersion) {
  return this.prisma.$transaction(async (tx) => {
    const totals = calculateTotals(dto.items, active.taxRateBp, active.taxIncluded);
    const order = await tx.order.create({
      data: {
        organizationId: scope.organizationId,
        catalogId: scope.catalogId,
        catalogVersionId: scope.catalogVersionId,
        customerId: dto.customerId,
        sellerUserId: scope.userId,
        currency: active.currency,
        status: 'PENDING_PAYMENT',
        subtotalMinor: totals.subtotalMinor,
        discountMinor: totals.discountMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        taxRateBp: active.taxRateBp,
        taxIncluded: active.taxIncluded,
        items: { createMany: { data: dto.items.map(toOrderItemData) } },
      },
      include: { items: true },
    });

    await tx.outboxEvent.create({
      data: {
        aggregateType: 'order',
        aggregateId: order.id,
        eventType: 'order.created',
        payload: { orderId: order.id, organizationId: scope.organizationId, catalogId: scope.catalogId },
      },
    });
    return order;
  });
}
```

```ts
// outbox/outbox.publisher.ts
@Interval(2_000)
async publishPending(): Promise<void> {
  const events = await this.prisma.$queryRaw<OutboxRow[]>`
    SELECT id, event_type, aggregate_id, payload
    FROM outbox_events
    WHERE status = 'PENDING' AND available_at <= now()
    ORDER BY created_at
    LIMIT 50
    FOR UPDATE SKIP LOCKED`;
  for (const event of events) {
    await this.queues.publish(event.event_type, event.payload);
    await this.prisma.outboxEvent.update({
      where: { id: event.id },
      data: { status: 'PUBLISHED', publishedAt: new Date(), attempts: { increment: 1 } },
    });
  }
}
```

### 5.7 Interceptor de idempotencia

`Idempotency-Key` es obligatorio en pagos, generación IA, importación y webhooks
(convención 10). La clave se guarda por organización + endpoint + hash del cuerpo.

```ts
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'] as string | undefined;
    if (!key) throw new AppException('IDEMPOTENCY_KEY_REQUIRED', 400);

    const scope = req.catalogScope as CatalogScope | undefined;
    const organizationId = scope?.organizationId ?? req.user.organizationId;
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = sha256(JSON.stringify(req.body ?? {}));
    const unique = { organizationId, key, scope: endpoint };

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { organizationId_key_scope: unique },
    });
    if (existing?.status === 'COMPLETED') return of(existing.responseBody);
    if (existing?.status === 'IN_PROGRESS') throw new AppException('IDEMPOTENCY_IN_PROGRESS', 409);
    if (existing && existing.requestHash !== requestHash) throw new AppException('IDEMPOTENCY_KEY_REUSED', 409);

    await this.prisma.idempotencyKey.upsert({
      where: { organizationId_key_scope: unique },
      create: { ...unique, requestHash, status: 'IN_PROGRESS', expiresAt: addHours(new Date(), 24) },
      update: { status: 'IN_PROGRESS', requestHash },
    });

    try {
      const result = await lastValueFrom(next.handle());
      await this.prisma.idempotencyKey.update({
        where: { organizationId_key_scope: unique },
        data: { status: 'COMPLETED', responseStatus: 201, responseBody: JSON.parse(JSON.stringify(result)) },
      });
      return of(result);
    } catch (error) {
      await this.prisma.idempotencyKey.update({
        where: { organizationId_key_scope: unique },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }
}
```

### 5.8 Adaptador de IA con streaming y reintentos

La API nunca importa el SDK de un proveedor: usa la interfaz `AiProvider` (ADR-11).

```ts
// packages/ai/src/providers/ai-provider.interface.ts
export interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string }
export interface AiCompletionRequest {
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature: number;
  signal?: AbortSignal;
}
export interface AiUsage { tokensIn: number; tokensOut: number }
export interface AiCompletionResult { text: string; usage: AiUsage; model: string; provider: string }
export interface AiStreamChunk { delta?: string; usage?: Partial<AiUsage> }

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
  stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk>;
}
```

```ts
// packages/ai/src/providers/deepseek.provider.ts
export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek';

  constructor(private readonly cfg: { apiKey: string; baseUrl: string; timeoutMs: number; maxRetries: number }) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const response = await this.fetchWithRetry(request, false);
    const json = await response.json();
    return {
      text: json.choices[0]?.message?.content ?? '',
      usage: { tokensIn: json.usage?.prompt_tokens ?? 0, tokensOut: json.usage?.completion_tokens ?? 0 },
      model: json.model ?? request.model,
      provider: this.name,
    };
  }

  async *stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const response = await this.fetchWithRetry(request, true);
    if (!response.body) throw new AppException('AI_PROVIDER_ERROR', 502);

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        const parsed = JSON.parse(data);
        const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (parsed.usage) yield { usage: { tokensIn: parsed.usage.prompt_tokens, tokensOut: parsed.usage.completion_tokens } };
      }
    }
  }

  private async fetchWithRetry(request: AiCompletionRequest, stream: boolean): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const response = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.cfg.apiKey}` },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            stream,
            stream_options: stream ? { include_usage: true } : undefined,
          }),
          signal: request.signal ?? controller.signal,
        });
        if (response.status === 429 || response.status >= 500) throw new Error(`upstream_${response.status}`);
        if (!response.ok) throw new AppException('AI_PROVIDER_ERROR', 502, { status: response.status });
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === this.cfg.maxRetries) break;
        await sleep(2 ** attempt * 500 + Math.floor(Math.random() * 250));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof AppException ? lastError : new AppException('AI_TIMEOUT', 504);
  }
}
```

El orquestador (`AiService`) selecciona proveedor primario, mide tokens, escribe
`AiUsageLedger` y aplica fallback (§7.6). El controlador hace `@Sse()` y reenvía
`{ delta }` como `event: token`, y al final `event: done` con `usage` y `socialPostId`.

### 5.9 Adaptador de pasarela y verificación de firma de webhook

```ts
// modules/payments/webhooks.controller.ts
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly stripe: StripeGateway,
    private readonly webhooks: WebhookProcessor,
  ) {}

  @Post('webhook/stripe')
  @Public()
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true; duplicate: boolean }> {
    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(req.rawBody!, signature);
    } catch {
      throw new AppException('PAYMENT_SIGNATURE_INVALID', 401);
    }
    return this.webhooks.process({
      provider: 'STRIPE',
      externalEventId: event.id,
      eventType: event.type,
      payload: event,
    });
  }
}
```

Habilitar body crudo en `main.ts` (necesario para la firma):

```ts
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
```

Diferencias por proveedor (implementadas en `WebhookVerifier` de cada gateway):

| Proveedor | Cabecera de firma | Verificación | Secreto |
|---|---|---|---|
| Stripe | `stripe-signature` | HMAC-SHA256 de `timestamp.payload` con tolerancia 300 s | `STRIPE_WEBHOOK_SECRET` |
| MercadoPago | `x-signature` + `x-request-id` | HMAC-SHA256 del manifest `id:...;request-id:...;ts:...` | `MERCADOPAGO_WEBHOOK_SECRET` |
| PayPal | `paypal-transmission-sig` | Verificación vía API de PayPal (certificado) | `PAYPAL_WEBHOOK_ID` |

Idempotencia a nivel de evento: `PaymentWebhookEvent` con `@@unique([provider, externalEventId])`;
si el `INSERT` viola la restricción se responde `{ received: true, duplicate: true }` sin
volver a aplicar el pago.

### 5.10 Colas BullMQ con reintentos, backoff y DLQ

```ts
export const QUEUES = {
  aiGenerate: 'ai.generate',
  catalogImport: 'catalog.import',
  pdfRender: 'pdf.render',
  webhookProcess: 'webhook.process',
  reminderSend: 'reminder.send',
} as const;

@Injectable()
export class QueueService {
  private readonly connection: { url: string };
  readonly deadLetter: Queue;
  private readonly aiQueue: Queue<AiJobData>;

  constructor(private readonly config: ConfigService) {
    this.connection = { url: config.getOrThrow('REDIS_URL') };
    this.deadLetter = new Queue('dead.letter', { connection: this.connection });
    this.aiQueue = new Queue<AiJobData>(QUEUES.aiGenerate, { connection: this.connection });
  }

  enqueueAi(data: AiJobData): Promise<Job<AiJobData>> {
    return this.aiQueue.add('generate-post', data, {
      jobId: data.requestId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: { age: 604_800 },
    });
  }
}

// modules/queue/processors/ai.processor.ts
@Injectable()
export class AiProcessor implements OnModuleInit, OnModuleDestroy {
  private worker?: Worker<AiJobData>;

  constructor(private readonly ai: AiService, private readonly queues: QueueService) {}

  onModuleInit(): void {
    this.worker = new Worker<AiJobData>(
      QUEUES.aiGenerate,
      async (job) => this.ai.generatePost(job.data),
      {
        connection: { url: process.env.REDIS_URL },
        concurrency: 4,
        limiter: { max: 20, duration: 60_000 },
      },
    );
    this.worker.on('failed', async (job, error) => {
      if (!job) return;
      if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await this.queues.deadLetter.add('dead', {
          queue: QUEUES.aiGenerate,
          jobId: job.id,
          name: job.name,
          data: job.data,
          error: error.message,
        });
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
```

Regla: ningún job se descarta en silencio; la DLQ se revisa en el runbook §11.6 y se
reencola con `job.retry()` desde el panel de admin.

### 5.11 Subida a MinIO con URLs firmadas

```ts
@Injectable()
export class StorageService {
  private readonly client: Client;

  constructor(private readonly config: ConfigService) {
    this.client = new Client({
      endPoint: config.getOrThrow('MINIO_ENDPOINT'),
      port: Number(config.getOrThrow('MINIO_PORT')),
      useSSL: config.get('MINIO_USE_SSL') === 'true',
      accessKey: config.getOrThrow('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow('MINIO_SECRET_KEY'),
    });
  }

  async uploadProductImage(catalogId: string, versionId: string, body: Buffer, contentType: string): Promise<string> {
    const checksum = sha256(body);
    const key = `products/${catalogId}/${versionId}/${checksum}.webp`;
    await this.client.putObject(this.config.getOrThrow('MINIO_BUCKET_PRODUCTS'), key, body, body.length, {
      'Content-Type': contentType,
      'X-Amz-Meta-Checksum': checksum,
    });
    return key;
  }

  presignedRead(bucket: string, key: string, ttlSeconds = 900): Promise<string> {
    return this.client.presignedGetObject(bucket, key, ttlSeconds);
  }

  presignedUpload(bucket: string, key: string, ttlSeconds = 900): Promise<string> {
    return this.client.presignedPutObject(bucket, key, ttlSeconds);
  }
}
```

La clave incluye el SHA-256 del contenido: subir dos veces la misma imagen es idempotente y
la URL no cambia. Las imágenes de producto viven en `vc-products` (privado); las del catálogo
público (`vc-public`) se sirven mediante URL firmada de 15 minutos o copia pública controlada.

### 5.12 Socket.IO con adapter Redis y JWT en el handshake

```ts
@WebSocketGateway({ namespace: '/chat', cors: { origin: (process.env.CORS_ORIGINS ?? '').split(',') } })
export class ChatGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer() private readonly server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly chat: ChatService,
    private readonly redis: RedisClients,
  ) {}

  afterInit(server: Server): void {
    const pub = this.redis.createDedicated();
    const sub = this.redis.createDedicated();
    server.adapter(createAdapter(pub, sub));
  }

  async handleConnection(socket: Socket): Promise<void> {
    try {
      const user = await this.auth.verifyAccessToken(String(socket.handshake.auth?.token ?? ''));
      socket.data.userId = user.userId;
      socket.data.organizationId = user.organizationId;
      socket.data.audience = user.audience;
    } catch {
      socket.disconnect(true);
      return;
    }
    await this.chat.touchPresence(socket.data.userId);
  }

  @SubscribeMessage('conversation.join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { conversationId: string }): Promise<void> {
    const allowed = await this.chat.canUserAccess(body.conversationId, socket.data.userId, socket.data.audience);
    if (!allowed) throw new WsException('FORBIDDEN');
    await socket.join(`conversation:${body.conversationId}`);
  }

  @SubscribeMessage('message.send')
  async send(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { conversationId: string; body: string },
  ): Promise<void> {
    const message = await this.chat.sendMessage({
      conversationId: body.conversationId,
      senderUserId: socket.data.userId,
      senderType: 'AGENT',
      body: body.body,
    });
    this.server.to(`conversation:${body.conversationId}`).emit('message.created', message);
  }
}
```

El adapter exige conexiones dedicadas: `createDedicated()` devuelve `new Redis(url)` de
`ioredis` (no se reutiliza el cliente de caché). Si el adapter falla, el gateway cae a una
sola instancia y se registra `realtime_adapter_degraded` en Sentry.

> **Estado en el plan:** el chat en vivo (M6) se entrega en F5. En F0–F4 se congela el
> contrato (eventos `conversation.join`, `message.send`, `message.created`) y se dejan los
> tests de autorización de sala; la UI y la bandeja unificada web llegan en F5. El patrón de
> esta sección es el que se implementa, sin cambios de arquitectura.

### 5.13 PDF de cotización y recibo

```ts
// modules/sales/pdf/quote-pdf.service.ts
export async function renderQuotePdf(model: QuotePdfModel): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText(`Cotización ${model.number}`, { x: 48, y: 790, size: 18, font: bold });
  page.drawText(`${model.organizationName} · ${model.createdAt.toISOString().slice(0, 10)}`, {
    x: 48, y: 770, size: 9, font, color: rgb(0.35, 0.35, 0.35),
  });

  let y = 740;
  for (const item of model.items) {
    page.drawText(`${item.sku} · ${item.name}`.slice(0, 70), { x: 48, y, size: 10, font });
    page.drawText(formatMoney(item.lineTotalMinor, model.currency), { x: 470, y, size: 10, font });
    y -= 16;
  }

  page.drawText(`Total: ${formatMoney(model.totalMinor, model.currency)}`, { x: 380, y: y - 24, size: 12, font: bold });
  return Buffer.from(await pdf.save());
}
```

Se genera siempre en la cola `pdf.render`, se sube a `vc-docs` con clave
`quotes/{quoteId}/{number}.pdf` y se sirve con URL firmada. `formatMoney` usa
`currencyDisplay: 'code'` porque el colón (₡) no está en la codificación WinAnsi.

### 5.14 PWA y caché del catálogo en IndexedDB

`apps/web/public/manifest.webmanifest`:

```json
{
  "name": "VentasCatálogo",
  "short_name": "VentasCat",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

`apps/web/public/sw.js` (solo lectura offline, ADR-14):

```js
const CATALOG_CACHE = 'vc-catalog-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.pathname.startsWith('/c/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CATALOG_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) ?? caches.match('/offline')),
  );
});
```

`apps/web/src/lib/offline-db.ts` con `idb`:

```ts
import { openDB, type DBSchema } from 'idb';

export interface ProductCacheRow {
  id: string;
  catalogVersionId: string;
  sku: string;
  name: string;
  priceMinor: string;
  currency: 'CRC' | 'USD';
  imageUrl: string | null;
}

interface CatalogDB extends DBSchema {
  products: { key: string; value: ProductCacheRow; indexes: { by_version: string } };
  meta: { key: string; value: { key: string; updatedAt: string } };
}

const dbPromise = openDB<CatalogDB>('vc-catalog', 1, {
  upgrade(db) {
    const products = db.createObjectStore('products', { keyPath: 'id' });
    products.createIndex('by_version', 'catalogVersionId');
    db.createObjectStore('meta', { keyPath: 'key' });
  },
});

export async function cacheCatalog(versionId: string, products: ProductCacheRow[]): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(['products', 'meta'], 'readwrite');
  for (const product of products) await tx.objectStore('products').put(product);
  await tx.objectStore('meta').put({ key: `version:${versionId}`, updatedAt: new Date().toISOString() });
  await tx.done;
}

export async function readCachedCatalog(versionId: string): Promise<ProductCacheRow[]> {
  const db = await dbPromise;
  return db.getAllFromIndex('products', 'by_version', versionId);
}
```

El catálogo se sincroniza al abrir `/c/[slug]` con conexión y se marca `updatedAt` en
`meta`; la UI muestra “Catálogo sin conexión · actualizado el …” cuando sirve desde IndexedDB.

### 5.15 Dos audiencias: estrategias Passport, cookies y middleware de cara

Una misma API emite y valida tokens distintos para cada cara. El claim `aud` lo verifica
Passport, no el controlador; la cookie también es distinta para que nunca se mezclen sesiones.
El claim viaja en minúsculas (`staff`/`customer`); la BD guarda `STAFF`/`CUSTOMER` y el mapper
de sesión convierte en el borde.

```ts
// modules/auth/strategies/staff-jwt.strategy.ts
@Injectable()
export class StaffJwtStrategy extends PassportStrategy(Strategy, 'staff-jwt') {
  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.['vc_staff_at'] ?? null]),
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET'),
      audience: config.getOrThrow('AUTH_STAFF_AUDIENCE'),
      issuer: 'ventascatalogo',
    });
  }

  async validate(payload: StaffJwtPayload): Promise<AuthenticatedUser> {
    return this.users.buildContext(payload.sub, payload.org, 'staff');
  }
}

// modules/auth/strategies/customer-jwt.strategy.ts
@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'customer-jwt') {
  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([(req) => req?.cookies?.['vc_customer_at'] ?? null]),
      secretOrKey: config.getOrThrow('JWT_ACCESS_SECRET'),
      audience: config.getOrThrow('AUTH_CUSTOMER_AUDIENCE'),
      issuer: 'ventascatalogo',
    });
  }

  async validate(payload: CustomerJwtPayload): Promise<AuthenticatedUser> {
    return this.users.buildContext(payload.sub, payload.org, 'customer');
  }
}
```

Rotación de refresh con detección de reutilización (una cookie por cara: `vc_staff_rt` /
`vc_customer_rt`):

```ts
// modules/auth/session.service.ts
async rotate(rawRefreshToken: string, audience: 'staff' | 'customer'): Promise<AuthTokens> {
  const tokenHash = sha256(rawRefreshToken);
  const session = await this.prisma.authSession.findUnique({ where: { tokenHash } });
  if (!session || session.audience !== audience) throw new AppException('UNAUTHORIZED', 401);

  if (session.revokedAt) {
    // reutilización de un refresh ya rotado: se revoca toda la familia
    await this.prisma.authSession.updateMany({
      where: { familyId: session.familyId },
      data: { revokedAt: new Date() },
    });
    throw new AppException('AUTH_SESSION_REVOKED', 401);
  }
  if (session.expiresAt < new Date()) throw new AppException('AUTH_SESSION_EXPIRED', 401);

  const next = await this.prisma.$transaction(async (tx) => {
    await tx.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date(), lastUsedAt: new Date() } });
    return tx.authSession.create({
      data: {
        userId: session.userId,
        audience,
        tokenHash: sha256(randomBytes(48).toString('base64url')),
        familyId: session.familyId,
        deviceName: session.deviceName,
        expiresAt: addDuration(new Date(), audience === 'staff' ? '7d' : '30d'),
      },
    });
  });
  return this.issueTokens(session.userId, audience, next);
}
```

`middleware.ts` resuelve la cara por host y protege cada route group. En producción,
`app.<dominio>` reescribe a `/panel/*` y `tienda.<dominio>` sirve `/tienda`, `/mi-cuenta` y
`/c/*`; en desarrollo se puede usar `localhost:3000/panel` o `localhost:3000/tienda`:

```ts
// apps/web/src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const STAFF_COOKIE = 'vc_staff_at';
const CUSTOMER_COOKIE = 'vc_customer_at';

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? '';
  const path = request.nextUrl.pathname;
  const isStaffHost = host.startsWith('app.');
  const isStoreHost = host.startsWith('tienda.');
  const isStorePath = path.startsWith('/tienda') || path.startsWith('/mi-cuenta');

  if (isStaffHost || (!isStoreHost && !isStorePath && path !== '/' && !path.startsWith('/c/'))) {
    if (!path.startsWith('/panel') && !path.startsWith('/login') && !path.startsWith('/c/')) {
      const url = request.nextUrl.clone();
      url.pathname = `/panel${path === '/' ? '' : path}`;
      return NextResponse.rewrite(url);
    }
    if (path.startsWith('/panel') && !request.cookies.get(STAFF_COOKIE)) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  if ((isStoreHost || isStorePath) && path.startsWith('/mi-cuenta') && !path.startsWith('/mi-cuenta/entrar')) {
    if (!request.cookies.get(CUSTOMER_COOKIE)) {
      return NextResponse.redirect(new URL('/mi-cuenta/entrar', request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.webmanifest).*)'],
};
```

Reglas de sesión y cookies:

| Cara | Cookies | TTL access | TTL refresh | MFA |
|---|---|---|---|---|
| Backoffice | `vc_staff_at`, `vc_staff_rt` | 15 min | 7 días (`STAFF_REFRESH_TTL`) | TOTP obligatorio para `org_admin` y `superadmin` |
| Tienda/portal | `vc_customer_at`, `vc_customer_rt` | 15 min | 30 días (`CUSTOMER_REFRESH_TTL`) | No; magic link o Google |

Todas las cookies son `HttpOnly`, `Secure` en producción, `SameSite=Lax` y `Path=/`. En
desarrollo el login se limita a 5 intentos por 15 minutos (`AUTH_LOGIN_*`) con bloqueo
temporal y auditoría; el magic link expira en 20 minutos y es de un solo uso.

## 6. Esquema Prisma inicial

### 6.1 Reglas de modelado

1. Tabla `snake_case` plural vía `@@map`; campo `camelCase` vía `@map` cuando el nombre
   natural coincide con el del documento de contexto.
2. IDs `UUIDv7` (`@default(uuid(7))`, Prisma ≥ 5.18) con `@db.Uuid` (ADR-10).
3. Dinero `BigInt` (`amountMinor`, `priceMinor`, `totalMinor`) + `Currency` (ADR-09).
4. Fechas `@db.Timestamptz(3)` con `now()`/`updatedAt` en UTC; la zona se aplica en UI/PDF.
5. Todo lo transaccional lleva `organizationId`, `catalogId` y `catalogVersionId`
   (reglas R1–R4). Los índices de listado empiezan por `(catalogId, ...)`.
6. Enums de alta cardinalidad en Prisma (`TokenAudience`, `AssignmentScope`, estados de
   venta/pago); los roles y permisos son **datos** (`Role`/`Permission`), no enums, para
   admitir roles personalizados por organización en F4.
7. Nada de borrado físico en entidades de negocio: `deletedAt DateTime?` (R5).
8. Los campos de actor (`createdByUserId`, `sellerUserId`, `actorUserId`) son UUID sin FK
   para no bloquear la baja de usuarios; la integridad se valida en servicio.
9. **Dos caras**: `AuthSession.audience` (`STAFF`/`CUSTOMER`) y `RoleAssignment.scopeType`
   (`GLOBAL`/`ORGANIZATION`/`CATALOG`) son la base del aislamiento de ADR-17; ninguna tabla
   de negocio mezcla datos de las dos audiencias. `CustomerAccount` es la única puerta del
   cliente a una organización y `Customer` su ficha comercial.
10. Los roles del sistema (`isSystem = true`, `organizationId = null`) se siembran una vez;
    en F4 se habilitan roles personalizados por organización con los mismos permisos.

### 6.2 `apps/api/prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Currency {
  CRC
  USD
}

enum Plan {
  FREE
  STARTER
  PRO
}

enum TokenAudience {
  STAFF
  CUSTOMER
}

enum AssignmentScope {
  GLOBAL
  ORGANIZATION
  CATALOG
}

enum CatalogVersionStatus {
  DRAFT
  VALIDATED
  ACTIVE
  ARCHIVED
}

enum ImportStatus {
  PENDING
  DOWNLOADING
  PARSING
  VALIDATING
  READY
  FAILED
}

enum QuoteStatus {
  DRAFT
  SENT
  ACCEPTED
  REJECTED
  EXPIRED
  CONVERTED
}

enum OrderStatus {
  DRAFT
  PENDING_PAYMENT
  PARTIALLY_PAID
  PAID
  FULFILLED
  CANCELLED
  REFUNDED
}

enum PaymentProvider {
  STRIPE
  MERCADOPAGO
  PAYPAL
  CASH
  TRANSFER
  SINPE
}

enum PaymentStatus {
  PENDING
  SUCCEEDED
  FAILED
  REFUNDED
}

enum SocialPostStatus {
  DRAFT
  APPROVED
  SCHEDULED
  PUBLISHED
  REJECTED
}

enum OutboxStatus {
  PENDING
  PROCESSING
  PUBLISHED
  FAILED
}

enum IdempotencyStatus {
  IN_PROGRESS
  COMPLETED
  FAILED
}

model Organization {
  id                    String       @id @default(uuid(7)) @db.Uuid
  name                  String
  slug                  String       @unique
  plan                  Plan         @default(FREE)
  defaultCurrency       Currency     @default(CRC)
  timezone              String       @default("America/Costa_Rica")
  aiMonthlyQuotaTokens  Int          @default(2000000)
  googleRefreshTokenEnc String?
  googleScopes          String[]     @default([])
  googleConnectedAt     DateTime? @db.Timestamptz(3)
  deletedAt             DateTime? @db.Timestamptz(3)
  createdAt             DateTime     @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime     @updatedAt @db.Timestamptz(3)
  memberships           Membership[]
  catalogs              Catalog[]

  @@map("organizations")
}

model User {
  id                 String               @id @default(uuid(7)) @db.Uuid
  email              String               @unique
  phone              String?
  fullName           String
  passwordHash       String?
  status             String               @default("INVITED")
  locale             String               @default("es-CR")
  emailVerifiedAt    DateTime? @db.Timestamptz(3)
  passwordUpdatedAt  DateTime? @db.Timestamptz(3)
  mfaEnabled         Boolean              @default(false)
  mfaSecretEnc       String?
  lastLoginAt        DateTime? @db.Timestamptz(3)
  failedLoginCount   Int                  @default(0)
  lockedUntil        DateTime? @db.Timestamptz(3)
  deletedAt          DateTime? @db.Timestamptz(3)
  createdAt          DateTime             @default(now()) @db.Timestamptz(3)
  updatedAt          DateTime             @updatedAt @db.Timestamptz(3)
  memberships        Membership[]
  roleAssignments    RoleAssignment[]
  customerAccounts   CustomerAccount[]
  authSessions       AuthSession[]
  verificationTokens VerificationToken[]
  consents           Consent[]

  @@index([status, createdAt])
  @@map("users")
}

model Membership {
  id             String           @id @default(uuid(7)) @db.Uuid
  organizationId String           @db.Uuid
  userId         String           @db.Uuid
  status         String           @default("INVITED")
  joinedAt       DateTime? @db.Timestamptz(3)
  createdAt      DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime         @updatedAt @db.Timestamptz(3)
  organization   Organization     @relation(fields: [organizationId], references: [id])
  user           User             @relation(fields: [userId], references: [id])
  assignments    RoleAssignment[]

  @@unique([organizationId, userId])
  @@index([userId, status])
  @@map("memberships")
}

model AuthSession {
  id         String        @id @default(uuid(7)) @db.Uuid
  userId     String        @db.Uuid
  audience   TokenAudience
  tokenHash  String        @unique
  familyId   String        @db.Uuid
  deviceName String?
  ip         String?
  userAgent  String?
  expiresAt  DateTime @db.Timestamptz(3)
  revokedAt  DateTime? @db.Timestamptz(3)
  lastUsedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime      @default(now()) @db.Timestamptz(3)
  user       User          @relation(fields: [userId], references: [id])

  @@index([userId, audience, expiresAt])
  @@index([familyId])
  @@map("auth_sessions")
}

model Role {
  id             String           @id @default(uuid(7)) @db.Uuid
  organizationId String?          @db.Uuid
  key            String
  name           String
  description    String?
  isSystem       Boolean          @default(false)
  createdAt      DateTime         @default(now()) @db.Timestamptz(3)
  permissions    Permission[]
  assignments    RoleAssignment[]
  invitations    UserInvitation[]

  @@unique([organizationId, key])
  @@map("roles")
}

model Permission {
  id          String   @id @default(uuid(7)) @db.Uuid
  key         String   @unique
  description String
  scope       String
  roles       Role[]

  @@map("permissions")
}

model RoleAssignment {
  id           String          @id @default(uuid(7)) @db.Uuid
  userId       String          @db.Uuid
  membershipId String?         @db.Uuid
  roleId       String          @db.Uuid
  scopeType    AssignmentScope @default(ORGANIZATION)
  scopeId      String?         @db.Uuid
  createdAt    DateTime        @default(now()) @db.Timestamptz(3)
  user         User            @relation(fields: [userId], references: [id])
  membership   Membership?     @relation(fields: [membershipId], references: [id])
  role         Role            @relation(fields: [roleId], references: [id])

  @@unique([userId, roleId, scopeType, scopeId])
  @@index([scopeType, scopeId])
  @@map("role_assignments")
}

model CustomerAccount {
  id             String   @id @default(uuid(7)) @db.Uuid
  userId         String   @db.Uuid
  organizationId String   @db.Uuid
  customerId     String   @unique @db.Uuid
  status         String   @default("INVITED")
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  user           User     @relation(fields: [userId], references: [id])
  customer       Customer @relation(fields: [customerId], references: [id])

  @@unique([userId, organizationId])
  @@index([organizationId, status])
  @@map("customer_accounts")
}

model VerificationToken {
  id        String    @id @default(uuid(7)) @db.Uuid
  userId    String?   @db.Uuid
  email     String
  type      String
  tokenHash String    @unique
  expiresAt DateTime @db.Timestamptz(3)
  usedAt    DateTime? @db.Timestamptz(3)
  metadata  Json?
  createdAt DateTime  @default(now()) @db.Timestamptz(3)
  user      User?     @relation(fields: [userId], references: [id])

  @@index([email, type, expiresAt])
  @@map("verification_tokens")
}

model Consent {
  id         String   @id @default(uuid(7)) @db.Uuid
  userId     String   @db.Uuid
  type       String
  version    String
  acceptedAt DateTime @default(now()) @db.Timestamptz(3)
  ip         String?
  user       User     @relation(fields: [userId], references: [id])

  @@unique([userId, type, version])
  @@map("consents")
}

model UserInvitation {
  id              String          @id @default(uuid(7)) @db.Uuid
  organizationId  String          @db.Uuid
  email           String
  roleId          String          @db.Uuid
  scopeType       AssignmentScope @default(ORGANIZATION)
  scopeId         String?         @db.Uuid
  tokenHash       String          @unique
  invitedByUserId String          @db.Uuid
  expiresAt       DateTime @db.Timestamptz(3)
  acceptedAt      DateTime? @db.Timestamptz(3)
  createdAt       DateTime        @default(now()) @db.Timestamptz(3)
  role            Role            @relation(fields: [roleId], references: [id])

  @@index([organizationId, email])
  @@map("user_invitations")
}

model Catalog {
  id              String           @id @default(uuid(7)) @db.Uuid
  organizationId  String           @db.Uuid
  name            String
  slug            String
  description     String?
  driveFolderId   String?
  activeVersionId String?          @unique @db.Uuid
  settings        Json?
  deletedAt       DateTime? @db.Timestamptz(3)
  createdAt       DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime         @updatedAt @db.Timestamptz(3)
  organization    Organization     @relation(fields: [organizationId], references: [id])
  activeVersion   CatalogVersion?  @relation("CatalogActiveVersion", fields: [activeVersionId], references: [id])
  versions        CatalogVersion[] @relation("CatalogVersions")
  products        Product[]

  @@unique([organizationId, slug])
  @@index([organizationId, createdAt])
  @@map("catalogs")
}

model CatalogVersion {
  id               String               @id @default(uuid(7)) @db.Uuid
  catalogId        String               @db.Uuid
  versionNumber    Int
  status           CatalogVersionStatus @default(DRAFT)
  currency         Currency             @default(CRC)
  taxRateBp        Int                  @default(1300)
  taxIncluded      Boolean              @default(true)
  productCount     Int                  @default(0)
  sourceFileId     String?
  sourceChecksum   String?
  importedAt       DateTime? @db.Timestamptz(3)
  validatedAt      DateTime? @db.Timestamptz(3)
  activatedAt      DateTime? @db.Timestamptz(3)
  archivedAt       DateTime? @db.Timestamptz(3)
  createdByUserId  String               @db.Uuid
  createdAt        DateTime             @default(now()) @db.Timestamptz(3)
  catalog          Catalog              @relation("CatalogVersions", fields: [catalogId], references: [id])
  activeFor        Catalog?             @relation("CatalogActiveVersion")
  products         Product[]
  importJobs       ImportJob[]
  quotes           Quote[]
  orders           Order[]
  payments         Payment[]
  expenses         Expense[]
  socialPosts      SocialPost[]

  @@unique([catalogId, versionNumber])
  @@unique([catalogId, sourceChecksum])
  @@index([catalogId, status])
  @@map("catalog_versions")
}

model Product {
  id               String         @id @default(uuid(7)) @db.Uuid
  catalogId        String         @db.Uuid
  catalogVersionId String         @db.Uuid
  sku              String
  name             String
  description      String?
  category         String?
  brand            String?
  priceMinor       BigInt
  costMinor        BigInt?
  currency         Currency       @default(CRC)
  stock            Int?
  allowBackorder   Boolean        @default(false)
  attributes       Json?
  imageKey         String?
  isActive         Boolean        @default(true)
  deletedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime       @updatedAt @db.Timestamptz(3)
  catalog          Catalog        @relation(fields: [catalogId], references: [id])
  catalogVersion   CatalogVersion @relation(fields: [catalogVersionId], references: [id])
  quoteItems       QuoteItem[]
  orderItems       OrderItem[]

  @@unique([catalogVersionId, sku])
  @@index([catalogId, catalogVersionId, category])
  @@index([catalogVersionId, name])
  @@map("products")
}

model ImportJob {
  id               String           @id @default(uuid(7)) @db.Uuid
  catalogId        String           @db.Uuid
  catalogVersionId String?          @db.Uuid
  status           ImportStatus     @default(PENDING)
  sourceType       String
  driveFileId      String?
  fileName         String?
  fileChecksum     String?
  columnMapping    Json?
  totalRows        Int              @default(0)
  importedRows     Int              @default(0)
  quarantineRows   Int              @default(0)
  errorMessage     String?
  createdByUserId  String           @db.Uuid
  startedAt        DateTime? @db.Timestamptz(3)
  finishedAt       DateTime? @db.Timestamptz(3)
  createdAt        DateTime         @default(now()) @db.Timestamptz(3)
  catalogVersion   CatalogVersion?  @relation(fields: [catalogVersionId], references: [id])
  issues           ImportRowIssue[]

  @@unique([catalogId, fileChecksum])
  @@index([catalogId, status, createdAt])
  @@map("import_jobs")
}

model ImportRowIssue {
  id          String    @id @default(uuid(7)) @db.Uuid
  importJobId String    @db.Uuid
  rowNumber   Int
  severity    String
  code        String
  message     String
  rawData     Json
  importJob   ImportJob @relation(fields: [importJobId], references: [id], onDelete: Cascade)

  @@index([importJobId, severity])
  @@map("import_row_issues")
}

model Customer {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  name           String
  taxId          String?
  email          String?
  phone          String?
  address        String?
  notes          String?
  deletedAt      DateTime? @db.Timestamptz(3)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  updatedAt      DateTime @updatedAt @db.Timestamptz(3)
  quotes         Quote[]
  orders         Order[]
  account        CustomerAccount?
  addresses      Address[]

  @@index([organizationId, phone])
  @@index([organizationId, name])
  @@map("customers")
}

model Address {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String   @db.Uuid
  customerId     String   @db.Uuid
  label          String
  line1          String
  line2          String?
  city           String
  province       String
  postalCode     String?
  country        String   @default("CR")
  isDefault      Boolean  @default(false)
  createdAt      DateTime @default(now()) @db.Timestamptz(3)
  customer       Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
  @@map("addresses")
}

model Quote {
  id               String         @id @default(uuid(7)) @db.Uuid
  organizationId   String         @db.Uuid
  catalogId        String         @db.Uuid
  catalogVersionId String         @db.Uuid
  customerId       String         @db.Uuid
  sellerUserId     String?        @db.Uuid
  number           String
  status           QuoteStatus    @default(DRAFT)
  currency         Currency       @default(CRC)
  subtotalMinor    BigInt         @default(0)
  discountMinor    BigInt         @default(0)
  taxMinor         BigInt         @default(0)
  totalMinor       BigInt         @default(0)
  taxRateBp        Int            @default(1300)
  taxIncluded      Boolean        @default(true)
  validUntil       DateTime @db.Timestamptz(3)
  notes            String?
  publicToken      String         @unique
  pdfKey           String?
  deletedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime       @updatedAt @db.Timestamptz(3)
  catalogVersion   CatalogVersion @relation(fields: [catalogVersionId], references: [id])
  customer         Customer       @relation(fields: [customerId], references: [id])
  items            QuoteItem[]
  order            Order?

  @@unique([organizationId, number])
  @@index([catalogId, status, createdAt])
  @@index([customerId])
  @@map("quotes")
}

model QuoteItem {
  id             String   @id @default(uuid(7)) @db.Uuid
  quoteId        String   @db.Uuid
  productId      String   @db.Uuid
  skuSnapshot    String
  nameSnapshot   String
  unitPriceMinor BigInt
  quantity       Int
  discountMinor  BigInt   @default(0)
  lineTotalMinor BigInt
  quote          Quote    @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  product        Product  @relation(fields: [productId], references: [id])

  @@index([quoteId])
  @@map("quote_items")
}

model Order {
  id               String         @id @default(uuid(7)) @db.Uuid
  organizationId   String         @db.Uuid
  catalogId        String         @db.Uuid
  catalogVersionId String         @db.Uuid
  customerId       String         @db.Uuid
  sellerUserId     String?        @db.Uuid
  quoteId          String?        @unique @db.Uuid
  number           String
  status           OrderStatus    @default(DRAFT)
  currency         Currency       @default(CRC)
  subtotalMinor    BigInt         @default(0)
  discountMinor    BigInt         @default(0)
  taxMinor         BigInt         @default(0)
  totalMinor       BigInt         @default(0)
  paidMinor        BigInt         @default(0)
  taxRateBp        Int            @default(1300)
  taxIncluded      Boolean        @default(true)
  paymentUrl       String?
  notes            String?
  deletedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime       @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime       @updatedAt @db.Timestamptz(3)
  catalogVersion   CatalogVersion @relation(fields: [catalogVersionId], references: [id])
  customer         Customer       @relation(fields: [customerId], references: [id])
  quote            Quote?         @relation(fields: [quoteId], references: [id])
  items            OrderItem[]
  payments         Payment[]

  @@unique([organizationId, number])
  @@index([catalogId, status, createdAt])
  @@index([customerId])
  @@map("orders")
}

model OrderItem {
  id             String  @id @default(uuid(7)) @db.Uuid
  orderId        String  @db.Uuid
  productId      String  @db.Uuid
  skuSnapshot    String
  nameSnapshot   String
  unitPriceMinor BigInt
  quantity       Int
  discountMinor  BigInt  @default(0)
  lineTotalMinor BigInt
  order          Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product        Product @relation(fields: [productId], references: [id])

  @@index([orderId])
  @@map("order_items")
}

model Payment {
  id               String             @id @default(uuid(7)) @db.Uuid
  organizationId   String             @db.Uuid
  catalogId        String             @db.Uuid
  catalogVersionId String             @db.Uuid
  orderId          String             @db.Uuid
  provider         PaymentProvider
  providerPaymentId String?
  status           PaymentStatus      @default(PENDING)
  amountMinor      BigInt
  currency         Currency
  feeMinor         BigInt             @default(0)
  method           String?
  paidAt           DateTime? @db.Timestamptz(3)
  rawPayload       Json?
  createdAt        DateTime           @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime           @updatedAt @db.Timestamptz(3)
  catalogVersion   CatalogVersion     @relation(fields: [catalogVersionId], references: [id])
  order            Order              @relation(fields: [orderId], references: [id])
  webhookEvent     PaymentWebhookEvent?

  @@index([orderId, status])
  @@index([catalogId, createdAt])
  @@map("payments")
}

model PaymentWebhookEvent {
  id              String          @id @default(uuid(7)) @db.Uuid
  provider        PaymentProvider
  externalEventId String
  eventType       String
  signatureValid  Boolean
  payload         Json
  paymentId       String?         @unique @db.Uuid
  error           String?
  processedAt     DateTime? @db.Timestamptz(3)
  receivedAt      DateTime        @default(now()) @db.Timestamptz(3)
  payment         Payment?        @relation(fields: [paymentId], references: [id])

  @@unique([provider, externalEventId])
  @@index([provider, processedAt])
  @@map("payment_webhook_events")
}

model Expense {
  id               String          @id @default(uuid(7)) @db.Uuid
  organizationId   String          @db.Uuid
  catalogId        String          @db.Uuid
  catalogVersionId String?         @db.Uuid
  category         String
  description      String
  amountMinor      BigInt
  currency         Currency
  taxMinor         BigInt          @default(0)
  incurredAt       DateTime @db.Timestamptz(3)
  paymentMethod    String?
  receiptKey       String?
  status           String          @default("CONFIRMED")
  createdByUserId  String          @db.Uuid
  deletedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime        @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime        @updatedAt @db.Timestamptz(3)
  catalogVersion   CatalogVersion? @relation(fields: [catalogVersionId], references: [id])

  @@index([organizationId, incurredAt])
  @@index([catalogId, incurredAt])
  @@map("expenses")
}

model SocialPost {
  id               String           @id @default(uuid(7)) @db.Uuid
  organizationId   String           @db.Uuid
  catalogId        String           @db.Uuid
  catalogVersionId String           @db.Uuid
  platform         String
  tone             String
  goal             String
  title            String
  body             String
  hashtags         String[]         @default([])
  cta              String
  visualSuggestion String?
  productIds       String[]         @default([]) @db.Uuid
  status           SocialPostStatus @default(DRAFT)
  promptTemplateKey String
  promptVersion    Int
  aiProvider       String
  aiModel          String
  tokensIn         Int              @default(0)
  tokensOut        Int              @default(0)
  costMicroUsd     Int              @default(0)
  scheduledFor     DateTime? @db.Timestamptz(3)
  publishedAt      DateTime? @db.Timestamptz(3)
  approvedByUserId String?          @db.Uuid
  deletedAt        DateTime? @db.Timestamptz(3)
  createdAt        DateTime         @default(now()) @db.Timestamptz(3)
  updatedAt        DateTime         @updatedAt @db.Timestamptz(3)
  catalogVersion   CatalogVersion   @relation(fields: [catalogVersionId], references: [id])

  @@index([catalogId, status, createdAt])
  @@index([status, scheduledFor])
  @@map("social_posts")
}

model AiUsageLedger {
  id                String   @id @default(uuid(7)) @db.Uuid
  organizationId    String   @db.Uuid
  catalogId         String?  @db.Uuid
  feature           String
  provider          String
  model             String
  promptTemplateKey String
  promptVersion     Int
  tokensIn          Int
  tokensOut         Int
  costMicroUsd      Int
  latencyMs         Int
  cacheHit          Boolean  @default(false)
  requestHash       String
  userId            String?  @db.Uuid
  socialPostId      String?  @db.Uuid
  createdAt         DateTime @default(now()) @db.Timestamptz(3)

  @@index([organizationId, createdAt])
  @@index([catalogId, createdAt])
  @@index([requestHash])
  @@map("ai_usage_ledger")
}

model WhatsAppMessage {
  id             String    @id @default(uuid(7)) @db.Uuid
  organizationId String    @db.Uuid
  catalogId      String?   @db.Uuid
  customerId     String?   @db.Uuid
  orderId        String?   @db.Uuid
  direction      String
  waMessageId    String?   @unique
  phoneE164      String
  templateName   String?
  body           String?
  status         String    @default("QUEUED")
  errorCode      String?
  sentAt         DateTime? @db.Timestamptz(3)
  deliveredAt    DateTime? @db.Timestamptz(3)
  readAt         DateTime? @db.Timestamptz(3)
  createdAt      DateTime  @default(now()) @db.Timestamptz(3)

  @@index([organizationId, createdAt])
  @@index([phoneE164, createdAt])
  @@map("whatsapp_messages")
}

model ChatConversation {
  id              String     @id @default(uuid(7)) @db.Uuid
  organizationId  String     @db.Uuid
  catalogId       String     @db.Uuid
  customerId      String?    @db.Uuid
  orderId         String?    @db.Uuid
  assignedToUserId String?   @db.Uuid
  status          String     @default("OPEN")
  subject         String?
  lastMessageAt   DateTime? @db.Timestamptz(3)
  createdAt       DateTime   @default(now()) @db.Timestamptz(3)
  updatedAt       DateTime   @updatedAt @db.Timestamptz(3)
  messages        ChatMessage[]

  @@index([catalogId, status, lastMessageAt])
  @@map("chat_conversations")
}

model ChatMessage {
  id             String           @id @default(uuid(7)) @db.Uuid
  conversationId String           @db.Uuid
  senderUserId   String?          @db.Uuid
  senderType     String
  body           String
  attachmentKey  String?
  readAt         DateTime? @db.Timestamptz(3)
  createdAt      DateTime         @default(now()) @db.Timestamptz(3)
  conversation   ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("chat_messages")
}

model AuditLog {
  id             String   @id @default(uuid(7)) @db.Uuid
  organizationId String?  @db.Uuid
  actorUserId    String?  @db.Uuid
  action         String
  entityType     String
  entityId       String   @db.Uuid
  before         Json?
  after          Json?
  ip             String?
  userAgent      String?
  traceId        String
  createdAt      DateTime @default(now()) @db.Timestamptz(3)

  @@index([organizationId, createdAt])
  @@index([entityType, entityId, createdAt])
  @@map("audit_log")
}

model OutboxEvent {
  id             String       @id @default(uuid(7)) @db.Uuid
  aggregateType  String
  aggregateId    String       @db.Uuid
  eventType      String
  payload        Json
  status         OutboxStatus @default(PENDING)
  attempts       Int          @default(0)
  availableAt    DateTime     @default(now()) @db.Timestamptz(3)
  publishedAt    DateTime? @db.Timestamptz(3)
  lastError      String?
  createdAt      DateTime     @default(now()) @db.Timestamptz(3)

  @@index([status, availableAt])
  @@map("outbox_events")
}

model IdempotencyKey {
  id             String            @id @default(uuid(7)) @db.Uuid
  organizationId String            @db.Uuid
  key            String
  scope          String
  requestHash    String
  status         IdempotencyStatus @default(IN_PROGRESS)
  responseStatus Int?
  responseBody   Json?
  expiresAt      DateTime @db.Timestamptz(3)
  createdAt      DateTime          @default(now()) @db.Timestamptz(3)

  @@unique([organizationId, key, scope])
  @@index([expiresAt])
  @@map("idempotency_keys")
}
```

### 6.3 Primeras cinco migraciones (en orden)

| # | Nombre de migración | Contenido y decisiones |
|---|---|---|
| 1 | `init_identity_and_users` | Extensiones `pg_trgm`, `unaccent`, `pgcrypto`; `organizations`, `users`, `memberships`, `roles`, `permissions`, `role_assignments`, `auth_sessions`, `verification_tokens`, `consents`, `user_invitations`, `customer_accounts`, `addresses`, `audit_log`, `outbox_events`, `idempotency_keys`; índice parcial único `roles(key) WHERE organization_id IS NULL` para roles del sistema |
| 2 | `catalog_versioning` | `catalogs`, `catalog_versions`, `products`, `import_jobs`, `import_row_issues`; FK `catalogs.active_version_id` se agrega **después** de crear `catalog_versions`; `@@unique([catalog_version_id, sku])` |
| 3 | `sales_quotes_orders` | `customers`, `quotes`, `quote_items`, `orders`, `order_items`; secuencias de numeración por organización y `@@unique([organization_id, number])` |
| 4 | `payments_finance` | `payments`, `payment_webhook_events`, `expenses`; `@@unique([provider, external_event_id])`; índice trigram en `products.name` para búsqueda |
| 5 | `ai_social_messaging_chat` | `social_posts`, `ai_usage_ledger`, `whatsapp_messages`, `chat_conversations`, `chat_messages` (las dos caras comparten el mismo historial por `customer_id`; las tablas de chat se crean aquí aunque la UI de M6 llegue en F5) |

SQL relevante de la migración 2 (orden de FK) y de la 4 (índice de búsqueda):

```sql
-- migración 2: primero las tablas, luego el puntero de versión activa
ALTER TABLE "catalogs"
  ADD CONSTRAINT "catalogs_active_version_id_fkey"
  FOREIGN KEY ("active_version_id") REFERENCES "catalog_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- migración 4: búsqueda por nombre insensible a acentos
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() no es IMMUTABLE: se envuelve para poder indexar
CREATE OR REPLACE FUNCTION "immutable_unaccent"("value" text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent', $1) $$;

CREATE INDEX "products_name_trgm_idx"
  ON "products" USING gin ("immutable_unaccent"(lower("name")) gin_trgm_ops);
```

Reglas de migración: una migración por PR; `prisma migrate dev` solo en local; en CI/staging/
producción `prisma migrate deploy`; toda migración destructiva se parte en expandir → migrar
datos → contraer, y se prueba restaurando el backup previo (§10.5).

### 6.4 Seed idempotente: roles, permisos y tres usuarios demo

`.env.seed.example` (el `.env.seed` real no se versiona; el seed usa estos valores por defecto):

```dotenv
SEED_STAFF_EMAIL=admin@ventascatalogo.local
SEED_STAFF_PASSWORD=Demo1234!
SEED_CUSTOMER_EMAIL=cliente@ventascatalogo.local
SEED_CUSTOMER_PASSWORD=Demo1234!
SEED_DUAL_EMAIL=mixto@ventascatalogo.local
SEED_DUAL_PASSWORD=Demo1234!
```

| Usuario demo | Organización | Cara | Rol / vínculo |
|---|---|---|---|
| `admin@ventascatalogo.local` | Org Demo | staff | `org_admin` (scope organización) |
| `cliente@ventascatalogo.local` | Org Demo | customer | `CustomerAccount` + rol `customer` (self) |
| `mixto@ventascatalogo.local` | Org Demo / Org Aliada | staff en A, customer en B | `vendedor` en A + `CustomerAccount` en B |

```ts
// apps/api/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  ['catalog:read', 'organization', 'Ver catálogos'],
  ['catalog:write', 'organization', 'Importar y activar catálogos'],
  ['product:read', 'organization', 'Ver productos'],
  ['order:read', 'organization', 'Ver pedidos y cotizaciones'],
  ['order:create', 'organization', 'Crear pedidos y cotizaciones'],
  ['payment:read', 'organization', 'Ver pagos'],
  ['payment:write', 'organization', 'Registrar y conciliar pagos'],
  ['expense:write', 'organization', 'Registrar gastos'],
  ['finance:read', 'organization', 'Ver reportes financieros'],
  ['social:generate', 'organization', 'Generar contenido con IA'],
  ['social:approve', 'organization', 'Aprobar contenido'],
  ['chat:write', 'organization', 'Atender conversaciones'],
  ['user:manage', 'organization', 'Invitar y administrar usuarios'],
  ['settings:manage', 'organization', 'Configurar integraciones'],
  ['admin:manage', 'global', 'Administración global del SaaS'],
  ['self:order:read', 'self', 'Ver pedidos propios'],
  ['self:profile:write', 'self', 'Editar perfil propio'],
  ['self:chat:write', 'self', 'Chatear como cliente'],
] as const;

const ROLES = [
  { key: 'superadmin', name: 'Superadmin', permissions: PERMISSIONS.map(([key]) => key) },
  { key: 'org_admin', name: 'Administrador de organización', permissions: ['catalog:read', 'catalog:write', 'product:read', 'order:read', 'order:create', 'payment:read', 'payment:write', 'expense:write', 'finance:read', 'social:generate', 'social:approve', 'chat:write', 'user:manage', 'settings:manage'] },
  { key: 'catalog_admin', name: 'Administrador de catálogo', permissions: ['catalog:read', 'catalog:write', 'product:read'] },
  { key: 'vendedor', name: 'Vendedor', permissions: ['catalog:read', 'product:read', 'order:read', 'order:create', 'chat:write'] },
  { key: 'finanzas', name: 'Finanzas', permissions: ['order:read', 'payment:read', 'payment:write', 'expense:write', 'finance:read'] },
  { key: 'social_manager', name: 'Social media manager', permissions: ['product:read', 'social:generate', 'social:approve'] },
  { key: 'agente_chat', name: 'Agente de chat', permissions: ['chat:write', 'order:read'] },
  { key: 'customer', name: 'Cliente', permissions: ['self:order:read', 'self:profile:write', 'self:chat:write'] },
];

async function ensureRole(key: string, name: string, permissionKeys: readonly string[]) {
  const existing = await prisma.role.findFirst({ where: { key, organizationId: null } });
  const permissions = { set: permissionKeys.map((permissionKey) => ({ key: permissionKey })) };
  if (existing) return prisma.role.update({ where: { id: existing.id }, data: { name, permissions } });
  return prisma.role.create({
    data: { key, name, isSystem: true, permissions: { connect: permissionKeys.map((permissionKey) => ({ key: permissionKey })) } },
  });
}

async function ensureUser(email: string, fullName: string, passwordPlain: string) {
  const passwordHash = await hash(passwordPlain);
  return prisma.user.upsert({
    where: { email },
    create: { email, fullName, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date() },
    update: { passwordHash, status: 'ACTIVE' },
  });
}

async function ensureMembership(organizationId: string, userId: string) {
  return prisma.membership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, status: 'ACTIVE', joinedAt: new Date() },
    update: { status: 'ACTIVE' },
  });
}

async function ensureAssignment(userId: string, roleId: string, organizationId: string, membershipId: string | null) {
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, scopeType: 'ORGANIZATION', scopeId: organizationId },
  });
  if (existing) return existing;
  return prisma.roleAssignment.create({
    data: { userId, roleId, membershipId, scopeType: 'ORGANIZATION', scopeId: organizationId },
  });
}

async function ensureCustomer(organizationId: string, email: string, name: string) {
  const existing = await prisma.customer.findFirst({ where: { organizationId, email } });
  return existing ?? prisma.customer.create({ data: { organizationId, name, email } });
}

async function ensureCustomerAccount(userId: string, organizationId: string, customerId: string) {
  const existing = await prisma.customerAccount.findUnique({ where: { customerId } });
  return existing ?? prisma.customerAccount.create({
    data: { userId, organizationId, customerId, status: 'ACTIVE' },
  });
}

async function main(): Promise<void> {
  const orgA = await prisma.organization.upsert({
    where: { slug: 'demo' },
    create: { name: 'Organización Demo', slug: 'demo', plan: 'PRO' },
    update: {},
  });
  const orgB = await prisma.organization.upsert({
    where: { slug: 'aliada' },
    create: { name: 'Organización Aliada', slug: 'aliada', plan: 'STARTER' },
    update: {},
  });

  for (const [key, scope, description] of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key, scope, description }, update: { scope, description } });
  }
  const roles = new Map<string, { id: string }>();
  for (const role of ROLES) roles.set(role.key, await ensureRole(role.key, role.name, role.permissions));

  const staff = await ensureUser(process.env.SEED_STAFF_EMAIL ?? 'admin@ventascatalogo.local', 'Admin Demo', process.env.SEED_STAFF_PASSWORD ?? 'Demo1234!');
  const customer = await ensureUser(process.env.SEED_CUSTOMER_EMAIL ?? 'cliente@ventascatalogo.local', 'Cliente Demo', process.env.SEED_CUSTOMER_PASSWORD ?? 'Demo1234!');
  const dual = await ensureUser(process.env.SEED_DUAL_EMAIL ?? 'mixto@ventascatalogo.local', 'Usuario Mixto', process.env.SEED_DUAL_PASSWORD ?? 'Demo1234!');

  const staffMembership = await ensureMembership(orgA.id, staff.id);
  await ensureAssignment(staff.id, roles.get('org_admin')!.id, orgA.id, staffMembership.id);

  const customerAsCustomer = await ensureCustomer(orgA.id, customer.email, customer.fullName);
  await ensureCustomerAccount(customer.id, orgA.id, customerAsCustomer.id);
  await ensureAssignment(customer.id, roles.get('customer')!.id, orgA.id, null);

  const dualMembership = await ensureMembership(orgA.id, dual.id);
  await ensureAssignment(dual.id, roles.get('vendedor')!.id, orgA.id, dualMembership.id);
  const dualAsCustomer = await ensureCustomer(orgB.id, dual.email, dual.fullName);
  await ensureCustomerAccount(dual.id, orgB.id, dualAsCustomer.id);
  await ensureAssignment(dual.id, roles.get('customer')!.id, orgB.id, null);

  const catalog = await prisma.catalog.upsert({
    where: { organizationId_slug: { organizationId: orgA.id, slug: 'catalogo-demo' } },
    create: { organizationId: orgA.id, name: 'Catálogo Demo', slug: 'catalogo-demo' },
    update: {},
  });
  const version = await prisma.catalogVersion.upsert({
    where: { catalogId_versionNumber: { catalogId: catalog.id, versionNumber: 1 } },
    create: { catalogId: catalog.id, versionNumber: 1, status: 'ACTIVE', activatedAt: new Date(), createdByUserId: staff.id },
    update: {},
  });
  await prisma.catalog.update({ where: { id: catalog.id }, data: { activeVersionId: version.id } });

  for (let i = 1; i <= 12; i += 1) {
    await prisma.product.upsert({
      where: { catalogVersionId_sku: { catalogVersionId: version.id, sku: `DEMO-${String(i).padStart(3, '0')}` } },
      create: {
        catalogId: catalog.id,
        catalogVersionId: version.id,
        sku: `DEMO-${String(i).padStart(3, '0')}`,
        name: `Producto demo ${i}`,
        category: i % 3 === 0 ? 'Accesorios' : 'General',
        priceMinor: BigInt(5_000 + i * 1_000),
        currency: 'CRC',
        stock: 10 + i,
      },
      update: {},
    });
  }
  console.log('Seed listo: admin@ / cliente@ / mixto@ventascatalogo.local (Demo1234!)');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

## 7. Motor de IA: plantillas, coste, cuotas y pruebas

### 7.1 Selección de modelo por caso de uso

| Caso de uso | Cola | Modelo por defecto | Salida máx. | Motivo |
|---|---|---|---|---|
| Post individual | `ai.generate` | `deepseek-chat` | 1 200 tokens | Coste bajo, latencia < 8 s |
| Calendario de 5–10 posts | `ai.generate` | `deepseek-chat` (batch) | 4 000 tokens | Se ejecuta en background |
| Resumen de conversación (F5) | `ai.generate` | `deepseek-chat` | 400 tokens | Suficiente para contexto |
| Mapeo de columnas asistido | `ai.generate` | `deepseek-chat` | 800 tokens | Salida estructurada |
| Análisis/estrategia de campaña | `ai.generate` | `deepseek-reasoner` | 2 500 tokens | Requiere razonamiento |

El modelo se guarda en cada `SocialPost` y en `AiUsageLedger`; un cambio de modelo nunca se
aplica retroactivamente a contenido ya generado.

### 7.2 Plantillas versionadas (`packages/ai/prompts/*.ts`)

Cada plantilla es un módulo con `key`, `version`, `locale` y funciones puras de construcción.
El `AiUsageLedger` y `SocialPost` guardan `promptTemplateKey` + `promptVersion`, de modo que
cualquier post se puede reproducir con la plantilla exacta que lo generó.

```ts
// packages/ai/src/prompts/social-post.v3.ts
export interface SocialPromptInput {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'x';
  tone: 'profesional' | 'humoristico' | 'urgente' | 'inspirador';
  goal: 'venta' | 'engagement' | 'educativo';
  brandVoice: string;
  products: Array<{ sku: string; name: string; description: string; price: string; currency: string; category: string }>;
}

export const socialPostPrompt = {
  key: 'social.post',
  version: 3,
  locale: 'es-CR',
  system:
    'Eres copywriter de una PYME costarricense. Escribís español de Costa Rica, claro y directo. ' +
    'Usás únicamente los precios y características del JSON de productos; si falta un dato no lo inventás. ' +
    'Devolvés JSON válido con las claves title, body, hashtags (array), cta y visualSuggestion.',
  user: (input: SocialPromptInput): string =>
    [
      `Plataforma: ${input.platform}`,
      `Tono: ${input.tone}`,
      `Objetivo: ${input.goal}`,
      `Voz de marca: ${input.brandVoice}`,
      `Productos: ${JSON.stringify(input.products)}`,
      'Máximo 8 hashtags relevantes para Costa Rica. CTA en segunda persona.',
    ].join('\n'),
} as const;
```

Registro de plantillas activas:

| Key | Versiones | Uso | Test de snapshot |
|---|---|---|---|
| `social.post` | v1, v2, v3 | Post individual | `social-post.prompt.spec.ts` |
| `social.calendar` | v1, v2 | Calendario masivo | `social-calendar.prompt.spec.ts` |
| `chat.summary` | v1 | Resumen de conversación | `chat-summary.prompt.spec.ts` |
| `import.column-mapping` | v1 | Sugerencia de mapeo de columnas | `column-mapping.prompt.spec.ts` |

Regla: se agrega una versión nueva cuando cambia cualquier texto del prompt; la anterior
queda disponible para reproducción y no se borra.

### 7.3 Medición de tokens y coste (`AiUsageLedger`)

```ts
// packages/ai/src/budget/cost.ts
export interface AiPricing { usdPer1kInput: number; usdPer1kOutput: number }

export function computeCostMicroUsd(tokensIn: number, tokensOut: number, pricing: AiPricing): number {
  const input = (tokensIn / 1000) * pricing.usdPer1kInput * 1_000_000;
  const output = (tokensOut / 1000) * pricing.usdPer1kOutput * 1_000_000;
  return Math.round(input + output);
}
```

Cada generación escribe una fila en `ai_usage_ledger` con `tokensIn`, `tokensOut`,
`costMicroUsd` (entero, sin decimales), `latencyMs`, `cacheHit`, `requestHash`, `provider`,
`model`, `promptTemplateKey`, `promptVersion` y `userId`. El coste en micro-USD evita
`float` y se convierte a USD solo en la UI (`costMicroUsd / 1_000_000`).

Consultas base del panel de admin:

```sql
-- gasto del mes por organización
SELECT organization_id, SUM(tokens_in + tokens_out) AS tokens, SUM(cost_micro_usd) AS cost_micro_usd
FROM ai_usage_ledger
WHERE created_at >= date_trunc('month', now())
GROUP BY organization_id
ORDER BY cost_micro_usd DESC;

-- tasa de caché y coste medio por generación
SELECT
  COUNT(*) FILTER (WHERE cache_hit)::numeric / COUNT(*) AS cache_hit_rate,
  AVG(cost_micro_usd) AS avg_cost_micro_usd
FROM ai_usage_ledger
WHERE organization_id = $1 AND created_at >= now() - interval '30 days';
```

### 7.4 Cuotas y caché

La cuota se valida **antes** de llamar al proveedor, con un contador Redis por mes y
respaldo en la suma del ledger (si Redis se reinicia, se recalcula desde Postgres).

```ts
async assertQuota(organizationId: string): Promise<void> {
  const organization = await this.prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { aiMonthlyQuotaTokens: true },
  });
  const used = await this.usage.sumMonthTokens(organizationId);
  if (used >= organization.aiMonthlyQuotaTokens) {
    throw new AppException('AI_QUOTA_EXCEEDED', 429, {
      usedTokens: used,
      quotaTokens: organization.aiMonthlyQuotaTokens,
      resetsAt: startOfNextMonthUtc().toISOString(),
    });
  }
}

// caché: misma entrada → misma salida durante AI_CACHE_TTL_SECONDS
const cacheKey = `ai:gen:${sha256(JSON.stringify({ model, messages, temperature, maxOutputTokens }))}`;
const cached = await this.redis.get(cacheKey);
if (cached) {
  const parsed = JSON.parse(cached) as { text: string; usage: AiUsage };
  await this.ledger.record({ ...context, ...parsed.usage, cacheHit: true, costMicroUsd: 0 });
  return parsed;
}
```

La caché nunca cruza organizaciones: la clave incluye `organizationId` y `promptVersion` en
el hash. El TTL por defecto es 24 h (`AI_CACHE_TTL_SECONDS`).

### 7.5 Pruebas sin gastar API

| Nivel | Qué se prueba | Cómo |
|---|---|---|
| Unitario | Construcción de prompts, parseo de JSON, cálculo de coste | Vitest con fixtures y `toMatchSnapshot()` |
| Contrato | `AiProvider` cumple interfaz y streaming produce deltas | `MockAiProvider` que emite `['Hola', ' mundo']` |
| Integración | Cuota, caché e idempotencia sin red | `AI_PROVIDER=mock` y `fetch` mockeado con `vi.fn()` |
| Smoke real (manual, no CI) | El proveedor responde | `pnpm exec tsx tools/ai-smoke.ts` con `AI_MAX_OUTPUT_TOKENS=64` |

Reglas de CI: no se configuran `DEEPSEEK_API_KEY` ni `OPENAI_API_KEY` en GitHub Actions; si
un test intenta salir a la red, falla. Las plantillas se congelan con snapshot y cualquier
cambio de texto obliga a actualizar el snapshot en el PR (revisión explícita del prompt).

Fixtures: `packages/ai/src/testing/fixtures/social-post-response.json` (JSON válido del
modelo), `prompt-input.json` (productos de ejemplo) y `usage.json`. El `MockAiProvider` se
inyecta con el token `AI_PROVIDER` según `NODE_ENV=test`.

### 7.6 Fallback de proveedor y circuit breaker

```ts
async generate(request: AiCompletionRequest, context: AiCallContext): Promise<AiCompletionResult> {
  for (const provider of [this.primary, this.fallback]) {
    if (!provider) continue;
    if (await this.circuit.isOpen(provider.name)) continue;
    try {
      const result = await provider.complete(request);
      await this.circuit.recordSuccess(provider.name);
      return result;
    } catch (error) {
      if (error instanceof AppException && error.code === 'AI_CONTENT_BLOCKED') throw error;
      await this.circuit.recordFailure(provider.name);
      this.logger.warn({ provider: provider.name, err: error }, 'ai_provider_failed');
    }
  }
  throw new AppException('AI_PROVIDER_ERROR', 502);
}
```

El circuito se guarda en Redis: 5 fallos consecutivos en 60 s abren el proveedor 120 s. El
fallback se configura con otra API key compatible (`AI_FALLBACK_*`); si no está configurado,
la generación devuelve `AI_PROVIDER_ERROR` y el post queda en `DRAFT` sin coste.

## 8. Importación desde Google Drive

### 8.1 OAuth 2.0 con scopes mínimos

| Paso | Acción | Valor exacto |
|---|---|---|
| 1 | Crear proyecto en Google Cloud Console | Nombre: `ventascatalogo` |
| 2 | Habilitar API | Google Drive API |
| 3 | Pantalla de consentimiento | Externa, modo *Testing*, usuarios de prueba cargados |
| 4 | Scopes | `https://www.googleapis.com/auth/drive.readonly`, `openid`, `email`, `profile` |
| 5 | Credencial | OAuth client ID tipo *Web application* |
| 6 | Redirect URI | `http://localhost:3001/api/v1/integrations/google/callback` (prod: `https://api.<dominio>/api/v1/integrations/google/callback`) |
| 7 | Consentimiento | `access_type=offline` y `prompt=consent` para obtener `refresh_token` |
| 8 | Almacenamiento | Refresh token cifrado con AES-256-GCM en `organizations.google_refresh_token_enc` |
| 9 | Desconexión | Revocar en Google (`/revoke`) y borrar el token cifrado |

```ts
// common/utils/crypto.ts — cifrado del refresh token en reposo
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function encryptSecret(plain: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, 'base64'); // ENCRYPTION_KEY: 32 bytes
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string, keyBase64: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== 'v1') throw new Error('unsupported_secret_version');
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyBase64, 'base64'), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}
```

El token **nunca** se registra en logs ni se devuelve al frontend; solo el backend lo usa para
refrescar el access token cada 55 minutos.

### 8.2 Descarga y snapshot

1. `files.list` con `q="'<folderId>' in parents and trashed = false"` y `fields=files(id,name,mimeType,modifiedTime,size,webViewLink)`.
2. Para Google Sheets: `files.export` con `mimeType=text/csv`; para binarios: `files.get` con `alt=media`.
3. Mientras llega el stream se calcula SHA-256 y se guarda el original en
   `vc-docs/imports/{catalogId}/{checksum}/original.{csv|xlsx|pdf}`.
4. Se crea `ImportJob` con `fileChecksum`; el índice único `(catalogId, fileChecksum)` hace la
   importación idempotente (repetir el mismo archivo devuelve el job existente).
5. Reintentos: 3 intentos con backoff 1 s/4 s/9 s solo para `429` y `5xx`; se respeta
   `Retry-After`. Errores de permisos (`403`) no se reintentan: marcan `INTEGRATION_NOT_CONFIGURED`.

```ts
async downloadToSnapshot(fileId: string, catalogId: string): Promise<{ checksum: string; objectKey: string }> {
  const response = await this.drive.withRetry(() => this.drive.exportFile(fileId));
  const hash = createHash('sha256');
  const chunks: Buffer[] = [];
  for await (const chunk of response.data as AsyncIterable<Buffer>) {
    hash.update(chunk);
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const checksum = hash.digest('hex');
  const objectKey = `imports/${catalogId}/${checksum}/original.csv`;
  await this.storage.uploadObject('vc-docs', objectKey, body, 'text/csv');
  return { checksum, objectKey };
}
```

### 8.3 Parseo por formato

| Formato | MIME / extensión | Parser | Nota |
|---|---|---|---|
| Google Sheets | `application/vnd.google-apps.spreadsheet` | Export CSV + `papaparse` | Primera hoja; avisar si hay más hojas |
| Excel | `.xlsx`, `.xls` | `exceljs` en modo streaming | Leer la primera hoja con encabezado en fila 1 |
| CSV | `.csv`, `.txt` | `papaparse` con detección de delimitador | Codificación UTF-8; si falla, Windows-1252 |
| PDF | `.pdf` | `pdf-parse` (capa de texto) | Sin capa de texto → `UNSUPPORTED_PDF` (OCR en F5) |

Límites: 50 000 filas, 25 MB de archivo, 200 columnas. Al excederlos el job falla con
`IMPORT_LIMIT_EXCEEDED` y no se crea versión.

### 8.4 Normalización de columnas

Sinónimos aceptados (comparación en minúsculas, sin acentos y sin espacios repetidos):

| Campo destino | Sinónimos |
|---|---|
| `sku` | sku, código, codigo, código producto, ref, referencia |
| `name` | nombre, producto, descripción, descripcion, título |
| `priceMinor` | precio, precio venta, pvp, precio unitario |
| `costMinor` | costo, coste, precio compra, costo unitario |
| `stock` | stock, existencia, existencias, cantidad, disponible |
| `category` | categoría, categoria, rubro, línea, linea |
| `brand` | marca, fabricante |
| `imageKey` | imagen, foto, url imagen, imagen url |
| `currency` | moneda, divisa |
| `attributes` | variante, variantes, talla, color, atributos |

```ts
// packages/contracts/src/catalogs/parse-amount.ts
export function parseAmountMinor(raw: string, currency: Currency): bigint {
  const cleaned = raw.replace(/[^\d.,-]/g, '').trim();
  if (!cleaned || !/\d/.test(cleaned)) throw new ParseError('INVALID_PRICE', raw);
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const normalized =
    decimalSeparator === ','
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  return toMinorAmount(normalized, currency);
}
```

Reglas adicionales: `trim` y colapso de espacios en `name`; `sku` se compara en mayúsculas;
si falta `currency` se usa la del catálogo; `stock` vacío significa “no controlado” (`null`).

### 8.5 Validaciones y cuarentena de filas

| Código | Severidad | Regla |
|---|---|---|
| `MISSING_SKU` | Error | SKU vacío |
| `DUPLICATE_SKU` | Error | SKU repetido dentro del archivo o de la versión |
| `MISSING_NAME` | Error | Nombre vacío |
| `MISSING_PRICE` | Error | Precio vacío |
| `INVALID_PRICE` | Error | Precio no numérico o negativo |
| `INVALID_STOCK` | Advertencia | Stock no entero; se importa como `null` |
| `IMAGE_DOWNLOAD_FAILED` | Advertencia | Imagen inaccesible; el producto se importa sin imagen |
| `UNSUPPORTED_PDF` | Error de job | PDF sin capa de texto |

Regla de tolerancia: las filas con error van a `import_row_issues` y **no** se importan; las
advertencias se importan con el dato corregido. Si más del 20 % de las filas tienen error, el
job pasa a `FAILED` con `IMPORT_REJECTED` para no activar un catálogo incompleto.

```ts
const errors = validateRows(rows, { existingSkus: new Set(), currency });
for (const issue of errors) {
  issues.push({ rowNumber: issue.rowNumber, severity: issue.severity, code: issue.code, message: issue.message, rawData: issue.raw });
}
await prisma.importRowIssue.createMany({ data: issues.map((issue) => ({ ...issue, importJobId: job.id })) });
if (errors.length / rows.length > 0.2) throw new AppException('IMPORT_REJECTED', 422, { errors: errors.length });
```

### 8.6 Imágenes a MinIO

- Se descarga `thumbnailLink` (o `webContentLink` si falta) a 800 px de ancho.
- Conversión a WebP con `sharp` (calidad 82) y subida con clave determinista
  `products/{catalogId}/{versionId}/{sha256}.webp` (§5.11).
- Si la imagen falla tras 2 reintentos: advertencia `IMAGE_DOWNLOAD_FAILED`, el import continúa.
- Concurrencia máxima 8 descargas por job para no saturar la API de Drive.

### 8.7 Creación y activación de `CatalogVersion`

```ts
await this.prisma.$transaction(async (tx) => {
  const version = await tx.catalogVersion.create({
    data: {
      catalogId,
      versionNumber: nextNumber,
      status: 'VALIDATED',
      currency,
      taxRateBp: 1300,
      taxIncluded: true,
      productCount: products.length,
      sourceFileId,
      sourceChecksum: checksum,
      importedAt: new Date(),
      validatedAt: new Date(),
      createdByUserId: userId,
    },
  });
  await tx.product.createMany({ data: products.map((product) => ({ ...product, catalogVersionId: version.id })) });
  await tx.catalogVersion.updateMany({
    where: { catalogId, status: 'ACTIVE' },
    data: { status: 'ARCHIVED', archivedAt: new Date() },
  });
  await tx.catalogVersion.update({ where: { id: version.id }, data: { status: 'ACTIVE', activatedAt: new Date() } });
  await tx.catalog.update({ where: { id: catalogId }, data: { activeVersionId: version.id } });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'catalog',
      aggregateId: catalogId,
      eventType: 'catalog.version.activated',
      payload: { catalogId, catalogVersionId: version.id, organizationId },
    },
  });
});
```

La activación se hace en una sola transacción: o queda el puntero, el estado y el evento, o
no queda nada (ADR-13). Los registros históricos conservan su `catalog_version_id` (R3).

### 8.8 Reintentos e idempotencia del pipeline

| Etapa | Reintentos | Idempotencia |
|---|---|---|
| Descarga de Drive | 3 (429/5xx) | `file_checksum` por catálogo |
| Parseo | 1 (determinista) | Snapshot inmutable en MinIO |
| Validación | 1 | Filas con error en cuarentena persistida |
| Inserción de productos | 3 por job | `@@unique([catalog_version_id, sku])` |
| Imágenes | 2 por imagen | Clave por SHA-256 (re-subir no duplica) |
| Activación | 1 | Transacción única + evento en outbox |

Un job atascado se reinicia desde `POST /api/v1/catalogs/:id/import/:jobId/retry`, que
reutiliza el snapshot ya descargado y no vuelve a consumir cuota de Drive.

## 9. Testing y calidad

### 9.1 Pirámide y herramientas

| Nivel | Proporción | Herramienta | Dónde | Tiempo objetivo |
|---|---|---|---|---|
| Unitario | ~70 % | Vitest | `*.spec.ts` junto al código | < 60 s todo |
| Integración | ~20 % | Vitest + Testcontainers (Postgres/Redis/MinIO) | `apps/api/test/*.e2e-spec.ts` | < 5 min |
| E2E UI | ~8 % | Playwright | `apps/web/e2e/*.spec.ts` | < 8 min |
| Carga | ~2 % | k6 | `tools/load/` | manual / semanal |

### 9.2 Casos de prueba obligatorios

| ID | Caso | Nivel | Criterio |
|---|---|---|---|
| T-01 | Aislamiento entre catálogos | Integración | Cotización del catálogo A no ve productos de B |
| T-02 | Aislamiento entre organizaciones | Integración | Usuario de org B recibe 404 en recursos de org A |
| T-03 | Idempotencia de webhook | Integración | Mismo `gateway_event_id` dos veces → un pago |
| T-04 | Totales de dinero | Unitario | IVA 13 %, descuentos y redondeo en CRC y USD con enteros |
| T-05 | Cuota de IA | Integración | Agotada la cuota → 429 sin llamada al proveedor |
| T-06 | Caché de IA | Integración | Repetición en 24 h → `cacheHit: true` y coste 0 |
| T-07 | Activación de versión | Integración | Activar v2 no altera pedidos de v1 |
| T-08 | Importación idempotente | Integración | Mismo archivo dos veces → un solo job y sin duplicados |
| T-09 | Paginación por cursor | Integración | Recorrer 3 páginas sin repetir ni omitir con inserciones concurrentes |
| T-10 | RBAC | Integración | Matriz rol × endpoint con 403/200 esperados |
| T-11 | Staff no puede usar la tienda | Integración | `403 AUTH_WRONG_AUDIENCE` en `/storefront/cart` |
| T-12 | Cliente no puede entrar al backoffice | Integración | `403 AUTH_WRONG_AUDIENCE` en `/orders`, `/admin/*` |
| T-13 | Permisos por rol | Integración | `vendedor` sin `finance:read` → 403; `finanzas` sin `order:create` → 403 |
| T-14 | Invitación de colaborador | E2E | invitar → email → aceptar → solo ve su catálogo |
| T-15 | Cliente compra y reclama cuenta | E2E | checkout invitado → reclama → ve su pedido en `/mi-cuenta` |

### 9.3 Cómo correr cada nivel

```bash
pnpm test                                     # unitarios de todo el monorepo
pnpm --filter @ventascatalogo/api test -- --coverage
pnpm --filter @ventascatalogo/web test        # unitarios de UI y hooks
pnpm --filter @ventascatalogo/api test:e2e    # Testcontainers (requiere Docker)
pnpm --filter @ventascatalogo/web exec playwright test --project=backoffice
pnpm --filter @ventascatalogo/web exec playwright test --project=tienda
k6 run tools/load/api-smoke.js               # carga contra staging
```

### 9.4 Gates de CI y cobertura

| Gate | Umbral | Dónde se configura |
|---|---|---|
| Lint + typecheck | 0 errores | `pnpm lint && pnpm typecheck` |
| Cobertura global | ≥ 60 % | `vitest.config.ts` (`coverage.thresholds`) |
| Cobertura de dominio (`catalogs`, `sales`, `payments`, `ai`) | ≥ 70 % | `vitest.config.ts` |
| Test de aislamiento | Obligatorio, no se puede omitir | `test/catalog-isolation.e2e-spec.ts` |
| Migraciones | `prisma migrate diff` sin deriva | job `quality` |
| Dependencias | 0 vulnerabilidades críticas | `pnpm audit --prod` |

### 9.5 Fixtures y datos de prueba

- `apps/api/test/fixtures/` con `org-a`, `org-b`, `catalog-v1.xlsx`, `catalog-v2.xlsx`,
  `catalog-duplicados.csv`, `productos.pdf`.
- Builders (`test/factories/`) con IDs deterministas para que los snapshots sean estables.
- Ninguna prueba usa datos de producción; prohibido `$queryRaw` con datos reales en tests.
- Cada test integración crea su esquema con Testcontainers y lo destruye al terminar.

### 9.6 E2E obligatorio de las dos caras (Playwright)

`apps/web/playwright.config.ts` define dos projects con `baseURL` distinto y usa el seed de
§6.4 (staff, cliente y usuario mixto):

| Project | baseURL | Specs obligatorios |
|---|---|---|
| `backoffice` | `http://app.localhost:3000` | `invite-collaborator.spec.ts`, `rbac-matrix.spec.ts`, `catalog-to-order.spec.ts` |
| `tienda` | `http://tienda.localhost:3000` | `guest-checkout.spec.ts`, `claim-account.spec.ts`, `customer-forbidden.spec.ts` |

| Flujo | Assertion principal |
|---|---|
| Invitar colaborador → login → panel | Solo ve los catálogos de su scope; el resto responde 404 |
| Cliente invitado compra → reclama cuenta | El pedido aparece en `/mi-cuenta/pedidos` con el mismo `orderId` |
| Cliente llama `/api/v1/admin/*` | `403 AUTH_WRONG_AUDIENCE` (sin filtrar datos) |
| Staff intenta usar carrito/checkout | `403 AUTH_WRONG_AUDIENCE` y sin cookie `vc_customer_at` |

```bash
pnpm --filter @ventascatalogo/web exec playwright test --project=backoffice
pnpm --filter @ventascatalogo/web exec playwright test --project=tienda
```

Los flujos compartidos (crear pedido, pagar, subir comprobante) se implementan como helpers
en `apps/web/e2e/fixtures/`; ningún spec depende del orden de ejecución de otro.

## 10. CI/CD y despliegue

> En CI y producción Prisma se invoca **directo** (`prisma migrate deploy`), sin `dotenv`,
> porque las variables llegan del entorno del job o del contenedor. `pnpm db:deploy` es solo
> para desarrollo/staging con `.env` local.

### 10.1 Workflow de GitHub Actions (`.github/workflows/ci.yml`)

```yaml
name: ci

on:
  push:
    branches: [main]
    tags: ["v*"]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "22"
  PNPM_VERSION: "9.15.4"

jobs:
  quality:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: vc
          POSTGRES_PASSWORD: vc_test
          POSTGRES_DB: ventascatalogo_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U vc -d ventascatalogo_test"
          --health-interval 5s --health-timeout 5s --health-retries 10
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s --health-timeout 3s --health-retries 10
    env:
      NODE_ENV: test
      DATABASE_URL: postgresql://vc:vc_test@localhost:5432/ventascatalogo_test?schema=public
      REDIS_URL: redis://localhost:6379
      JWT_ACCESS_SECRET: test-access-secret
      JWT_REFRESH_SECRET: test-refresh-secret
      ENCRYPTION_KEY: dGVzdC1rZXktMzItYnl0ZXMtcGFyYS1jaS1vbmx5ISE=
      AI_PROVIDER: mock
      EMAIL_PROVIDER: smtp
      SMTP_HOST: localhost
      SMTP_PORT: "1025"
      MINIO_ENDPOINT: localhost
      MINIO_PORT: "9000"
      MINIO_USE_SSL: "false"
      MINIO_ACCESS_KEY: test
      MINIO_SECRET_KEY: test
      MINIO_BUCKET_PRODUCTS: vc-products
      MINIO_BUCKET_DOCS: vc-docs
      MINIO_BUCKET_PUBLIC: vc-public
      EMAIL_FROM: test@ventascatalogo.local
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm --filter @ventascatalogo/api exec prisma migrate deploy
      - run: pnpm lint
      - run: pnpm --filter @ventascatalogo/api typecheck
      - run: pnpm --filter @ventascatalogo/web typecheck
      - run: pnpm --filter @ventascatalogo/api test -- --coverage
      - run: pnpm --filter @ventascatalogo/web test
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: apps/api/coverage
          retention-days: 7

  images:
    needs: quality
    if: github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        app: [api, web]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}/${{ matrix.app }}
          tags: |
            type=sha
            type=ref,event=branch
            type=semver,pattern={{version}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: apps/${{ matrix.app }}/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          build-args: |
            NEXT_PUBLIC_API_URL=${{ vars.NEXT_PUBLIC_API_URL }}
            NEXT_PUBLIC_SOCKET_URL=${{ vars.NEXT_PUBLIC_SOCKET_URL }}
            NEXT_PUBLIC_STAFF_URL=${{ vars.NEXT_PUBLIC_STAFF_URL }}
            NEXT_PUBLIC_TIENDA_URL=${{ vars.NEXT_PUBLIC_TIENDA_URL }}
          cache-from: type=gha,scope=${{ matrix.app }}
          cache-to: type=gha,mode=max,scope=${{ matrix.app }}

  deploy:
    needs: images
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/ventascatalogo
            export IMAGE_TAG=${{ github.ref_name }}
            export GITHUB_REPOSITORY=${{ github.repository }}
            docker compose -f infra/docker/docker-compose.prod.yml pull
            docker compose -f infra/docker/docker-compose.prod.yml run --rm api npx prisma migrate deploy
            docker compose -f infra/docker/docker-compose.prod.yml up -d --remove-orphans
            for i in $(seq 1 30); do
              curl -fsS https://api.ventascatalogo.example/api/v1/health/ready && exit 0
              sleep 5
            done
            echo "health check falló" && exit 1
```

### 10.2 Dockerfiles multi-stage

`apps/api/Dockerfile` (imagen de producción con `tini` y usuario sin privilegios):

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @ventascatalogo/api prisma:generate
RUN pnpm --filter @ventascatalogo/api build

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl tini \
  && addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /repo/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/api ./apps/api
COPY --from=build --chown=app:app /repo/packages ./packages
WORKDIR /app/apps/api
USER app
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
```

`apps/web/Dockerfile` (Next.js `output: "standalone"`):

```dockerfile
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages ./packages
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_STAFF_URL
ARG NEXT_PUBLIC_TIENDA_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_STAFF_URL=$NEXT_PUBLIC_STAFF_URL
ENV NEXT_PUBLIC_TIENDA_URL=$NEXT_PUBLIC_TIENDA_URL
RUN pnpm --filter @ventascatalogo/web build

FROM node:22-alpine AS runtime
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

`apps/web/next.config.ts` requiere:

```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  transpilePackages: ['@ventascatalogo/ui', '@ventascatalogo/contracts'],
};

export default nextConfig;
```

### 10.3 Compose de producción y TLS con Caddy

`infra/docker/docker-compose.prod.yml` (sin puertos públicos salvo Caddy; secretos por
`env_file`; imágenes por tag inmutable):

```yaml
name: ventascatalogo

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    env_file: ../../.env.production
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb", "--maxmemory-policy", "noeviction"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10

  minio:
    image: ${MINIO_IMAGE:-minio/minio:latest}
    restart: unless-stopped
    command: ["server", "/data", "--console-address", ":9001"]
    env_file: ../../.env.production
    ports:
      - "127.0.0.1:9000:9000"   # solo loopback: backup con mc en el propio VPS
    volumes:
      - miniodata:/data

  api:
    image: ghcr.io/${GITHUB_REPOSITORY}/api:${IMAGE_TAG}
    restart: unless-stopped
    env_file: ../../.env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    expose:
      - "3001"
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 5

  web:
    image: ghcr.io/${GITHUB_REPOSITORY}/web:${IMAGE_TAG}
    restart: unless-stopped
    env_file: ../../.env.production
    depends_on:
      - api
    expose:
      - "3000"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ../caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - api
      - web

volumes:
  pgdata:
  redisdata:
  miniodata:
  caddy_data:
  caddy_config:
```

`infra/caddy/Caddyfile` — tres hosts al mismo stack: `api.` al backend, `app.` y `tienda.` a
la misma imagen web (el middleware de Next resuelve la cara por `Host`):

```caddyfile
(security_headers) {
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		Referrer-Policy "strict-origin-when-cross-origin"
	}
}

api.{$DOMAIN} {
	encode zstd gzip
	import security_headers
	reverse_proxy api:3001
}

app.{$DOMAIN} {
	encode zstd gzip
	import security_headers
	reverse_proxy web:3000
}

tienda.{$DOMAIN} {
	encode zstd gzip
	import security_headers
	reverse_proxy web:3000
}
```

### 10.4 Despliegue en VPS (primera vez y releases)

1. VPS Ubuntu 24.04 LTS, 4 vCPU/8 GB, Docker Engine + Compose v2, usuario `deploy` con
   acceso SSH por llave y `ufw allow 22,80,443/tcp`.
2. Clonar el repo en `/opt/ventascatalogo` y crear `/opt/ventascatalogo/.env.production`
   (mismas variables de §3.2, con `NODE_ENV=production`, `EMAIL_PROVIDER=resend`,
   `MINIO_USE_SSL=false` dentro de la red y `API_PUBLIC_URL=https://api.<dominio>`), más
   `DOMAIN=ventascatalogo.com` y `MINIO_IMAGE=minio/minio:<tag-fijado>`. Configurar en
   GitHub → *Variables* los `NEXT_PUBLIC_*` que consume el build de la imagen web.
3. DNS: `A app.<dominio> → IP`, `A tienda.<dominio> → IP` y `A api.<dominio> → IP`; Caddy
   emite un certificado por host al primer arranque. `AUTH_COOKIE_DOMAIN=.ventascatalogo.com`
   en producción, vacío en desarrollo (cookies host-only por cara).
4. Release por tag `v*` (lo hace CI, §10.1) o manual:

   ```bash
   cd /opt/ventascatalogo
   export IMAGE_TAG=v1.0.0
   export GITHUB_REPOSITORY=<organizacion>/ventascatalogo
   docker compose -f infra/docker/docker-compose.prod.yml pull
   docker compose -f infra/docker/docker-compose.prod.yml run --rm api npx prisma migrate deploy
   docker compose -f infra/docker/docker-compose.prod.yml up -d --remove-orphans
   curl -fsS https://api.ventascatalogo.example/api/v1/health/ready
   ```

5. Verificación posterior: login, listado de productos, generación de un post en staging,
   envío de correo real, webhook de Stripe en modo live.

### 10.5 Backups

```bash
#!/usr/bin/env bash
# infra/scripts/backup.sh — ejecutar con cron/systemd timer diario a las 03:00 UTC
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=${BACKUP_DIR:-/opt/ventascatalogo/backups}
COMPOSE=/opt/ventascatalogo/infra/docker/docker-compose.prod.yml
set -a; source /opt/ventascatalogo/.env.production; set +a

mkdir -p "$BACKUP_DIR"
docker compose -f "$COMPOSE" exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$BACKUP_DIR/db-$STAMP.dump"
mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc mirror --overwrite local/vc-docs "$BACKUP_DIR/docs"
mc mirror --overwrite local/vc-products "$BACKUP_DIR/products"
find "$BACKUP_DIR" -type f -mtime +14 -delete
```

- Retención: 14 días locales + copia semanal cifrada fuera del VPS (`rclone copy` a Backblaze
  B2 o S3 con cifrado del lado del cliente).
- Prerrequisito: `mc` (cliente de MinIO) instalado en el VPS; el puerto `9000` de MinIO está
  expuesto solo en loopback para que el backup no salga por Internet.
- `infra/systemd/vc-backup.timer` dispara `backup.sh` todos los días; `OnFailure` envía alerta.
- Restauración ensayada mensualmente en staging:

  ```bash
  docker compose -f "$COMPOSE" exec -T postgres pg_restore -U vc -d ventascatalogo --clean --if-exists \
    < backups/db-20261101T030000Z.dump
  mc mirror backups/docs local/vc-docs
  ```

  RPO objetivo: 24 h. RTO objetivo: 2 h. Ambos se miden y se anotan en el runbook de §11.

### 10.6 Rollback

| Escenario | Acción | Tiempo |
|---|---|---|
| Bug de aplicación | `IMAGE_TAG=<tag-anterior> docker compose ... up -d` | < 3 min |
| Migración compatible | Redeploy de la imagen anterior (la migración aditiva se queda) | < 3 min |
| Migración destructiva | Restaurar `pg_dump` previo + deploy de imagen anterior | 30–120 min |
| Error de configuración | Revertir `.env.production` y `docker compose up -d api web` | < 5 min |
| Incendio total | VPS nuevo + restore de backup + DNS + `.env.production` | 2–4 h |

Reglas: nunca `prisma migrate reset` ni `db push` en producción; toda migración destructiva
exige backup verificado antes; el rollback se anota en `audit_log` operativo y en el canal de
incidentes.

### 10.7 Checklist de producción y de seguridad

Checklist de salida a producción:

- [ ] DNS y TLS activos en `app.`, `tienda.` y `api.`; renovación automática de Caddy verificada.
- [ ] `AUTH_STAFF_AUDIENCE` y `AUTH_CUSTOMER_AUDIENCE` configuradas; un token de cliente
      contra `/api/v1/admin/*` devuelve `403 AUTH_WRONG_AUDIENCE`.
- [ ] Smoke de las dos caras: staff opera el backoffice y un cliente compra, paga y consulta
      su pedido en `/mi-cuenta`.
- [ ] `.env.production` completo, con secretos generados y rotados al menos una vez.
- [ ] Migraciones aplicadas con `prisma migrate deploy` y backup previo.
- [ ] `/health` y `/health/ready` en verde desde fuera del VPS.
- [ ] Backups diarios ejecutados y **restauración de prueba** documentada.
- [ ] Alertas configuradas (§11.5) y probadas con un incidente simulado.
- [ ] Email transaccional con SPF, DKIM y DMARC; `EMAIL_FROM` del dominio.
- [ ] Plantillas de WhatsApp aprobadas y webhooks de pago apuntando a producción.
- [ ] Rate limits y WAF del proveedor revisados; `CORS_ORIGINS` solo el dominio real.
- [ ] Logs de 30 días y Sentry con alertas a persona de guardia.
- [ ] Checklist de seguridad completo (abajo) y firmado por el lead.

Checklist de seguridad:

- [ ] HTTPS obligatorio, HSTS, cookies `Secure`, `HttpOnly` y `SameSite=Lax`.
- [ ] Contraseñas con argon2id y política mínima de 12 caracteres.
- [ ] JWT con secretos aleatorios de 48 bytes y rotación de refresh tokens.
- [ ] `ENCRYPTION_KEY` fuera del repo; refresh tokens de Google cifrados en reposo.
- [ ] Scopes OAuth mínimos (`drive.readonly`) y consentimiento por organización.
- [ ] Firmas de webhook verificadas para Stripe, MercadoPago, PayPal y WhatsApp.
- [ ] RBAC probado por rol y scope; aislamiento entre organizaciones en CI (T-01, T-02).
- [ ] Validación de entrada con Zod/class-validator en todos los endpoints.
- [ ] Rate limit por IP y por organización en auth, IA y pagos.
- [ ] Sin PII ni secretos en logs (redacción de pino verificada).
- [ ] CSP y cabeceras de seguridad en web; dependencias sin críticas (`pnpm audit --prod`).
- [ ] Backup cifrado, acceso al VPS solo por llave y MFA en GitHub/Google/Stripe.
- [ ] Revisión trimestral de accesos y rotación de claves documentada.
- [ ] Pruebas T-11 a T-15 (audiencias, permisos, invitación, reclamo de cuenta) en verde.
- [ ] Portal del cliente sin rutas ni datos de backoffice; `customer_id` filtrado en repositorio.

## 11. Observabilidad y operación

### 11.1 Logs estructurados con pino

```ts
// apps/api/src/observability/logger.config.ts
export const loggerConfig = {
  pinoHttp: {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.refreshToken',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    genReqId: (req: IncomingMessage, res: ServerResponse): string => {
      const traceId = (req.headers['x-trace-id'] as string) ?? randomUUID();
      res.setHeader('x-trace-id', traceId);
      return traceId;
    },
    transport: process.env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
  },
};
```

Todo log de error incluye `traceId`, `organizationId`, `catalogId` y `route`; el filtro de
§5.5 devuelve el mismo `traceId` al cliente para correlacionar con Sentry.

### 11.2 Sentry

```ts
// apps/api/src/observability/sentry.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN_API,
  environment: process.env.SENTRY_ENVIRONMENT ?? 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  beforeSend(event) {
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
});
```

En web, `apps/web/src/instrumentation.ts` inicializa `@sentry/nextjs` en servidor y
`instrumentation-client.ts` en navegador; el `NEXT_PUBLIC_SENTRY_DSN` es público por diseño.

### 11.3 Health checks

| Endpoint | Qué verifica | Respuesta |
|---|---|---|
| `GET /api/v1/health` | Proceso vivo | `200 { status, version, uptimeSeconds }` |
| `GET /api/v1/health/ready` | Postgres, Redis, MinIO y colas | `200` si todos `up`; `503` con detalle |
| `GET /api/v1/metrics` | Métricas Prometheus (protegido por token) | texto plano |

`/health/ready` usa timeout de 2 s por dependencia y no consulta datos de negocio.

### 11.4 Métricas de negocio y de IA

| Métrica | Tipo | Uso |
|---|---|---|
| `vc_orders_created_total{currency}` | contador | Volumen de ventas |
| `vc_gmv_minor_total{currency}` | contador | Ingreso bruto |
| `vc_payments_confirmed_total{provider}` | contador | Efectividad de cobro |
| `vc_quote_conversion_ratio` | gauge | Cotizaciones → pedidos |
| `vc_ai_tokens_total{feature,model}` | contador | Consumo de IA |
| `vc_ai_cost_micro_usd_total{organization}` | contador | Coste real por organización |
| `vc_ai_quota_used_ratio{organization}` | gauge | Riesgo de bloqueo por cuota |
| `vc_import_rows_quarantined_total` | contador | Calidad de catálogos |
| `vc_queue_depth{queue}` | gauge | Saturación de workers |
| `vc_dlq_size` | gauge | Jobs fallidos permanentes |

### 11.5 Alertas mínimas

| Alerta | Condición | Severidad | Acción |
|---|---|---|---|
| API caída | `/health` falla 3 veces seguidas | Crítica | Aplicar §11.6.1 |
| Errores 5xx | > 1 % en 5 min | Alta | Revisar Sentry y último deploy |
| Latencia API | p95 > 1 000 ms en 10 min | Media | Revisar DB y colas |
| Cola saturada | `vc_queue_depth > 500` en 10 min | Media | Escalar worker o pausar importación |
| DLQ con jobs | `vc_dlq_size > 0` | Alta | Revisar runbook §11.6.5 |
| Cuota IA | `used_ratio > 0.8` | Media | Avisar al cliente y ofrecer plan |
| Espacio en disco | > 80 % | Alta | Limpiar backups/imágenes |
| Backup viejo | último backup > 26 h | Crítica | Ejecutar backup manual |
| Postgres conexiones | > 80 % del máximo | Alta | Revisar pool y consultas lentas |
| Intentos de cruce de caras | `AUTH_WRONG_AUDIENCE` > 20 en 5 min | Media | Revisar cookies/URLs y bloquear IP |

### 11.6 Runbook de incidentes comunes

**11.6.1 Webhook de pago caído.** Síntoma: pedidos quedan en `PENDING_PAYMENT` aunque el
cliente pagó. Diagnóstico: `docker compose logs --since=30m api | grep -i webhook`; revisar
`payment_webhook_events` sin `processed_at`. Acción: 1) verificar secreto y URL en el panel
del proveedor; 2) reenviar eventos desde el panel (Stripe CLI `stripe events resend <id>`);
3) ejecutar conciliación manual `POST /api/v1/payments/reconcile?since=<fecha>`; 4) si el
secreto cambió, rotarlo y redesplegar. Prevención: reconciliación programada cada 15 min y
alerta de eventos sin procesar > 10.

**11.6.2 Redis caído.** Síntoma: IA, PDFs y webhooks dejan de procesarse; `/health/ready` en
503 con `redis: down`. Diagnóstico: `docker compose ps redis` y `docker compose logs redis`.
Acción: 1) reiniciar `docker compose restart redis`; 2) verificar `maxmemory` y política
`noeviction`; 3) revisar disco del VPS; 4) las colas con AOF se recuperan, los jobs en vuelo
se reintentan desde la DLQ. Prevención: `appendonly yes` y alarma de memoria.

**11.6.3 Cuota de IA agotada.** Síntoma: `AI_QUOTA_EXCEEDED` en el panel. Diagnóstico:
`SELECT SUM(tokens_in+tokens_out) FROM ai_usage_ledger WHERE organization_id=$1 AND created_at >= date_trunc('month', now());`.
Acción: 1) informar al cliente; 2) si es error de coste, revisar `cacheHit` y prompts;
3) el superadmin ajusta `ai_monthly_quota_tokens` (con auditoría); 4) nunca desactivar la
cuota en producción sin aprobación del lead. Prevención: alerta al 80 % y revisión semanal.

**11.6.4 Importación atascada.** Síntoma: `ImportJob` en `DOWNLOADING`/`PARSING` por > 15 min.
Diagnóstico: consultar el job y `docker compose logs api | grep import`; ver cuota de Drive.
Acción: 1) `POST /catalogs/:id/import/:jobId/retry`; 2) si el archivo cambió, reimportar
creando nueva versión; 3) si Drive devuelve 403, reconectar OAuth; 4) cancelar jobs zombis
marcándolos `FAILED` con auditoría. Prevención: timeout por etapa y alerta de jobs > 30 min.

**11.6.5 DLQ con jobs.** Diagnóstico: `GET /api/v1/admin/dlq` (superadmin). Acción: revisar
`error`, corregir la causa y `job.retry()` desde el panel; si el payload es inválido, marcarlo
como descartado con motivo en `audit_log`. Prevención: tests de contrato y límites por job.

**11.6.6 MinIO no responde.** Síntoma: imágenes y PDFs dan 502/URL inválida. Diagnóstico:
`docker compose logs minio` y `mc admin info local`. Acción: reiniciar el servicio, verificar
volumen y disco; si el volumen se corrompió, restaurar desde backup (§10.5). Prevención:
backup diario y healthcheck de escritura cada 5 min.

**11.6.7 Soporte de acceso de clientes.** El staff con permiso `user:manage` atiende estos
casos desde `Panel → Usuarios → Soporte`; toda acción queda en `audit_log` con `traceId`:

| Situación | Acción (nunca compartir contraseñas) | Mecanismo |
|---|---|---|
| No recibió verificación | Reenviar verificación; el token anterior se invalida | `POST /api/v1/admin/users/:id/resend-verification` |
| Olvidó contraseña | Enviar magic link de recuperación (20 min, un solo uso) | `/mi-cuenta/recuperar` |
| Cuenta bloqueada | Desbloquear con motivo y reiniciar contador de intentos | `POST /api/v1/admin/users/:id/unlock` |
| Sesión sospechosa | Revocar todas las `AuthSession` del usuario y forzar nuevo login/MFA | `Panel → Usuarios → Sesiones` |
| Cliente sin `CustomerAccount` | Vincular a su `Customer` existente; nunca duplicar la ficha | `POST /api/v1/admin/customers/:id/link-account` |
| Invitación expirada | Reenviar invitación (token nuevo invalida el anterior) | `Panel → Usuarios → Invitaciones` |

Reglas: la respuesta de soporte no revela si un email existe; no se comparten enlaces de
sesión; la impersonación no está habilitada en el MVP (fase 3, con auditoría y consentimiento).

**11.6.8 Baja y anonimización de datos (Ley 8968).** Procedimiento con aprobación del DPO:

1. Verificar identidad del solicitante (email verificado + último pedido) y registrar la
   solicitud en `audit_log` (`action = data.deletion.requested`).
2. Revocar `AuthSession`, `VerificationToken` y `UserInvitation`; pasar `User.status` a
   `SUSPENDED` con 7 días de gracia y luego a `DELETED` (job `user.purge`).
3. Anonimizar `User`: email `anon-<uuid>@invalid`, nombre “Cliente anonimizado”, teléfono y
   `passwordHash`/`mfaSecretEnc` a `null`. Conservar `id` para integridad referencial.
4. Anonimizar `Customer`: `name`, `taxId`, `email`, `phone` y `address` a `null`; conservar
   `id`. Direcciones (`Address`) se eliminan físicamente.
5. **No** borrar `Order`, `Quote`, `Payment` ni `Expense`: son históricos contables y se
   retienen 5 años; se anonimiza el vínculo personal, no el dinero.
6. Eliminar de MinIO avatares y adjuntos no contables; los comprobantes exigidos por la ley
   se conservan con acceso restringido.
7. Registrar `action = user.anonymized` con `traceId`, responder al titular y actualizar el
   registro de consentimientos (`Consent`) sin borrarlos.

Prevención: retención documentada, backups incluidos en la baja (el backup rota en 14 días) y
revisión trimestral de solicitudes por el DPO.

## 12. Plan de trabajo de 15 semanas

### 12.1 Supuestos de capacidad y cronograma

| Escenario | Semanas | Dotación | Capacidad | Alcance Must | Ocupación | Buffer |
|---|---|---|---|---|---|---|
| **Base (aprobado)** | 15 | 1,5 dev | 15 × 5 × 1,5 = **112,5 dp** | **98,5 dp** (chat M6, exportación XLSX y reparación de imágenes a F5) | **87,6 %** | **≈14 dp** |
| Variante rápida | 14 | 2 devs en F1–F3, 1,5 en F0/F4 | 140 dp | **106,5 dp** (todo el Must) | 76 % (Must+Should 134/140 = 96 %) | 33,5 dp |
| Un solo dev | 20–22 | 1 dev | 100–110 dp | 98,5 dp | 90–98 % | ≈2–12 dp, sin holgura real |

El desglose de épicas y el cálculo completo están en `docs/02-ANALISIS.md §10.6`; aquí solo se
fija la decisión. **Base:** 15 semanas con 1,5 dev y tres ítems diferidos a F5 sin recortar
módulos del MVP. **Variante:** 2 devs en F1–F3 comprimen a 14 semanas con todo el Must. Con
1 dev se comunica 20–22 semanas o se aplica el recorte; nunca se prometen 14 semanas con 1,5.

Criterio de recorte ante desvío (en este orden, con aprobación del cliente y registro en el
acta de la fase; no se esconde en el código):

1. Chat en vivo M6 — **ya está en F5**; su spec no se toca.
2. Exportaciones avanzadas (XLSX con formato, reportes programados) → F5.
3. Reparación automática de imágenes (mejora de fotos) → F5.
4. MFA opcional **solo para staff no-admin** (org_admin y superadmin mantienen TOTP obligatorio).

Todo recorte se anota como riesgo en el acta de la fase y en `docs/05-IDEAS.md`.

### 12.2 Tabla semanal

| Semana | Fase | Objetivo | Entregable | Demo / validación | Dotación |
|---|---|---|---|---|---|
| 1 | F0 | Monorepo, Docker, CI y modelo de usuarios/roles (ADR-18) | Migración de identidad, roles, permisos y sesiones | Dev nuevo levanta el entorno y el seed crea 3 usuarios | 1,5 dev |
| 2 | F0 | Auth por audiencia, guards, invitación/MFA y dos shells Next | `v0.1.0` con login staff y cliente | **Dos caras:** staff en el panel, cliente en el portal | 1,5 dev |
| 3 | F1 | OAuth Drive y descarga snapshot | Conexión de una carpeta real | Conectar Drive y listar archivos | 1,5 dev (2 en variante 14) |
| 4 | F1 | Parseo, normalización y cuarentena | Importación de Excel/CSV/Sheets | Importar catálogo real con filas en cuarentena | ídem |
| 5 | F1 | Versionado y activación | `CatalogVersion` con estados | Activar v2 sin romper v1 | ídem |
| 6 | F1 | Productos, cotizaciones, PDF y tienda pública con carrito | Venta staff + compra de invitado | Cotizar/PDF en backoffice; comprar en `tienda.` como invitado | ídem |
| 7 | F2 | Link de pago y webhook Stripe | Cobro en modo test | Cliente paga y el pedido se marca pagado | 1,5 dev (2 en variante 14) |
| 8 | F2 | Gastos, márgenes, reportes y portal “Mi cuenta” | Panel financiero + portal del cliente | Cliente ve su pedido y recibo; staff ve el mismo pago | ídem |
| 9 | F2 | Recordatorios, conciliación y reclamo de cuenta | Jobs + portal completo | **Invitado → cuenta:** reclama y ve su historial | ídem |
| 10 | F3 | IA social (prompts, streaming, cuotas) | Generación de posts | Generar 3 posts con coste visible | 1,5 dev (2 en variante 14) |
| 11 | F3 | Historial, aprobación y calendario editorial | Calendario | Aprobar y programar contenido desde backoffice | ídem |
| 12 | F3 | WhatsApp (plantillas, ventana 24 h, bandeja) y spec de chat congelada | Mensajería operativa | Enviar plantilla a sandbox y ver historial | ídem |
| 13 | F4 | Seguridad, RBAC por permisos, auditoría y E2E de dos caras | Checklist de seguridad firmado | E2E `backoffice` + `tienda`; k6 50 VU | 1,5 dev |
| 14 | F4 | Observabilidad, backups, despliegue en VPS y runbooks | Staging/producción con TLS y alertas | Staff y cliente operan en producción | 1,5 dev |
| 15 | F4 | Buffer de cierre, correcciones de demo y release | `v1.0.0` en VPS con `app.`, `tienda.` y `api.` | **Demo final dos caras + invitado→cuenta** | 1,5 dev |

F5 (post-MVP, semana 16+): chat en vivo M6 (4 dp), exportación XLSX (2 dp), reparación
automática de imágenes (2 dp) y las ideas priorizadas de `docs/05-IDEAS.md`. El brief sigue
intacto: esas capacidades se entregan, solo cambian de fase.

Ceremonias: daily de 15 min; demo de 30 min cada viernes con **las dos caras** (login staff,
login cliente y flujo invitado→cuenta); retro al final de cada fase; el usuario piloto valida
al final de F1, F2, F3 y F4. Cada semana termina con un PR mergeado a `main`, CI verde y tag
si cierra fase. El buffer de la semana 15 no se usa para adelantar alcance.

## 13. Checklist de arranque y comandos de referencia

### 13.1 Checklist del nuevo desarrollador (primera mañana)

- [ ] Leí `docs/00-BRIEF.md` y `docs/01-CONTEXTO-Y-DECISIONES.md` (ADR-01..ADR-16 y R1–R7).
- [ ] Node 22, pnpm 9.15, Docker Desktop, Git y PowerShell 7 instalados y verificados (§1.3).
- [ ] Repo clonado y `pnpm install` terminado sin errores.
- [ ] `.env` creado, secretos de JWT/ENCRYPTION generados, `apps/web/.env.local` creado.
- [ ] `pnpm infra:up` con Postgres, Redis, MinIO y Mailpit en `healthy`.
- [ ] `pnpm db:generate && pnpm db:migrate && pnpm db:seed` ejecutados; `.env.seed` con las
      credenciales de los tres usuarios demo.
- [ ] `pnpm dev` levanta API en `3001` y web en `3000`.
- [ ] `/health` y `/health/ready` responden `ok`.
- [ ] Login staff en http://app.localhost:3000 con `admin@ventascatalogo.local` / `Demo1234!`
      y dashboard con 12 productos.
- [ ] Login cliente en http://tienda.localhost:3000/mi-cuenta/entrar con
      `cliente@ventascatalogo.local` / `Demo1234!` y solo sus pedidos.
- [ ] Usuario `mixto@ventascatalogo.local` entra como vendedor en la org A y como cliente en
      la org B (aislamiento entre caras y organizaciones).
- [ ] Correo de bienvenida visible en http://localhost:8025 y buckets en http://localhost:9001.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` en verde.
- [ ] Leí §5 (patrones) y §6 (modelo de datos) antes del primer PR.
- [ ] Acceso pedido a GitHub, Google Cloud, DeepSeek, Stripe test y VPS (si aplica).

### 13.2 Comandos de referencia rápida

| Necesidad | Comando |
|---|---|
| Levantar infraestructura | `pnpm infra:up` |
| Ver estado de contenedores | `docker compose ps` |
| Reiniciar todo el entorno | `pnpm infra:reset` |
| Arrancar API + web | `pnpm dev` |
| Migrar y sembrar | `pnpm db:migrate && pnpm db:seed` |
| Abrir Prisma Studio | `pnpm db:studio` |
| Ver logs de la API | `docker compose logs -f api` |
| Correr unitarios | `pnpm test` |
| Correr integración | `pnpm --filter @ventascatalogo/api test:e2e` |
| Correr E2E UI | `pnpm --filter @ventascatalogo/web exec playwright test` |
| E2E solo backoffice | `pnpm --filter @ventascatalogo/web exec playwright test --project=backoffice` |
| E2E solo tienda/portal | `pnpm --filter @ventascatalogo/web exec playwright test --project=tienda` |
| Abrir backoffice / tienda | http://app.localhost:3000/login · http://tienda.localhost:3000 |
| Verificar salud | `curl http://localhost:3001/api/v1/health/ready` |
| Reenviar webhook Stripe | `stripe listen --forward-to localhost:3001/api/v1/payments/webhook/stripe` |
| Aplicar migraciones en prod | `docker compose -f infra/docker/docker-compose.prod.yml run --rm api npx prisma migrate deploy` |
| Backup manual | `bash infra/scripts/backup.sh` |
| Ver logs estructurados | `docker compose logs -f api --tail=200` |

Referencias: `docs/01-CONTEXTO-Y-DECISIONES.md` (decisiones), `docs/03-SPEC.md` (requisitos
y API), `docs/05-IDEAS.md` (backlog F5), `README.md` (resumen de arranque).

