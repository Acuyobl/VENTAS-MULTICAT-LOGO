---
title: Estado de implementación — catálogo, ventas y producto
tipo: bitacora
estado: implementado-con-pendientes
fase: F1–F3
version: 0.2.9
fecha: 2026-10-29
idioma: es-CR
---

# Estado de implementación — F1/F2/F3

Bitácora del primer incremento de F1 (`docs/04-GUIA-IMPLEMENTACION.md` §4.2) **y de los incrementos
posteriores** (ventas, cobros, contenido, WhatsApp/chat, temas visuales, catálogos de ejemplo y
endurecimiento). El estado consolidado al 2026-10-29 está en §3.29; lo pendiente, en §6.

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
reembolsos (ver §3.5), recordatorios de cobro, conciliación programada, gastos, reportes y
exportación (F2.5–F2.11). Para Stripe real hacen falta `STRIPE_SECRET_KEY` y
`STRIPE_WEBHOOK_SECRET`.

## 3.5 Reembolsos con segregación de funciones (F2.6)

| Pieza | Detalle |
|---|---|
| Solicitud | `POST /payments/:id/refunds` (`payment:refund_request`) → `Refund` `REQUESTED`; disponible = pago − reembolsos `PROCESSED`; exceso → 422 `REFUND_EXCEEDS_PAID` |
| Aprobación | `POST /refunds/:id/approve` (`payment:refund_approve`) → `PROCESSED`, actualiza `Payment.status` (`PARTIALLY_REFUNDED`/`REFUNDED`), `Order.refundedMinor` y estado (`REFUNDED` solo con devolución total) |
| Rechazo | `POST /refunds/:id/reject` → `REJECTED` sin tocar saldos |
| Segregación | Quien solicita **no puede** aprobar → 409 `REFUND_SEGREGATION_REQUIRED`; aprobar dos veces → 409 sin duplicar montos |
| Consulta | `GET /orders/:id/refunds` (`refundedMinor`, `balanceMinor`) y `GET /payments/:id/refunds` |
| UI | `/panel/pedidos/[orderId]`: pagos con monto disponible, reembolsos con estado, botones Aprobar/Rechazar (según permisos) y solicitud en diálogo. Si el reembolso lo pidió el mismo usuario, la fila dice «Solicitado por vos» y **no ofrece Aprobar**; los errores explican la regla (segregación, monto disponible) en lugar de mostrar «Error» |
| Seed | `finanzas.demo@ventascatalogo.local` (solicita) y `aprobador.demo@ventascatalogo.local` (aprueba), ambos `Demo1234!` |

Verificación ejecutada:

```text
finanzas.demo solicita ₡5.200 sobre PED-2026-000003 → REQUESTED
finanzas.demo intenta aprobar → 403 FORBIDDEN
aprobador.demo aprueba → Payment PARTIALLY_REFUNDED · pedido PAID · refunded 5.200 · saldo 20.000
reembolso del resto (₡20.000) → Payment REFUNDED · pedido REFUNDED · refunded 25.200
admin solicita y aprueba su propio reembolso → 409 REFUND_SEGREGATION_REQUIRED
reembolso sobre pago ya reembolsado → 409 PAYMENT_NOT_REFUNDABLE
UI /panel/pedidos/<id> → 200 con "Pagos", "Reembolsos", "Reembolsado" y segregación
```



## 3.6 Autoaprobación configurable (F2, política por organización)

| Pieza | Detalle |
|---|---|
| Ajustes | `GET/PATCH /organizations/settings` (`settings:manage`) con `allowSelfApproval` (default `false`) y auditoría `organization.settings_updated` con before/after |
| Regla | Flag apagado: quien solicita no aprueba (`409 REFUND_SEGREGATION_REQUIRED`). Flag encendido sin confirmar: `422 VALIDATION_FAILED` `reason=self_approval_confirmation_required`. Con `confirmSelfApproval: true`: aprueba y audita `payment.refund_self_approved` |
| UI | `/panel/ajustes` con el interruptor explicado; el panel de reembolsos muestra Aprobar para la propia solicitud solo si la política está activa y pide confirmación |

## 3.7 Recordatorios de cobro, reportes y conciliación (F2)

| Pieza | Detalle |
|---|---|
| Recordatorios | `POST /orders/:id/reminders` (`payment:write`) con canal `EMAIL` (Mailpit/SMTP real, 422 si el cliente no tiene email) o `WHATSAPP` (Cloud API; 409 `INTEGRATION_NOT_CONFIGURED` sin credenciales, 422 sin teléfono). Cada intento queda en `payment_reminders` con estado SENT/FAILED y audit `payment.reminder_sent`; `GET` lista el historial |
| Reportes | `GET /reports/finance?from&to` (`finance:read`): ventas por estado y montos, cobros por método, reembolsos, cuentas por cobrar (abiertas y vencidas >30 días) y top 10 productos. Default: mes actual (UTC-6), `from>to` → 422 |
| Conciliación | `GET /reports/reconciliation?from&to`: una fila por pago con pedido, fecha, método, referencia, monto y estado; totales registrado/reembolsado/neto |
| UI | `/panel/finanzas` con rango de fechas, métricas, tablas y exportación CSV de la conciliación; botón **Recordar por correo / WhatsApp** en el detalle del pedido |

Verificación ejecutada:

```text
PATCH allowSelfApproval true → GET lo confirma · recordatorio EMAIL → SENT a ruta.test@… · Mailpit 7 mensajes
reports/finance (mes actual) → pedidos 6 · neto ₡144.000 · cobrado ₡92.700 · por cobrar ₡38.400 · top 4
reports/reconciliation → 4 filas · registrado ₡92.700 · neto ₡66.500
autoaprobación sin confirmar → 422 reason=self_approval_confirmation_required · con confirmar → PARTIALLY_REFUNDED
/panel/ajustes, /panel/finanzas y detalle de pedido → 200 con sus secciones
Correo: el header Subject viaja como =?UTF-8?B?…?= (Mailpit muestra «Â·» porque su API no decodifica, no es un bug)
```

## 3.8 IA de contenido, WhatsApp entrante y chat (F3, primer incremento)

| Pieza | Detalle |
|---|---|
| IA | `POST /ai/social-posts` (`social:generate`) con catálogo, plataforma, tono, objetivo y hasta 5 productos → `SocialPost` DRAFT con título, cuerpo, hashtags, CTA y sugerencia visual. `GET` lista y `POST /:id/decision` (`social:approve`) aprueba o rechaza. Proveedor `deepseek` (sin key → 409) o `mock` determinista solo fuera de producción |
| WhatsApp entrante | `GET /webhooks/whatsapp` responde el challenge si coincide `WHATSAPP_VERIFY_TOKEN`; `POST` valida HMAC si hay `WHATSAPP_APP_SECRET` y crea cliente por teléfono + conversación + mensaje del cliente |
| Chat staff | `GET /chat/conversations` (nombre, no leídos, último mensaje), `GET /chat/conversations/:id/messages` (marca leídos) y `POST …/messages` (`chat:write`, auditado) |
| UI | `/panel/contenido` (generar, vista previa, aprobar/rechazar, historial) y `/panel/chat` (lista, hilo, respuesta, refresco cada 15 s) |

Verificación ejecutada:

```text
POST /ai/social-posts con AI_PROVIDER=mock → 201 · título "Producto 1 directo desde Costa Rica" · 5 hashtags · 320/180 tokens
decision → APPROVED · GET lista → 1 publicación
GET /webhooks/whatsapp?hub.challenge=… → challenge-123 · POST inbound → processed=1
/chat/conversations → 2 (Cliente Demo + Cliente WhatsApp) · WhatsApp unread=1 · abrir marca leído · respuesta STAFF OK
/panel/contenido y /panel/chat → 200 con datos
```

**Pendiente de F3:** WhatsApp saliente masivo/campañas, chat del cliente en el portal, programación y publicación real en redes, y control de cuota/costo de IA por organización.



## 3.9 Gastos, utilidad y exportación (F2, cierre del ciclo de dinero)

| Pieza | Detalle |
|---|---|
| Gastos | `POST /expenses` (`expense:write`) y `GET /expenses?from&to&catalogId&category` (`finance:read` o `expense:write`) con totales por categoría; `DELETE` con soft delete; audits `expense.created/deleted` |
| Utilidad | `GET /reports/profit?from&to`: ingresos netos, reembolsos procesados, gastos por categoría, `profitMinor = netMinor − refundedMinor − gastos` y `marginBp` |
| Exportación | `GET /reports/finance/export.csv` → `text/csv` con `Content-Disposition: attachment` y totales al pie; audit `report.exported` |
| UI | `/panel/gastos` (registrar, filtrar, totales por categoría, borrar) y sección **Utilidad del rango** en `/panel/finanzas`, más descarga CSV desde el servidor |

Verificación ejecutada:

```text
seed: 3 gastos del mes · total ₡40.500 (MARKETING 20.000 · INSUMOS 12.000 · TRANSPORTE 8.500)
POST gasto ₡5.000 → total ₡45.500 · DELETE → vuelve a ₡40.500
profit: ingresos ₡144.000 − reembolsos ₡26.700 − gastos ₡40.500 = utilidad ₡76.800 · margen 53,33 %
export.csv → 200 · text/csv · attachment · 8 líneas
```

## 3.10 Pasarelas por organización (F2.7)

| Pieza | Detalle |
|---|---|
| Endpoints | `GET /organizations/payment-gateways`, `PUT /organizations/payment-gateways/:provider` y `PATCH … {enabled}` (`settings:manage`) |
| Secretos | Cifrados AES-256-GCM; solo se expone `maskedKey` (últimos 4) y `hasSecret`; habilitar sin secreto → 422 `gateway_secret_required` |
| Auditoría | `payment.gateway_updated` con before/after **sin** secretos |
| UI | Sección **Pasarelas de pago** en `/panel/ajustes` con modo TEST/LIVE, claves y habilitar/deshabilitar |

Verificación ejecutada:

```text
GET → SANDBOX:TEST habilitada (seed)
PUT STRIPE (sk_test_…) → maskedKey ****1234 · hasSecret true · GET no devuelve secretos
PATCH enabled=true → habilitada · PAYPAL enabled sin secreto → 422 gateway_secret_required
```

## 3.11 WhatsApp saliente y canal del chat (F3)

| Pieza | Detalle |
|---|---|
| Canal | `ChatConversation.channel` (`WEB`/`WHATSAPP`) y `externalId` (wa_id); el inbound de WhatsApp crea la conversación con canal `WHATSAPP` |
| Respuesta | En una conversación `WHATSAPP` el mensaje del staff se envía por la Cloud API; sin credenciales → 409 `INTEGRATION_NOT_CONFIGURED` **sin persistir** el mensaje (reintentable) |
| UI | `/panel/chat` muestra el canal por conversación y explica el 409 de WhatsApp |

Verificación ejecutada:

```text
inbound con teléfono nuevo → conversación "María WhatsApp" · channel WHATSAPP · no leídos 1
respuesta staff por WhatsApp sin credenciales → 409 INTEGRATION_NOT_CONFIGURED · mensajes siguen en 1
conversación antigua (creada antes de la migración) queda en WEB: es dato histórico, no un fallo
```



## 3.12 Imágenes generadas con IA para contenido (F3)

| Pieza | Detalle |
|---|---|
| Generación automática | `POST /ai/social-posts` crea el texto y **también la imagen** (best-effort: si falla, la publicación queda con `imageUrl=null`) |
| Regeneración | `POST /ai/social-posts/:id/image` (`social:generate`, `{prompt?}`) vuelve a generar con instrucciones propias y devuelve la publicación actualizada |
| Proveedores | `IMAGE_PROVIDER=mock` (default): SVG 1080×1080 determinista con degradado de marca, título, producto/precio, CTA y «VentasCatálogo»; `openai` (`gpt-image-1`, `response_format=b64_json`, timeout 60 s) si hay `OPENAI_API_KEY`, si no → 409 `INTEGRATION_NOT_CONFIGURED`. Mock prohibido en producción (fail-fast) |
| Almacenamiento | Bucket `vc-public`, key `ai/posts/{orgId}/{postId}.{ext}`; se sirve con URL firmada de 3600 s y se sobrescribe al regenerar |
| UI | `/panel/contenido` muestra la imagen en la vista previa, permite **generar/regenerar con prompt** y muestra miniaturas en el historial |

Verificación ejecutada:

```text
POST /ai/social-posts (mock) → imagen=true · provider=mock · SVG 1080×1080 válido (1.876 B)
GET imageUrl → 200 image/svg+xml · contiene la marca y el título
POST /:id/image con prompt custom → imagePrompt incluye las instrucciones y nueva URL descargable
GET /ai/social-posts → las publicaciones nuevas traen imageUrl; las 2 antiguas quedan sin imagen
    (se regeneran desde la UI con «Regenerar imagen»)
/panel/contenido → 200 · vista previa con imagen y miniatura en el historial
```



## 3.13 Catálogo real con fotos cargado (Despensa de Altura)

Se creó un segundo catálogo demostrativo con **productos reales y fotografías reales** obtenidas de
Wikimedia Commons (licencias libres; se acredita la fuente en el script).

| Dato | Valor |
|---|---|
| Catálogo | `Despensa de Altura` · slug `despensa-de-altura` · CRC · versión **v1 ACTIVE** |
| Productos | **20** (café, miel, chocolate, repostería, conservas, tés, especias, frutos secos, aceites) |
| Imágenes | **20/20** descargadas y almacenadas en MinIO (`vc-products`), servidas con URL firmada |
| Origen | Wikimedia Commons vía API (`generator=search`, miniaturas de 900 px) |
| Herramientas | `apps/api/scripts/load-real-catalog.mjs` (crea catálogo + CSV) y `tools/fixtures/despensa-altura.csv` |

Verificación ejecutada:

```text
script: 20/20 productos con imagen · CSV de 6.183 B
import: 20 filas válidas · 0 en cuarentena · 1 warning IMAGE_DOWNLOAD_FAILED (Wikimedia 429)
        → esa foto se corrigió subiéndola por POST /products/:id/image (ahora 20/20)
activación: v1 → ACTIVE
GET /catalogs/public/despensa-de-altura → 20 productos · 20 con imageUrl descargable (200 image/jpeg)
/panel/catalogos y /panel/catalogos/<id> → 200 con el catálogo, v1 ACTIVE y 20 productos
http://tienda.localhost:3010/c/despensa-de-altura → 200 · 20 <img> firmadas
```

Para recrearlo: `pnpm --filter @ventascatalogo/api exec dotenv -e ../../.env -- node scripts/load-real-catalog.mjs`
(crea el catálogo y el CSV; el script reintenta si Wikimedia limita) y luego importar el CSV desde
`/panel/catalogos/<id>` → **Importar** y activar la versión. El CSV también sirve para probar el
importador fuera de este entorno.



## 3.14 Importador inteligente A+B+C (cualquier archivo se adapta)

| Pieza | Detalle |
|---|---|
| Catálogo nuevo | `POST /catalogs` (`catalog:write`) con slug autogenerado; 409 si existe; auditado |
| Preview/analizador | `POST /catalogs/:id/imports/preview` (multipart) devuelve `columns` con tipo inferido y confianza, `sampleRows`, `proposal` (mapping + `extraFields` + `ignoredColumns` + warnings + explicación + confianza), `preset` y `modeOptions` |
| Heurística (A) | Sinónimos + similitud Levenshtein/tokens; tipos TEXT/NUMBER/CURRENCY/DATE/BOOLEAN/URL/IMAGE/ENUM; ruido (`Total`, `IVA`, vacías >80 %) se ignora con motivo |
| Agente IA (B) | Encabezados + tipos + 5 filas → JSON validado con Zod y revalidado; un reintento y fallback heurístico (`agent:null`) si no hay IA. Con `AI_PROVIDER=mock` hay propuesta demostrable |
| Aprendizaje (C) | Plantilla por firma de encabezados (≥80 %) se reutiliza como preset y se aplica al importar sin mapping; `usageCount` |
| Campos extra | Las columnas sobrantes se guardan en `Product.attributes` (JSONB) y se exponen en `GET /products` y en el catálogo público |

Verificación ejecutada con un catálogo real de ferretería y columnas raras:

```text
POST /catalogs → Ferretería El Tornillo (slug ferreter-a-el-tornillo)
preview CSV "Código, Artículo, Precio final ₡, Cant., Medida, Material, Total"
  → mapping sku=Código · name=Artículo · price=Precio final ₡ · stock=Cant.
  → extraFields Medida→medida, Material→material · ignorada Total
  → agente mock (mocked=true) · confianza 0.96 · Medida inferida TEXT
import plan → 5 filas: 4 productos + 1 en cuarentena (MISSING_PRICE) · v2 ACTIVE
attributes exactos → {"medida":"1/4","material":"Acero"}, "1/4 x 2", "16 oz"
plantilla "Proveedor Tornillo" guardada aun con cuarentena · segundo preview la aplica (preset)
```

**Fix importante:** el CSV ahora usa un parser propio; SheetJS adivinaba tipos y convertía `1/4` en
fecha (`1/3/01`). Con el parser propio y la coacción por tipo, los textos se conservan.

## 3.15 Reemplazo o fusión de catálogo

- El wizard de importación ofrece **modo**: `REPLACE` (solo lo del archivo) o `MERGE` (conserva los
  productos de la versión activa que no vienen en el archivo, con su imagen y atributos), y un
  check **«Activar esta versión al importar»** para que la tienda muestre el catálogo nuevo de
  inmediato.
- `MERGE` reporta `carriedOver`; activar una versión archiva la anterior (histórico intacto).
- Verificado: v2 ACTIVE con los 4 productos corregidos reemplazando v1; el e2e cubre MERGE con
  `carriedOver` y REPLACE sin arrastre.

## 3.16 Imágenes de contenido basadas en la foto del producto

- El mock lee la foto del primer producto desde MinIO (`vc-products`) y la embebe en el SVG
  1080×1080 con overlay para legibilidad, título, precio, CTA y marca; sin foto cae al degradado.
- La imagen varía por producto y por prompt (variante determinista); regenerar con instrucciones
  propias produce un SVG distinto.
- Con `IMAGE_PROVIDER=openai` y foto disponible usa `images/edits` (multipart) para mantener el
  producto reconocible; sin foto, `images/generations`.

```text
SVG con foto real: 258 KB y 332 KB (antes 1,8 KB) · contiene data:image/ · dos productos → hash distinto
regenerar con prompt → hash distinto
sin imagen de producto → degradado de marca
```



## 3.17 Diseños de imagen configurables (F3)

La organización elige el estilo con el que se compone la foto del producto y los datos. Se cambia en
**Ajustes** cuando el administrador quiera y aplica a las imágenes nuevas y a las que se regeneren.

| Diseño | Composición |
|---|---|
| `CLASICA` | Foto a sangre, overlay oscuro, título/producto/precio/CTA abajo y marca arriba a la derecha |
| `EDITORIAL` | Panel crema a la izquierda + foto a sangre en el 55 % derecho, título en serif (Georgia), líneas finas y CTA subrayado |
| `PROMO` | Overlay verde + acento coral, badge circular «OFERTA», banda diagonal, precio enorme y CTA en píldora |

| Pieza | Detalle |
|---|---|
| Ajuste | `GET/PATCH /organizations/settings` con `imageDesign` (enum validado); PATCH parcial real y auditado |
| Catálogo de diseños | `GET /ai/image-designs` devuelve los 3 con `previewDataUri` (`data:image/svg+xml;base64`, sin foto) para las tarjetas |
| Uso | `POST /ai/social-posts` usa el diseño de la organización; `POST /:id/image` acepta `design` como override; se guarda en `SocialPost.imageDesign` |
| UI | `/panel/ajustes` muestra las **3 tarjetas con vista previa**, marca el activo y permite **«Usar este diseño»** |

Verificación ejecutada:

```text
GET /ai/image-designs → CLASICA (2.586 B) · EDITORIAL (2.962 B) · PROMO (3.466 B) en previews data URI
PATCH imageDesign=PROMO → 200 · auditado · publicación nueva → imageDesign=PROMO
SVG descargado → data-design="PROMO" · 259 KB · foto del producto embebida
regenerar con design=EDITORIAL → data-design="EDITORIAL" · hash distinto · 258 KB
/panel/ajustes → 200 con 3 tarjetas, «Activo» y «Usar este diseño»
```

Los diseños son deterministas y no necesitan credenciales; con `IMAGE_PROVIDER=openai` el estilo
elegido se usa como guía del prompt de edición.



## 3.18 Galería y detalle de producto (backoffice)

`/panel/productos` pasó de tabla con miniaturas a **galería de tarjetas** con la foto grande del
producto; cada tarjeta abre `/panel/productos/<id>` con el detalle completo.

| Pieza | Detalle |
|---|---|
| Galería | Tarjetas con imagen (4:3), categoría, nombre, SKU/marca, precio y stock; filtros por texto, categoría y versión; paginación por cursor |
| Detalle | `GET /products/:productId` (`product:read`) con `attributes`, `imageKey`, `imageUrl` firmada 3600 s, catálogo, versión y estado (aunque esté archivada) |
| Edición | `PATCH /products/:productId` (`product:write`): nombre, descripción, categoría, marca, precio y stock; cuerpo vacío 422; solo editable la versión ACTIVE (archivada → 409) para preservar el histórico; audit `product.updated` con before/after |
| Foto | Subir/quitar imagen desde el detalle (endpoints existentes) |
| Campos dinámicos | El detalle muestra los campos extra del importador (`Medida`, `Material`, etc.) con etiqueta legible |
| A-R6 | `costMinor` se oculta a roles sin permiso (vendedor, social_manager, agente_chat) |

Verificación ejecutada:

```text
/panel/productos?catalogo=<despensa> → 200 · 20 tarjetas · 20 <img> · «ver detalle →»
/panel/productos/<ALT-010>            → 200 · imagen · «Editar producto»
/panel/productos/<TOR-001>            → 200 · «Campos del catálogo» · Medida "1/4 x 2" · Material "Acero"
PATCH producto ACTIVE                 → precio 250→275, stock 120→130, GET confirma, revertido
```



## 3.19 Codificación: reparación y prevención (U+FFFD)

Aparecieron textos como «Mar�a WhatsApp» en la UI. La causa no era la app ni la fuente: **datos de
prueba enviados desde consolas con codificación rota** (PowerShell 5.1) se guardaron con el carácter
de reemplazo U+FFFD. Se corrigió en tres frentes:

| Frente | Qué se hizo |
|---|---|
| Reparación | `apps/api/scripts/scan-encoding.mjs` recorre todas las columnas de texto vía `information_schema`, reporta filas con `position(chr(65533))` y repara con un mapa conocido (`--fix`). **14 registros corregidos** (catálogo, chat, cliente, gastos, notas, reembolsos, prompt de IA) |
| Guardia de entrada | `EncodingGuardInterceptor` global: si un string del body JSON/multipart contiene U+FFFD responde **422 `VALIDATION_FAILED`** con `details.reason='invalid_encoding'` y `details.path`; los archivos se ignoran y los webhooks se validan por firma |
| Importador tolerante | `decodeCsvBuffer`: decodifica UTF-8 estricto y si falla usa **Windows-1252** (Excel en español); si el UTF-8 es válido pero trae U+FFFD literal, la fila va a **cuarentena `INVALID_TEXT_ENCODING`** y no se guarda |

Verificación ejecutada:

```text
escaneo de BD → 14 hallazgos → reparados → re-escaneo: «Sin caracteres U+FFFD en la base de datos»
UI /panel/chat y /panel/catalogos → 200 sin � · «María WhatsApp» · «Ferretería El Tornillo»
POST /catalogs con name="Ferreter\uFFFDa" → 422 invalid_encoding · path="name"
body válido → 201
CSV guardado en Windows-1252 con «Café»/«Piña» → importados 2/2 · nombres correctos
CSV UTF-8 con U+FFFD literal → 0 importados · 1 en cuarentena INVALID_TEXT_ENCODING
```



## 3.20 PWA de la tienda (F1.13)

| Pieza | Detalle |
|---|---|
| Manifest | `/manifest.webmanifest` con nombre, `start_url=/tienda`, `display=standalone`, colores de marca, íconos 192/512 y **maskable**, atajos a catálogo y cuenta |
| Service worker | `/sw.js`: precache de shell y offline; **network-first** para navegación con cache de respaldo; **cache-first** para `_next/static` e imágenes; nunca cachea `/api/*` ni orígenes externos |
| Offline | `/offline` con mensaje y enlaces; la página registra el SW solo en producción (`PwaRegister`) |
| Iconos | PNG generados a partir de la marca (verde/coral con «VC») |

Verificado: `manifest.webmanifest` 200 `application/manifest+json`, `sw.js` 200, `/offline` 200 y el
HTML de `/tienda` incluye el manifest.

## 3.21 Chat del cliente en el portal (F3)

| Pieza | Detalle |
|---|---|
| Endpoints | `GET /me/chat` y `POST /me/chat/messages` (aud=customer, `self:chat:write`): reutiliza/crea la conversación WEB del `CustomerAccount` con el primer catálogo activo |
| Portal | `/mi-cuenta/chat` con hilo, envío, refresco cada 10 s y nombres resueltos (staff/cliente/sistema) |
| Staff | La conversación aparece en `/panel/chat` con `unreadCount` y preview |
| Errores | staff en `/me/chat` → 403 de audiencia; sin perfil de cliente → 409; sin catálogo → 404 |

Verificado: mensaje del cliente creado (`sender=CUSTOMER`), conversación de 4 mensajes, bandeja staff
con **unread 1** y preview correcto; página `/mi-cuenta/chat` 200.

## 3.22 Borrar/archivar catálogo

`DELETE /catalogs/:id` (`catalog:write`): soft delete, desactiva `activeVersionId`, archiva la versión
ACTIVE, audita `catalog.deleted`; bloquea con **409 `catalog_has_open_orders`** si hay pedidos por
cobrar/abonados/pagados; 404 cross-org. Al borrar, el slug se renombra a
`<slug>-eliminado-<sufijo>` para **liberar el slug original**: se puede volver a crear un catálogo
nuevo con el mismo nombre/slug (el slug viejo y el renombrado dan 404). El botón «Eliminar catálogo»
con confirmación está en el listado (`/panel/catalogos`), en el detalle y en la pantalla de carga.

Verificado: catálogo de prueba → **204**, público viejo **404**, recrear el mismo slug → **201**;
segundo DELETE → **404**; `catalogo-demo` con pedidos abiertos → **409**. El listado muestra 10
botones de eliminar para 10 catálogos.

## 3.23 Reporte financiero en PDF y E2E del DoD de F1

- `GET /reports/finance/pdf?from&to&catalogId?` (`finance:read`): PDF A4 con ventas, pagos por método,
  reembolsos, gastos/utilidad y conciliación (máx. 50 filas); `Content-Type: application/pdf`,
  `Content-Disposition: attachment`, audit `report.exported`. Botón **«Reporte PDF»** en
  `/panel/finanzas`.
- **E2E del DoD**: `test/full-flow.e2e-spec.ts` cubre catálogo → importación CSV → activación →
  cliente → cotización → PDF → aceptación → pedido → entrega, con totales coherentes.

Verificado: PDF 200 `application/pdf`, 3.476 B, empieza con `%PDF-`, nombre
`reporte-financiero-2026-10-01-2026-10-28.pdf`.



## 3.24 Temas visuales de toda la app (3 propuestas)

El administrador elige el **tema de toda la aplicación** desde Ajustes: cambia tipografía, tamaños,
densidad, el shell de navegación y **el orden de los menús**.

| Tema | Qué cambia |
|---|---|
| **CLASICA** | Serif (Fraunces), papel cálido, **menú lateral** numerado, espaciado amplio. Es el diseño original |
| **MODERNO** | Sans (Archivo) más grande, **barra de navegación superior horizontal**, acento verde azulado, grilla más densa y menús reordenados (ventas primero) |
| **COMPACTO** | Tipografía mono para títulos, **rail angosto**, densidad alta (padding/tablas más chicos) y otro orden de menús (operación primero) |

| Pieza | Detalle |
|---|---|
| Ajuste | `GET/PATCH /organizations/settings` con `appTheme` (`CLASICO|MODERNO|COMPACTO`), auditado |
| Aplicación global | `GET /public/app-settings` (público) alimenta `<html data-theme>` en el layout raíz: aplica a backoffice, tienda y portal; los menus se reordenan por tema en cada shell |
| UI | `/panel/ajustes` → **Tema visual de la app**: 3 tarjetas con miniatura, “Activo/Disponible” y **«Usar este tema»** |

Verificación ejecutada:

```text
GET /public/app-settings → {"appTheme":"CLASICO","organizationName":"Organización Demo",...}
PATCH appTheme=MODERNO   → settings y público reflejan MODERNO
/panel  → <html data-theme="MODERNO"> · nav: Resumen · Cotizaciones · Pedidos · Productos…
/tienda → <html data-theme="MODERNO">
PATCH appTheme=COMPACTO  → /panel data-theme="COMPACTO" · nav: Resumen · Pedidos · Cotizaciones…
/panel/ajustes           → 3 tarjetas (Clásica/Moderna/Compacta) y «Usar este tema»
restaurado a CLASICO para la demo
```



## 3.25 Contenido: plataforma, tono y objetivo cambian texto e imagen

**Problema:** al cambiar plataforma/tono/objetivo en `/panel/contenido` se generaba el mismo texto y la
misma imagen. **Causa:** el proveedor `mock` de texto ignoraba esos campos y el SVG solo variaba
detalles mínimos sin insignias por plataforma/objetivo ni paleta por tono.

| Pieza | Cambio |
|---|---|
| Texto (mock v2) | `buildSocialPrompt` agrega `Metadatos: plataforma=…; tono=…; objetivo=…`; el provider genera título/gancho por tono, línea y **CTA por objetivo**, **hashtags por plataforma** (WhatsApp sin hashtags) y `visualSuggestion` por tono. Determinista |
| Prompt de imagen | Incluye plataforma, tono y objetivo + estilo visual del tono |
| SVG | `data-platform`/`data-tone`/`data-goal`, **insignia de plataforma** con color propio, **insignia de objetivo** (OFERTA/NUEVO/ÚLTIMOS DÍAS/APRENDÉ) y **paleta por tono** (cálido, azul/verde, coral/amarillo, negro/dorado) en los 3 diseños; la foto sigue embebida |
| Variante | El hash incluye plataforma+tono+objetivo+diseño+post+producto, así cambia el SVG |

Verificación ejecutada con el **mismo producto** y tres combinaciones:

```text
INSTAGRAM/CERCANO/VENTAS     → título «Un clásico para tu día a día…» · CTA «Escribinos…»
TIKTOK/DIVERTIDO/LANZAMIENTO → título «Modo …: activado» · CTA «Conocé lo nuevo…»
WHATSAPP/PREMIUM/RECORDATORIO→ título «La elegancia de … · últimos días» · CTA «Últimos días…»
3 SVG → hashes distintos (c26ce3…/978b09…/69cfcc…) · variantes 838/3798/8997
data-platform/tone/goal correctos en cada uno · foto del producto embebida (~259 KB)
regenerar con design=EDITORIAL → conserva WHATSAPP/PREMIUM/RECORDATORIO
```



## 3.26 Cuatro catálogos de ejemplo y pantalla “Cargar catálogo”

### Catálogos en la raíz

La carpeta [`catalogs/`](../catalogs) contiene **4 catálogos con fotos reales y descripciones**, cada
uno en un formato distinto, más `manifest.json` y `README.md`:

| # | Archivo | Catálogo | Formato | Moneda | Campos extra |
|---|---|---|---|---|---|
| 1 | `01-boutique-mar.csv` | Boutique Mar | CSV UTF-8 separado por coma | CRC | — |
| 2 | `02-ferreteria-central.xlsx` | Ferretería Central | XLSX con encabezados abreviados | CRC | `Medida`, `Material` |
| 3 | `03-despensa-organica.csv` | Despensa Orgánica | CSV **Windows-1252** separado por `;` | CRC | `Peso`, `Vencimiento` |
| 4 | `04-tecnohogar.xlsx` | TecnoHogar | XLSX con encabezados no estándar | USD | `Modelo`, `Garantía` |

Cargados por el pipeline real: **8 productos y 8/8 imágenes por catálogo**, 0 warnings, 0 en
cuarentena, atributos guardados y versiones activas. Verificado en las tiendas públicas:
`/c/boutique-mar`, `/c/ferreteria-central`, `/c/despensa-organica`, `/c/tecnohogar` → 200 con 8
imágenes firmadas cada una.

Se agregan dos scripts reutilizables:

- `apps/api/scripts/generate-catalogs.mjs` — vuelve a buscar fotos en Wikimedia, escribe los 4
  archivos y el manifiesto.
- `apps/api/scripts/import-demo-catalogs.mjs` — crea/actualiza los catálogos por API, analiza el
  mapeo, importa y activa la versión.

### Pantalla “Cargar catálogo”

Nueva ruta **`/panel/catalogos/importar`** (accesible desde el botón **Cargar catálogo** en
Catálogos):

1. Elegir **Catálogo nuevo** (pone nombre y se crea) o **Catálogo existente** (reemplazar/fusionar).
2. Subir archivo → **Analizar con IA** → editar mapeo/campos extra → importar.
3. Antes de importar en modo **Reemplazar** el navegador **pregunta explícitamente** si se quiere
   reemplazar el contenido (la versión anterior se archiva, no se borra).
4. Sección **«¿Querés eliminar el catálogo anterior?»**: elegir catálogo + botón **Eliminar** con
   confirmación; el backend rechaza con 409 si tiene pedidos abiertos.
5. Al importar se puede **activar la versión** para que la tienda muestre el catálogo nuevo.

### Descargador de imágenes endurecido

El importador envía `User-Agent: VentasCatalogoImporter/1.0`, limpia `utm_*`, reintenta 429/5xx y
errores de red con backoff (1 s / 3 s, `Retry-After` ≤ 10 s), limita a 3 descargas concurrentes y a
20 s por imagen. Antes 3 catálogos perdían fotos por 403/429 de Wikimedia; ahora **32/32 imágenes**.



## 3.27 Catálogo real de SUBLIMANIA CR (hoja de pedido)

El archivo real `Pedido_27-10-2026_SUBLIMANIA_CR.xlsx` **no era un catálogo tabular**: es una hoja
de pedidos (una fila por camisa, columnas `CLIENTE/TALLA/CAMISA/TELA/TIPO/CUELLO/GENERO/CANTIDAD/
DETALLE/MANGA/COSTO/URGENCIA/ESTADO`) y las fotos están **incrustadas** en la hoja «Imagenes».
El importador la rechazaba en la práctica: no mapeaba `CAMISA` como nombre ni encontraba precio.

Cambios para que se pueda cargar:

| Mejora | Detalle |
|---|---|
| Nombre | `HEADER_SYNONYMS.name` reconoce `camisa(s)`, `playera`, `blusa`, `vestido`, `prenda(s)`, `item`, `concepto`; si no hay, se elige la mejor columna TEXT (excluyendo cliente/contacto/fecha/estado) con warning |
| Precio | Si no hay precio y sí costo, se usa la misma columna como precio y costo, con warning explícito |
| SKU | Si el archivo no trae código se sintetiza `IMP-<NOMBRE>-<NNNN>` |
| Imágenes | Se acepta `data:image/(jpeg|png|webp);base64,…` (≤5 MB) en la columna `imagen`, se decodifica y sube a MinIO igual que una URL |

Conversión y carga:

- `tools/convert-sublimania.py` lee el pedido, compone descripciones, calcula **precio sugerido =
  costo × 1.5**, extrae las 3 fotos incrustadas de «Imagenes» y genera
  `catalogs/05-sublimania-cr.csv` con data URIs.
- Cargado por API como **«Sublimania CR»**: **3 productos, 3/3 imágenes, 0 cuarentena**, atributos
  `talla, tela, tipo, cuello, genero, manga, detalle, urgencia`; versión activa.
- Tienda pública: `/c/sublimania-cr` → 200 con las fotos y las 3 camisas.
- El XLSX original ya se analiza bien (nombre `CAMISA`, precio/costo `COSTO`, stock `CANTIDAD`); sus
  fotos están en otra hoja, por eso el catálogo cargado usa el CSV convertido (las hojas separadas
  no se cruzan automáticamente todavía).



## 3.28 Endurecimiento de producción (v0.2.9)

Cambios preparados para salir de la demo local, validados con los gates completos:

| Mejora | Detalle |
|---|---|
| **Cuota mensual de IA** | `AI_MONTHLY_QUOTA_TOKENS` (default 2.000.000) se valida antes de generar contenido; al superarse responde **429 `RATE_LIMITED`** con `reason='ai_monthly_quota_exceeded'`, tokens consumidos y cuota. Suma tokens de los posts del mes por organización |
| **Email real (Resend)** | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`: envío HTTPS a la API de Resend con timeout de 10 s; si falta la clave o falla, registra y devuelve `false` sin romper el flujo |
| **Anti-enumeración de usuarios** | Login con email inexistente verifica un hash Argon2id dummy para mantener tiempo constante |
| **Secretos de pasarela por organización** | `PaymentsService` descifra `payment_gateway_config.secret_enc` con `ENCRYPTION_KEY` y lo pasa al gateway (Stripe prioriza la clave de la organización sobre `STRIPE_SECRET_KEY`) |
| **Storage público** | `STORAGE_PUBLIC_URL` reescribe el host de las URLs firmadas de MinIO para exponerlas detrás de proxy/CDN |
| **Outbox confiable** | `fetchPending`, `markPublished` y `markFailed` con backoff exponencial (5s…1h) y límite de 5 intentos; `FAILED` al agotarse |
| **Limpieza** | Se quitaron imports/ramas sin uso en tests y módulos; `WhatsApp inbound` declara `metadata` del Cloud API |

Verificado: `pnpm typecheck`, `lint`, `test`, `build` y **149 e2e** en verde; sin migración nueva.

## 3.29 Estado consolidado al 2026-10-29 (v0.3.1)

| Dimensión | Estado |
|---|---|
| **Tags** | `v0.1.0` … `v0.3.1` (último: OCR de fotos y PDF escaneados) |
| **Base de datos** | 10 migraciones aplicadas, sin drift |
| **API** | 354 unit (59 archivos) + 157 e2e (31 archivos) |
| **Web** | 19 pruebas; build de producción de Next 15 |
| **CI** | verde con cobertura ~1,1 MB en el artefacto |
| **Catálogos demo** | 5 en `catalogs/` cargados + ejemplos OCR (`06-lista-ocr.png`, `07-lista-ocr-escaneada.pdf`) |
| **Catálogos en BD** | demo, despensa de altura, ferretería, prueba de codificación, los de ejemplo y «Sublimania OCR»; borrado/renombrado |
| **Usuarios demo** | `admin@`, `cliente@`, `mixto@`, `finanzas.demo@`, `aprobador.demo@` (`Demo1234!`) |
| **Temas** | Clásica (serif/sidebar), Moderna (sans/barra superior), Compacta (mono/rail angosto) |
| **Pendiente** | ver §6 |

## 3.30 Importador universal y rediseño de UI (v0.3.0)

**Entrada**: el importador dejó de ser solo CSV/XLSX y ahora adapta formas muy distintas sin tocar
columnas:

| Capacidad | Detalle |
|---|---|
| Formatos | CSV, TSV, TXT, JSON, XLSX, XLS, XLSM/XLSB, ODS y **PDF con texto** (extracción de streams) |
| Estructuras | Multi-hoja (descarta portadas), tablas compuestas, hojas de pedido, archivos sin cabecera de una fila, delimitador `,` `;` `\|` o tabulador |
| Enlaces imagen | Hoja auxiliar «Imagenes» vinculada por cliente/pedido, URLs http(s), data URI base64 y **maqueta SVG** de respaldo si la foto no se puede descargar |
| Seguridad | Extensiones ejecutables/comprimidas bloqueadas con `UNSUPPORTED_FILE_TYPE`; 10 MB por archivo |
| Catálogo | **Renombrar** nombre y slug desde la lista/detalle; borrar libera el slug; versión activa y cuarentena |
| UI | Rediseño de paneles y tarjetas, estudio de contenido renovado, modal de detalle en la tienda y mejoras de accesibilidad/estados vacíos |

Pruebas nuevas: `universal-import.e2e-spec.ts` (JSON, TSV, pipe, bloqueo de `.exe`),
`catalog-rename.e2e-spec.ts` (nombre/slug, conflicto 409, slug inválido) y specs unitarios de parser
para PDF/JSON/TSV/multi-hoja/tablas compuestas. **336 unit + 153 e2e** en verde.

> El OCR de PDF escaneados y las fotos como archivo siguen pendientes: hoy el PDF debe traer texto
> seleccionable.

## 3.31 OCR de fotos y PDF escaneados (v0.3.1)

| Pieza | Detalle |
|---|---|
| Proveedores | `OCR_PROVIDER=mock|tesseract`; mock determinista para CI (`OCR_MOCK_TEXT`) y Tesseract `spa+eng` con worker lazy, timeout 60 s y límite 10 MB |
| Imágenes | JPG/JPEG/PNG/WebP detectadas por magic bytes; se OCR-ean y pasan por `parseUnstructuredLines` |
| PDF escaneado | si el texto útil es <20 caracteres, extrae JPEG `/DCTDecode` (máx. 10), OCR y concatena; PDF con texto sigue por la vía rápida |
| Errores | OCR vacío → 400 `EMPTY_IMPORT` («No pudimos leer texto en la imagen»); `.exe` sigue bloqueado |
| UI | login, resumen, carga y panel de importación muestran **Foto y PDF escaneado · disponible (OCR)** |

Verificación real con Tesseract (no mock):

```text
catalogs/06-lista-ocr.png (foto de lista)
  → 4 productos reconocidos: Camisa Barcelona Yamal 7500 · Pantalón deportivo 8900 ·
    Miel orgánica 4500 · Taza cerámica 3200; encabezado en cuarentena (precio 0)
catalogs/07-lista-ocr-escaneada.pdf (PDF sin texto)
  → 1 imagen DCTDecode OCR-eada → los mismos 4 productos y precios
```

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

## 6. Pendiente (al 2026-10-29)

1. **Entradas que faltan**: WhatsApp de entrada (archivo/foto por webhook) y Google Drive (OAuth).
   Excel/CSV/TSV/TXT/JSON/XLS/ODS/PDF (texto o escaneado), **fotos con OCR**, multi-hoja, tablas
   compuestas y data URI ya están.
2. **Variantes reales** talla/color con stock/precio propios (hoy entran como atributos).
3. **F2 restante**: conciliación programada/cierre de meses y reportes por catálogo.
4. **F3 restante**: campañas de WhatsApp saliente, publicación real en redes y UI de consumo/cuota
   de IA (el guard ya existe).
5. **Producción**: onboarding de organizaciones, planes/facturación, despliegue con HTTPS y
   observabilidad, credenciales reales de `DEEPSEEK_API_KEY`/`OPENAI_API_KEY`, Stripe y WhatsApp.
6. **Endurecimiento fino**: blocklist `jti`/`sid`, aviso de `path-to-regexp` en Swagger y límite de
   intentos en webhooks.
7. **Calidad**: cobertura ≥70 % en `catalogs` y `sales`; alinear el `CHECK` de totales de `docs/03`.
