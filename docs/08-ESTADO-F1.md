---
title: Estado de implementación — F1 (incremento catálogo e importación)
tipo: bitacora
estado: en-curso
fase: F1
version: 0.2.0
fecha: 2026-10-28
idioma: es-CR
---

# Estado de implementación — F1

Bitácora del primer incremento de F1 (`docs/04-GUIA-IMPLEMENTACION.md` §4.2). El resto de F1
(sales, PDF, tienda con carrito, portal y PWA) queda planificado abajo.

## 1. Qué quedó entregado

| Tarea de F1 | Estado | Nota |
|---|---|---|
| F1.3 Versionado `draft → validated → active → archived` | ✅ | Activación atómica por puntero + archivo de la versión anterior |
| F1.4 Pipeline de importación (CSV/XLSX) | ✅ | Checksum → snapshot MinIO → parseo → normalización → validación → cuarentena |
| F1.5 Mapeo de columnas | ✅ | Auto-detección por sinónimos + override explícito desde la UI |
| F1.6 Productos por versión con cursor | ✅ | Búsqueda `q` (SKU/nombre), filtros categoría/marca, nunca mezcla versiones |
| F1.9 Catálogo público `/c/[slug]` | ✅ (F0) | Ya existente; sigue sirviendo la versión activa |
| F1.1/F1.2 Google Drive (OAuth + cliente) | ⏸️ | Requiere credenciales de Google Cloud del usuario; contrato listo para conectar |
| F1.4 Drive (descarga/snapshot remoto) | ⏸️ | El pipeline ya acepta un buffer; falta el origen Drive |
| F1.7/F1.8 Cotizaciones, pedidos y PDF | ⏳ | Siguiente incremento |
| F1.10–F1.13 Tienda, carrito, portal, PWA | ⏳ | Siguiente incremento |

## 2. API nueva (staff, `catalog:read` / `catalog:write`)

| Método y ruta | Resultado |
|---|---|
| `GET /catalogs/:catalogId/versions` | Versiones desc por número, con estado, productos e instantes |
| `POST /catalogs/:catalogId/imports` | Multipart `file` (CSV/XLSX ≤10 MB) + `currency`, `taxRateBp`, `taxIncluded`, `mapping`. **201** nuevo · **200** idempotente |
| `GET /catalogs/:catalogId/imports/:jobId` | Resultado completo con cuarentena |
| `POST .../versions/:versionId/activate` | Transacción: anterior `ARCHIVED`, nueva `ACTIVE`, puntero actualizado |
| `POST .../versions/:versionId/validate` · `/archive` | Transiciones del ciclo de vida |
| `GET /products?catalogId&versionId?&q?&category?&brand?&includeInactive?&cursor&limit` | `ProductListResponse` con `versionNumber` y `nextCursor` |

Códigos de error nuevos (ya en `packages/contracts`): `INVALID_IMPORT_FILE`,
`UNSUPPORTED_FILE_TYPE`, `EMPTY_IMPORT`, `VERSION_NOT_ACTIVATABLE`, `NO_ACTIVE_VERSION`.

## 3. Evidencia de verificación (ejecutada sobre la API real)

```text
Importar tools/fixtures/catalogo-demo.csv (42 filas de datos)
  → 201 · v2 VALIDATED · total 42 · 37 productos · 5 en cuarentena
  → issues: DUPLICATE_SKU ×3, MISSING_PRICE ×2
Reimportar el mismo archivo → 200 · idempotent=true · mismo catalogVersionId · 0 duplicados
Activar v2 → v2 ACTIVE · v1 ARCHIVED · Catalog.activeVersionId = v2
GET /products (sin versionId) → versionNumber=2 · 37 productos en 4 páginas de 10 · sin solapes
GET /products?versionId=v1   → versionNumber=1 · 12 productos (histórico intacto)
GET /products?q=Producto 3   → 9 coincidencias (contiene, insensible a mayúsculas)
UI /panel/catalogos           → 200 con "Versiones e importar"
UI /panel/catalogos/{id}      → 200 con tabla de versiones (ACTIVE/ARCHIVED), importador y cuarentena
UI /panel/productos?catalogo= → 200 con SKU-001, filtros y "Cargar más"
```

Pruebas automáticas: **65 unitarios** (antes 36) y **27 e2e** (antes 16) en `apps/api`, incluidos
importación real, idempotencia, activación con histórico, cursor, 404 multi-organización,
403 de audiencia y errores 400/409 de archivo y versión.

## 4. Decisiones tomadas

1. **Códigos de error promovidos al contrato**: los 5 códigos de F1 se agregaron a
   `packages/contracts/src/common/error-codes.ts`; `apps/api/src/common/errors/api-error-codes.ts`
   queda como subconjunto tipado sin casts.
2. **`/products` exige `catalogId` explícito**: se retiró la dependencia del header
   `X-Catalog-Id`. La web ya usa query params (`catalogId`, `versionId`).
3. **Archivar la versión ACTIVE** limpia `Catalog.activeVersionId` (catálogo sin versión activa;
   `/products` responde `409 NO_ACTIVE_VERSION`). Queda anotado frente a `ERR-047` del SPEC.
4. **Snapshot en MinIO best-effort**: checksum e idempotencia viven en la base de datos; si el
   almacenamiento falla, la importación continúa con warning (no se pierde el dato de negocio).
5. **CSV se decodifica a UTF-8 antes de SheetJS** (evita mojibake con acentos) y se parsea con
   `raw:false` para conservar separadores de miles; XLSX va por buffer.
6. **Seed no destructivo**: antes volvía a marcar la versión demo como `ACTIVE` y movía
   `activeVersionId`, dejando dos versiones activas a la vez. Ahora solo activa la demo si el
   catálogo no tiene versión activa; si ya tiene una, la demo queda `ARCHIVED` y el puntero no se
   toca. Al activar la demo archiva cualquier otra `ACTIVE` para mantener la invariante
   «una sola versión activa por catálogo».
7. **MFA de demo reiniciable**: el seed limpia `mfaEnabled`/`mfaSecretEnc` de los usuarios demo y
   se añadió `pnpm --filter @ventascatalogo/api mfa:dev reset|code <email>` para demos y pruebas
   (`apps/api/scripts/mfa-dev.ts`, solo desarrollo).
8. **Autocompletado del MFA en desarrollo**: la web genera el TOTP del enrolamiento con WebCrypto
   (RFC 6238) y, en logins posteriores, lo pide a `POST /auth/dev/totp`. Ambos caminos dependen de
   `DEV_AUTH_HELPERS`/`NEXT_PUBLIC_DEV_AUTH_HELPERS`; el helper responde `404` apagado y la API
   aborta el arranque si está activo en producción.

## 5. Cómo probarlo

```powershell
# 1. Infra + API + web (ver docs/07 §6)
docker compose up -d
pnpm db:migrate; pnpm db:seed
pnpm --filter @ventascatalogo/api dev
pnpm --filter @ventascatalogo/web dev

# 2. Importar el fixture por API (sustituí <token> por la cookie vc_staff_at)
curl -F "file=@tools/fixtures/catalogo-demo.csv;type=text/csv" `
     -H "Cookie: vc_staff_at=<token>" `
     http://localhost:3001/api/v1/catalogs/<catalogId>/imports

# 3. En el navegador: http://app.localhost:3000/panel/catalogos → "Versiones e importar"
```

## 6. Pendiente para cerrar F1

1. **Google Drive** (F1.1/F1.2): crear cliente OAuth en Google Cloud con scope
   `drive.readonly` y `access_type=offline`; el pipeline de importación ya está listo para recibir
   el buffer descargado.
2. **Sales** (F1.7/F1.8): cotizaciones, pedidos, snapshots de precio y PDF server-side.
3. **Tienda y portal** (F1.10–F1.12): carrito, checkout de invitado, reclamo de cuenta y
   `/mi-cuenta` con filtro `self` en repositorio.
4. **PWA de tienda** (F1.13): manifest, service worker e IndexedDB del catálogo activo.
5. **Cobertura ≥70 % en `catalogs` y `sales`** y E2E importar→activar→cotizar→PDF (DoD de F1).
6. Alinear el `CHECK` de totales de `docs/03` con la convención de dinero (sigue pendiente de F0).
