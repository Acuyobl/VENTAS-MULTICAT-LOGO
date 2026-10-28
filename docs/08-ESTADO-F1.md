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
| Imágenes de producto (F1.4/F1.6/F1.9) | ✅ | Subida a MinIO, URLs firmadas, imágenes en importación, seed y las dos caras |
| F1.1/F1.2 Google Drive (OAuth + cliente) | ⏸️ | Requiere credenciales de Google Cloud del usuario; contrato listo para conectar |
| F1.4 Drive (descarga/snapshot remoto) | ⏸️ | El pipeline ya acepta un buffer; falta el origen Drive |
| F1.7/F1.8 Cotizaciones, pedidos y PDF | ✅ | Clientes, cotizaciones con snapshot y PDF, conversión a pedido, entrega y cancelación |
| F1.4 Drive (descarga/snapshot remoto) | ⏸️ | El pipeline ya acepta un buffer; falta el origen Drive |
| F1.10–F1.12 Tienda, carrito, checkout invitado, reclamo y portal | ✅ | Carrito persistente, checkout público con token, confirmación y `/mi-cuenta/pedidos` |
| F1.13 PWA de tienda (offline de lectura) | ⏳ | Manifest, service worker e IndexedDB del catálogo activo |

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

## 3.1 Imágenes de producto (agregado tras F1 inicial)

El brief pide catálogos con imágenes: ahora se pueden **subir, importar, ver y quitar**.

| Pieza | Detalle |
|---|---|
| Permiso | `product:write` (org_admin, catalog_admin, superadmin; el vendedor recibe 403) |
| Subida | `POST /products/:productId/image` multipart `file` (JPEG/PNG/WebP/SVG, ≤ 5 MB) → `{ imageKey, imageUrl }` firmada 900 s |
| Borrado | `DELETE /products/:productId/image` → limpia `imageKey` y el objeto (best-effort) |
| Listado backoffice | `GET /products` devuelve `imageUrl` firmada por producto (o `null` si MinIO no responde) |
| Catálogo público | `GET /catalogs/public/:slug` devuelve `imageUrl` firmada 3600 s además de `imageKey` |
| Importación | Si la columna `imagen` es `http(s)` se descarga (8 s, ≤5 MB, tipos permitidos) y se guarda en MinIO; URL rota → warning `IMAGE_DOWNLOAD_FAILED`; valor relativo → `IMAGE_UNRESOLVED`. Los warnings **no** bloquean ni cuentan cuarentena |
| Seed | 49 SVG determinísticos (12 de la v1 demo + 37 de la v2 activa), 49 objetos en `vc-products`, 0 huérfanos |
| UI | Catálogo público y tienda: imagen en la tarjeta (con inicial como fallback). Backoffice: columna **Imagen** con miniatura, subida y borrado por producto |

Verificación ejecutada:

```text
POST /products/:id/image (PNG real) → 201 imageKey + imageUrl presignada → descarga 200 image/png 70 B
GET /products                → imageUrl presente y descargable (200 image/svg+xml 718 B)
GET /catalogs/public/demo    → 37/37 productos con imageUrl; descarga 200
/panel/productos (HTML)      → 20 miniaturas presignadas + control de subida por fila
/c/catalogo-demo (HTML)      → 37 <img> presignadas, sin placeholders
DELETE /products/:id/image   → imageKey null
Vendedor sin product:write   → 403
```

**Límites conocidos:** las URLs firmadas caducan (900 s backoffice / 3600 s público) y se regeneran
en cada render SSR; no hay CDN ni transformación de tamaño todavía.

**Enrutado de las dos caras:** las superficies de la cara B (`/c/[slug]`, `/tienda`, `/mi-cuenta`)
se sirven en **cualquier host**, de modo que el backoffice puede previsualizar el catálogo público
desde `app.localhost`. Solo `/panel` se reescribe bajo el host `app.` y sigue protegido por sesión
staff. Cubierto por `apps/web/src/lib/faces.test.ts`.

## 3.2 Ventas: cotizaciones, pedidos y PDF (F1.7/F1.8)

| Pieza | Detalle |
|---|---|
| Clientes | `GET /customers?q&cursor&limit` y `POST /customers` (permisos `customer:read/create`) |
| Cotización | `POST /quotes`: toma la versión activa, congela `skuSnapshot`/precio/IVA por ítem, valida stock y versión, calcula con `calculateTotals`, número `COT-YYYY-NNNNNN` (lock de Postgres, año comercial UTC-6), vigencia 15 días por defecto |
| PDF | `POST /quotes/:id/send` lo genera con pdf-lib (A4, Helvetica/WinAnsi, acentos), lo guarda en `vc-docs` y devuelve `pdfUrl` firmada 300 s; `GET /quotes/:id/pdf` la renueva |
| Estados | `DRAFT → SENT → ACCEPTED → CONVERTED`; aceptar una expirada da `409 QUOTE_EXPIRED` |
| Conversión | `POST /quotes/:id/convert` crea `PED-YYYY-NNNNNN` con los mismos snapshots y totales (no recalcula); reconvertir da `409 QUOTE_ALREADY_CONVERTED` con `details.orderId` |
| Pedidos | `GET /orders`, `GET /orders/:id`, `POST /orders/:id/cancel` (bloquea con pagos: `409 ORDER_HAS_PAYMENTS`) y `POST /orders/:id/fulfill` |
| Permisos | `quote:read/create/send/convert`, `order:read/create/cancel`, `customer:read/create` sembrados por rol |

Verificación ejecutada sobre la API real y la UI:

```text
COT-2026-000001 · producto ₡12.900 × 2 · IVA incluido 13 %
  → subtotal 22.831 · IVA 2.969 · total 25.800
POST /quotes/:id/send   → SENT + pdfUrl → descarga 200 application/pdf (2.073 B, %PDF-)
POST /quotes/:id/accept → ACCEPTED
POST /quotes/:id/convert → PED-2026-000001 PENDING_PAYMENT con el mismo total
Segunda conversión     → 409 QUOTE_ALREADY_CONVERTED con details.orderId
POST /orders/:id/fulfill → FULFILLED
Otra cotización→pedido→cancelar → PED-2026-000002 CANCELLED
Cantidad 999 con stock 12 → 409 PRODUCT_OUT_OF_STOCK available=12
UI /panel/cotizaciones y /panel/pedidos → 200 con datos reales y acciones
```

**Deuda resuelta (migración `20261028171500_storefront_orders_and_debts`):** `Customer.type` y
`Order.cancelReason` ya son columnas reales (el seed quedó PERSON/PERSON/COMPANY y cancelar escribe
la razón en su columna). Se añadieron `Order.publicToken` (único), `publicTokenExpiresAt` y
`claimedAt`.

## 3.3 Cara B: carrito, checkout de invitado y portal (F1.10–F1.12)

| Pieza | Detalle |
|---|---|
| Carrito | Cliente en `localStorage` (`vc.cart.v1`), 999 unidades máx., nunca mezcla catálogos; botón **Agregar** en cada tarjeta del catálogo público y badge en el header |
| Checkout | `POST /storefront/checkout` (`@Public`, 10/min) con catálogo por slug, ítems y datos del invitado → crea/reutiliza `Customer` y un `Order` `PENDING_PAYMENT` con snapshots de precio y totales del servidor |
| Token | 32 bytes base64url devuelto en claro solo en la respuesta; en BD se guarda `sha256(token)`, expira a 30 días |
| Confirmación | `/pedido/[token]` (pública) muestra número, ítems, totales y permite **vincular el pedido a la cuenta** si hay sesión de cliente con el mismo email |
| Portal | `/mi-cuenta/pedidos` y `/mi-cuenta/pedidos/[id]`, con `GET /me/orders` filtrado por `customerId` en el repositorio (staff recibe 403 de audiencia, pedido ajeno 404) |

Verificación ejecutada:

```text
POST /storefront/checkout (2 × ₡12.600) → 201 PED-2026-000003 · total 25.200 · token 43 chars · expira +30 días
GET  /storefront/orders/:token          → pedido con ítems, subtotal 22.300 e IVA 2.900
POST /storefront/orders/:token/claim    → claimed=true (sesión cliente@ventascatalogo.local)
GET  /me/orders                         → PED-2026-000003 PENDING_PAYMENT (+ histórico del cliente)
Staff en /me/orders                     → 403 AUTH_WRONG_AUDIENCE
/c/catalogo-demo                        → HTML con botón "Agregar"
/carrito, /checkout                     → 200 (estado vacío renderizado por el cliente tras hidratar)
/pedido/<token>                         → 200 "Pedido confirmado" + número + totales
/mi-cuenta/pedidos (sesión cliente)     → 200 con el número del pedido
```

**Límite actual:** el checkout deja el pedido en `PENDING_PAYMENT`; el link de pago y los webhooks
llegan en F2. El reclamo exige que el email del pedido coincida con el de la cuenta.

## 3.4 Cobros (F2.1–F2.4, primer incremento de F2)

| Pieza | Detalle |
|---|---|
| Link de pago | `POST /orders/:id/payment-link` (staff, `payment:write`) → token aleatorio, monto = saldo, TTL 60 min, URL `${WEB_PUBLIC_URL}/pago/{token}` |
| Página de pago | `/pago/[token]` pública: resumen del pedido, monto y botón de confirmación (sandbox). Link expirado → 409 `payment_link_expired`; usado → estado `USED` |
| Confirmación sandbox | `POST /payments/sandbox/:token/confirm` (`@Public`, solo dev) → `Payment` `SANDBOX`, pedido `PAID`, link `USED`; segunda llamada devuelve `alreadyProcessed=true` sin duplicar |
| Stripe | Checkout Session vía API (sin SDK); webhook con firma HMAC-SHA256 (`stripe-signature`, tolerancia 300 s), idempotente por `(provider, externalEventId)`; firma inválida → 400 `PAYMENT_SIGNATURE_INVALID` |
| Pagos manuales | `POST /orders/:id/payments/manual` (CASH/TRANSFER/SINPE) → recálculo transaccional: `PARTIALLY_PAID` o `PAID`; sobrepago → 422 con `balanceMinor`; audit `payment.manual_registered` |
| Integridad | Un pedido con pagos no se puede cancelar (`409 ORDER_HAS_PAYMENTS`); `GET /orders/:id/payments` expone pagos y saldo |
| Seguridad | `PAYMENTS_SANDBOX_ENABLED` es `false` por defecto y la API **aborta** si está activo con `NODE_ENV=production` |

Verificación ejecutada:

```text
Link sandbox PED-2026-000003 (₡25.200) → GET /payments/public/link → confirmar
  → payment SUCCEEDED · pedido PAID · pagado 25.200/25.200 · segunda confirmación alreadyProcessed=true
PED-2026-000004: pago manual parcial 6.300 → PARTIALLY_PAID · sobrepago 422 (balance 6.300)
  → pago final 6.300 por TRANSFER → PAID · 2 pagos registrados
Webhook Stripe con firma inválida → 400 · orden con pagos no cancelable → 409
UI: /panel/pedidos muestra Link de pago / Registrar pago / Saldo · /pago/<token> muestra el monto y "Pagar (sandbox)"
```

**Pendiente de F2:** configuración de pasarelas por organización (UI de `PaymentGatewayConfig`),
reembolsos, recordatorios de cobro, conciliación programada, gastos, reportes y exportación
(F2.5–F2.11). Para Stripe real hacen falta `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`.



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

## 6. Pendiente

1. **Google Drive** (F1.1/F1.2): crear cliente OAuth en Google Cloud con scope `drive.readonly` y
   `access_type=offline`; el pipeline de importación ya está listo para recibir el buffer descargado.
2. **PWA de tienda** (F1.13): manifest, service worker e IndexedDB del catálogo activo (lectura
   offline).
3. **F2 restante**: UI de configuración de pasarelas por organización, reembolsos, recordatorios de
   cobro, conciliación bancaria, gastos, panel financiero, reportes y exportación (F2.5–F2.11).
   Stripe real requiere credenciales.
4. **Cobertura ≥70 % en `catalogs` y `sales`** y E2E importar→activar→cotizar→PDF (DoD de F1).
5. Alinear el `CHECK` de totales de `docs/03` con la convención de dinero (sigue pendiente de F0).
6. Endurecer el reclamo: notificación al cliente y límite de intentos por token.
7. Cerrar F0: bootstrap cronometrado, demo y tag `v0.1.0`.
