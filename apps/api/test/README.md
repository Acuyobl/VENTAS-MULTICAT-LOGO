# Pruebas de `apps/api`

Batería unitaria y E2E de la API de VentasCatálogo. Cubre los criterios de
verificación de F0 (`docs/04-GUIA-IMPLEMENTACION.md` §4.1), el incremento F1 de
versionado, importación CSV/XLSX y productos por versión, las imágenes de
producto (subida a MinIO, URLs firmadas e importación con imágenes), ventas
(clientes, cotizaciones con PDF y conversión a pedido), la cara B (checkout
invitado con token público, reclamo de cuenta y portal de pedidos).

- **Unit:** 229 tests en 41 archivos (`src/**/*.spec.ts`), con Vitest. No requieren
  infraestructura: los servicios externos (ioredis, MinIO) se sustituyen por
  dobles.
- **E2E:** 98 tests en 16 archivos (`test/**/*.e2e-spec.ts`), con Supertest contra
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

| Archivo                                                    | Qué verifica                                                                                                                                                                                                                                                                                                                              | Criterio / invariante   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `src/modules/auth/token.service.spec.ts`                   | access token con `aud=staff`/`aud=customer`, `iss`, `sub`, `org`, TTL de 15 min, token vencido, MFA token con `aud=mfa` y TTL 5 min, rechazo de tokens cruzados/falsificados, el token no incluye permisos                                                                                                                                | §4.1.2, AUTHZ-T14       |
| `src/common/guards/audience.guard.spec.ts`                 | deja pasar la audiencia correcta (handler y clase), rechaza el cruce con `403 AUTH_WRONG_AUDIENCE` + `details.expected/received`, sin `@Audience` no restringe, sin usuario → 401                                                                                                                                                         | §4.1.2, AUTHZ-T09, A-R9 |
| `src/common/guards/permissions.guard.spec.ts`              | permite con permiso, `403 FORBIDDEN` con `details.missing`, comodín `*`, `@SkipPermissions`, `@Public`, sin `@RequirePermissions` → 500 `PERMISSION_UNDECLARED`, sin usuario → 401                                                                                                                                                        | §4.1.1, A-R1, AUTHZ-T06 |
| `src/modules/health/health.service.spec.ts`                | agregación de `database/redis/storage/queues`, `degraded` si falla Postgres/Redis/MinIO, tolerancia a errores de conexión sin lanzar                                                                                                                                                                                                      | §4.1.6                  |
| `src/modules/storage/storage.service.spec.ts`              | buckets por configuración, creación idempotente de buckets, arranque tolerante a MinIO caído, `ping()` true/false                                                                                                                                                                                                                         | §4.1.6                  |
| `src/modules/catalogs/import/normalize-header.spec.ts`     | normalización de cabeceras (acentos, mayúsculas, signos), sinónimos del contrato F1, `mapping` explícito gana, columnas inexistentes reportadas, sin reutilizar columnas                                                                                                                                                                  | F1 importación          |
| `src/modules/catalogs/import/parse-import-file.spec.ts`    | decodificación CSV UTF-8/BOM/latin1, detección de delimitador, cabeceras vacías/duplicadas, pipeline completo sobre `tools/fixtures/catalogo-demo.csv` (42 filas → 37 productos + 5 issues) y CSV con `;`                                                                                                                                 | F1 importación          |
| `src/modules/catalogs/import/row-validator.spec.ts`        | normalización de dinero con `toMinorAmount` (`₡`, `$`, miles, USD), `MISSING_PRICE`/`INVALID_PRICE`, `DUPLICATE_SKU` insensible a mayúsculas, `MISSING_SKU`/`MISSING_NAME`, `rawData` original, costo y stock opcionales                                                                                                                  | F1 importación          |
| `src/config/env.schema.spec.ts`                            | `DEV_AUTH_HELPERS`: default `false`, parseo `true`, fail-fast si `NODE_ENV=production` + flag encendido, valor no booleano rechazado                                                                                                                                                                                                      | Tarea 10 (dev MFA)      |
| `src/modules/auth/dev-auth.service.spec.ts`                | flag apagado → `404 NOT_FOUND` sin tocar Prisma/tokens; flag encendido + secreto → TOTP de 6 dígitos con `expiresInSeconds` 1-30; enrolamiento (`mfaEnabled=false` + `purpose=mfa:enroll`) permitido; sin secreto → `409 AUTH_MFA_INVALID` (`mfa_not_enrolled`); `mfaToken` inválido → `401 AUTH_MFA_REQUIRED`; usuario inexistente → 401 | Tarea 10 (dev MFA)      |
| `src/modules/storage/image-utils.spec.ts`                  | content-types permitidos (JPEG/PNG/WebP/SVG), normalización con parámetros, extensión canónica, `productImageKey` (`products/{catalog}/{version}/{productId}-{checksum12}.{ext}`) y validación de tamaño (≤5 MB, vacío, tipo inválido)                                                                                                    | Imágenes de producto    |
| `src/modules/catalogs/import/image-downloader.spec.ts`     | descarga con timeout de 8 s, `http_error`, `unsupported_type`, `too_large` por content-length, `timeout` y `network`                                                                                                                                                                                                                      | Imágenes de importación |
| `src/modules/catalogs/import/import-images.spec.ts`        | URL válida → descarga + subida + key con id de producto; fallo de descarga/subida → warning `IMAGE_DOWNLOAD_FAILED` sin bloquear la fila; valor relativo → `IMAGE_UNRESOLVED` sin key; sin imagen → sin warning; ids únicos por producto                                                                                                  | Imágenes de importación |
| `src/modules/sales/numbering.spec.ts`                      | formato `COT-YYYY-NNNNNN`/`PED-YYYY-NNNNNN`, sin truncar secuencias, rechazo de año/secuencia inválidos, parseo, año comercial en zona Costa Rica y claves de advisory lock                                                                                                                                                               | Ventas F1 (numeración)  |
| `src/modules/sales/quote-calculator.spec.ts`               | totales con `calculateTotals` (₡11.300×2 → 20.000/2.600/22.600), descuento por línea antes del IVA, IVA agregado, `PRODUCT_OUT_OF_STOCK` con `available`, `PRODUCT_INACTIVE`, `PRODUCT_NOT_IN_ACTIVE_VERSION`, backorder y descuento mayor que la línea                                                                                   | Ventas F1 (totales)     |
| `src/modules/sales/quote-pdf.spec.ts`                      | PDF A4 real (`%PDF-`), texto WinAnsi con acentos (María Solís, Cotización, Café), número, totales, "Documento no fiscal", paginación con 45 ítems, USD y `pdfSafeText` para caracteres fuera de cp1252                                                                                                                                    | Ventas F1 (PDF)         |
| `src/modules/storefront/token.spec.ts`                     | `sha256` del token (64 hex, determinístico, recorta espacios), tokens aleatorios de ≥40 caracteres, expiración a 30 días y detección de vencimiento (null = no vencido)                                                                                                                                                                   | Cara B (token)          |
| `src/modules/storefront/guest-customer.spec.ts`            | normalización de email (minúsculas/trim) y teléfono (colapsa espacios), precedencia email→teléfono, `null` si no hay contacto                                                                                                                                                                                                             | Cara B (invitado)       |
| `src/modules/payments/payment-calculations.spec.ts`        | saldo (nunca negativo) y estado `PENDING_PAYMENT`/`PARTIALLY_PAID`/`PAID`, sobrepago 422 con `balanceMinor`, expiración del link                                                                                                                                                                                                          | Cobros F2               |
| `src/modules/payments/stripe-signature.spec.ts`            | firma HMAC-SHA256 válida, payload alterado/secreto distinto, tolerancia de 300 s, headers malformados y varias `v1`                                                                                                                                                                                                                       | Cobros F2               |
| `src/modules/payments/stripe-events.spec.ts`               | normalización de `checkout.session.completed` y `payment_intent.succeeded` (orderId, monto, moneda) y eventos ignorados                                                                                                                                                                                                                   | Cobros F2               |
| `src/modules/payments/payments.repository.spec.ts`         | idempotencia del webhook: `P2002` → `null`, primer evento se crea, otros errores se propagan                                                                                                                                                                                                                                              | Cobros F2               |
| `src/modules/payments/gateways/stripe.gateway.spec.ts`     | Checkout Session con `fetch` mockeado (URL/Auth/body), `INTEGRATION_NOT_CONFIGURED` sin key, 502 si Stripe falla y verificación de firma                                                                                                                                                                                                  | Cobros F2               |
| `src/modules/payments/gateways/sandbox.gateway.spec.ts`    | link interno `/pago/{token}`, flag apagado → `INTEGRATION_NOT_CONFIGURED`, sin webhooks                                                                                                                                                                                                                                                   | Cobros F2               |
| `src/modules/payments/refunds/refund-calculations.spec.ts` | disponible = pago − reembolsos procesados (nunca negativo), estado del pago `PARTIALLY_REFUNDED`/`REFUNDED` y pedido `REFUNDED` solo con reembolso total                                                                                                                                                                                  | Reembolsos F2           |
| `src/modules/reports/report-range.spec.ts`                 | default mes actual en America/Costa_Rica, bordes inclusivos UTC-6, `from > to` e invalidación de fechas → 422                                                                                                                                                                                                                             | Reportes                |
| `src/modules/reports/report-calculations.spec.ts`          | totales de ventas por estado, bruto = neto + descuento, aging de vencidas >30 días y top 10 de productos por ingreso                                                                                                                                                                                                                      | Reportes                |
| `src/modules/payments/reminders/reminder-message.spec.ts`  | asunto/cuerpo con número, saldo formateado y link de pago, versión sin link, escape HTML y cuerpo plano para WhatsApp                                                                                                                                                                                                                     | Recordatorios           |
| `src/modules/ai/prompt-builder.spec.ts`                    | prompt v3 con plataforma/tono/objetivo, productos+stock e instrucciones extra, mapeos de tono divertido y objetivo educativo                                                                                                                                                                                                              | IA contenido            |
| `src/modules/ai/social-post.parser.spec.ts`                | parser tolerante: JSON puro, JSON dentro de markdown/texto, fallback a texto plano con hashtags y CTA, texto vacío sin romper                                                                                                                                                                                                             | IA contenido            |
| `src/modules/ai/mock-ai.provider.spec.ts`                  | provider mock determinista, tokens > 0, salida parseable y stream de un chunk                                                                                                                                                                                                                                                             | IA contenido            |
| `src/modules/ai/ai-provider.factory.spec.ts`               | `AI_PROVIDER=mock` en dev, deepseek sin key → 409 `INTEGRATION_NOT_CONFIGURED`, deepseek con key, mock prohibido en producción                                                                                                                                                                                                            | IA contenido            |
| `src/modules/whatsapp/whatsapp-signature.spec.ts`          | `sha256=` correcto, payload alterado/secreto distinto/header ausente y prefijo distinto rechazados                                                                                                                                                                                                                                        | WhatsApp entrante       |
| `src/modules/chat/chat-mappers.spec.ts`                    | preview recortado a 120, unreadCount, preview null sin mensajes y mapeo de mensaje con fechas ISO                                                                                                                                                                                                                                         | Chat                    |
| `src/modules/expenses/expense-calculations.spec.ts`        | totales/por categoría (BigInt), profit = neto − reembolsos − gastos, margen en puntos base con redondeo y sin ingresos, máscara de secreto                                                                                                                                                                                                | Gastos/Utilidad         |
| `src/modules/organizations/gateways.service.spec.ts`       | 422 `gateway_secret_required`, cifrado AES-256-GCM descifrable, `maskedKey` últimos 4, PATCH habilita/deshabilita y auditoría sin secretos                                                                                                                                                                                                | Pasarelas               |
| `src/modules/reports/reconciliation-csv.spec.ts`           | cabecera, filas y totales con CRLF y escape de comas/comillas/saltos de línea                                                                                                                                                                                                                                                             | Export CSV              |
| `src/modules/ai/image/svg-image.spec.ts`                   | SVG 1080×1080 con título/precio/CTA/marca, determinista, escape XML de `<>&"'`, sin producto omite precio y raíz única                                                                                                                                                                                                                    | Imágenes IA             |
| `src/modules/ai/image/image-prompt.spec.ts`                | prompt con post/producto/precio/CTA/estilo/marca e instrucciones custom                                                                                                                                                                                                                                                                   | Imágenes IA             |
| `src/modules/ai/image/mock-image.provider.spec.ts`         | SVG determinista en Buffer, `image/svg+xml`, extensión `svg` y contenido del producto                                                                                                                                                                                                                                                     | Imágenes IA             |
| `src/modules/ai/image/openai-image.provider.spec.ts`       | adapter OpenAI con fetch mockeado (b64 → PNG), 502 en HTTP no-2xx y factory: mock default, 409 sin key, modelo y fail-fast en producción                                                                                                                                                                                                  | Imágenes IA             |

### E2E

| Archivo                                       | Qué verifica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Criterio / invariante           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| `test/two-faces.e2e-spec.ts`                  | login de cliente → `aud=customer`, permisos `self:*`, cookies `vc_customer_at/rt` HttpOnly; `/auth/me`; token de cliente → `403 AUTH_WRONG_AUDIENCE` en `/users` y `/catalogs`; sin sesión → 401; body inválido → `400 VALIDATION_FAILED` con `details`; credenciales malas → 401 sin enumeración                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §4.1.2, §4.1.5, AUTHZ-T09       |
| `test/staff-mfa.e2e-spec.ts`                  | primer login de `org_admin` → `mfa_enrollment_required`; `/auth/mfa/enroll` (otplib) → secreto; OTP inválido → `401 AUTH_MFA_INVALID`; OTP válido → cookies `vc_staff_at/rt`; `/users` 200 acotado a su org (no ve miembros de Aliada); segundo login → `mfa_required` + TOTP; mfaToken inválido → 401                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | §4.1.4, RF-USR-02, A-R12        |
| `test/sessions.e2e-spec.ts`                   | refresh rota el token; reutilizar el refresh anterior → `401 AUTH_SESSION_REVOKED` (revoca la familia); `DELETE /auth/sessions/{id}` → el siguiente refresh responde `401 AUTH_SESSION_REVOKED`; refresh sin cookie → 401 `reason=refresh_cookie_missing`; refresh de cliente no sirve como staff                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | §4.1.5, RF-USR-03, AUTHZ-T13    |
| `test/multi-org-isolation.e2e-spec.ts`        | `mixto` staff en Demo: `/catalogs` solo devuelve catálogos de Demo (no el de Aliada) y sin `user:manage` → 403; `mixto` cliente en Aliada: `/auth/me` con org Aliada, solo permisos `self:*`, sin `vendedor`; su token customer contra `/catalogs` → 403 `AUTH_WRONG_AUDIENCE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §4.1.2, §4.1.3, AUTHZ-T11, A-R9 |
| `test/health.e2e-spec.ts`                     | `/health` 200 (público) y `/health/ready` 200 con `database/redis/storage/queues` en `up` contra la infra real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | §4.1.6                          |
| `test/catalog-f1.e2e-spec.ts`                 | importa el fixture real (42 filas → versión `VALIDATED` con 37 productos, 5 errors de cuarentena: 3 `DUPLICATE_SKU` + 2 `MISSING_PRICE`, y 37 warnings `IMAGE_UNRESOLVED` porque las imágenes del fixture son rutas relativas), snapshot en MinIO, auditoría `catalog.imported`; reimport idempotente (200, misma versión, 0 duplicados); `GET /imports/:jobId`; v2 con checksum distinto, activación (v1 `ARCHIVED` intacta con 37 productos, `activeVersionId`=v2, `catalog.version.activated`), `/products` por versión activa y por `versionId`; cursor `limit=10` sin repetidos ni mezcla; filtros `q`/`category`; 404 `CATALOG_NOT_FOUND` multi-org; 403 `AUTH_WRONG_AUDIENCE` cliente; 400 `INVALID_IMPORT_FILE`/`UNSUPPORTED_FILE_TYPE`/`EMPTY_IMPORT`; 409 `NO_ACTIVE_VERSION` y `VERSION_NOT_ACTIVATABLE`; validate/archive                        | F1 versionado/importación       |
| `test/dev-auth-helpers.e2e-spec.ts`           | con `DEV_AUTH_HELPERS=true`: login del admin sembrado → `mfa_enrollment_required` → `/auth/mfa/enroll` → `POST /auth/dev/totp` devuelve un TOTP de 6 dígitos válido (`authenticator.check`) y `expiresInSeconds` 1-30 → `/auth/mfa/verify` emite sesión staff; segundo login `mfa_required` resuelto solo con el helper; `mfaToken` inválido → 401; con el flag apagado (app nueva tras reiniciar el registro de módulos) → `404 NOT_FOUND` y el login sigue funcionando                                                                                                                                                                                                                                                                                                                                                                                     | Tarea 10 (dev MFA)              |
| `test/product-images.e2e-spec.ts`             | `POST /products/:id/image` con PNG real → 201, `imageKey` + `imageUrl` firmada que descarga 200; `GET /products` y `GET /catalogs/public/:slug` con `imageUrl`; reemplazo borra el objeto anterior; `DELETE` limpia `imageKey` y la URL vieja deja de servir; vendedor sin `product:write` → 403; producto de otra org → 404; 400 por vacío/GIF/PDF/>5 MB; importación con URL servida por un server HTTP efímero (`imageKey` subida a MinIO) y URL rota (warning `IMAGE_DOWNLOAD_FAILED`, producto igual creado) y valor relativo (warning `IMAGE_UNRESOLVED`)                                                                                                                                                                                                                                                                                              | Imágenes de producto            |
| `test/sales.e2e-spec.ts`                      | crea clientes PERSON/COMPANY y los busca (`q` por nombre/email); cotización con snapshot de `₡11.300`×2 → subtotal `20000`, IVA `2600`, total `22600`, número `COT-<año>-000001`; listar/obtener; `send` genera PDF real (`%PDF-`, acentos, número, "Documento no fiscal") y `/pdf` devuelve URL firmada; `accept` SENT→ACCEPTED y vencida → `QUOTE_EXPIRED`; `convert` → pedido `PENDING_PAYMENT` `PED-<año>-000001` con los mismos totales, segunda conversión → 409 `QUOTE_ALREADY_CONVERTED` con `details.orderId`; stock insuficiente → `PRODUCT_OUT_OF_STOCK` + `available`; producto de versión archivada → `PRODUCT_NOT_IN_ACTIVE_VERSION`; catálogo con versión ARCHIVED → `CATALOG_ARCHIVED`; 403 `FORBIDDEN`/`AUTH_WRONG_AUDIENCE`; 404 multi-org; cancelar pedido con pago → `ORDER_HAS_PAYMENTS`; `fulfill` y transición inválida; audit/outbox | Ventas F1                       |
| `test/storefront.e2e-spec.ts`                 | checkout público (`POST /storefront/checkout`) 2×₡11.300 → 201 con número `PED-<año>-000001`, total `22600`, token de ≥40 caracteres y expiración ~30 días; en DB solo se guarda el SHA-256; `GET /storefront/orders/:token` devuelve ítems/totales; token inválido → 404; expirado → 409 `VALIDATION_FAILED` con `reason=order_token_expired`; stock → 409 `PRODUCT_OUT_OF_STOCK` + `available`; claim con el email correcto reasigna al Customer de la cuenta, marca `claimedAt` y aparece en `/me/orders`; otro cliente no lo ve (404); email distinto → 404; sin email de contacto → 409 `claim_email_missing`; staff en `/me/*` → 403 `AUTH_WRONG_AUDIENCE`; cancelar guarda `cancelReason` sin tocar `notes`; `Customer.type` persistido (COMPANY/PERSON)                                                                                              | Cara B                          |
| `test/payments.e2e-spec.ts`                   | link sandbox para pedido → `ACTIVE` con monto = saldo y URL `/pago/{token}`; `GET /payments/public/link/:token` devuelve link + pedido; confirmación sandbox cobra (`PAID`, `paidMinor=total`, un solo `Payment`, link `USED`) y la segunda es `alreadyProcessed`; link expirado → 409 `payment_link_expired`; pago manual parcial → `PARTIALLY_PAID` + `balanceMinor`, sobrepago → 422 y completar saldo → `PAID`; webhook Stripe firmado registra el pago una sola vez (`idempotent` en el reintento) y firma inválida → 400 `PAYMENT_SIGNATURE_INVALID`; pedido pagado no se cancela (`ORDER_HAS_PAYMENTS`) ni regenera link; cross-org 404; sandbox apagado → 404                                                                                                                                                                                        | Cobros F2                       |
| `test/refunds.e2e-spec.ts`                    | pago manual de un pedido → solicitud de reembolso parcial `REQUESTED`; aprobación por **otro** usuario → `PROCESSED`, `Payment.status=PARTIALLY_REFUNDED`, `Order.refundedMinor` y estado del pedido intacto; disponible correcto; `REFUND_EXCEEDS_PAID` (422 con `availableMinor`); el aprobador no puede aprobar su propia solicitud (`REFUND_SEGREGATION_REQUIRED`); reembolso del saldo restante → `REFUNDED`; aprobación duplicada → 409 `refund_already_decided`; rechazo deja `REJECTED` sin tocar saldos; pago `FAILED` no reembolsable; 403 sin `payment:refund_request`/`payment:refund_approve`; cross-org 404                                                                                                                                                                                                                                    | Reembolsos F2                   |
| `test/settings-reminders-reports.e2e-spec.ts` | `GET/PATCH /organizations/settings` (auditado, 403 finanzas); autoaprobación: flag off → 409 `REFUND_SEGREGATION_REQUIRED`, flag on sin confirmar → 422 `self_approval_confirmation_required`, con `confirmSelfApproval` → aprueba y audita `payment.refund_self_approved`; recordatorio EMAIL enviado de verdad por Mailpit (fila `SENT` + listado + Mailpit) y WhatsApp sin credenciales → 409 / sin teléfono → 422; `/reports/finance` del mes con totales, métodos, `topProducts` y cuentas por cobrar; `/reports/reconciliation` con referencia y neto; rango inválido 422 y 403 vendedor; cross-org 404                                                                                                                                                                                                                                                | Ajustes/Reportes F2             |
| `test/ai-chat-whatsapp.e2e-spec.ts`           | `POST /ai/social-posts` con `AI_PROVIDER=mock` → 201 DRAFT con title/body/hashtags/cta y tokens > 0 (audit `ai.social_post_generated`), listado, decisión APPROVED auditada y 403 del vendedor; `AI_PROVIDER=deepseek` sin key → 409 `INTEGRATION_NOT_CONFIGURED` en app nueva; webhook WhatsApp GET challenge/403 y POST con firma HMAC (inválida → 401) que crea conversación+mensaje; `/chat/conversations` con unread 1, abrir marca leído, responder STAFF y cross-org 404; conversación demo del seed presente                                                                                                                                                                                                                                                                                                                                         | IA/WhatsApp/Chat F3             |
| `test/finance-gateways-chat.e2e-spec.ts`      | gastos: crear(3+1)/listar con totales y `byCategory`/filtrar/soft delete, 404 cross-org y 403 vendedor; `/reports/profit` con venta+3 gastos → `profitMinor = neto − reembolsos − gastos` y margen coherente; export CSV `text/csv` + `Content-Disposition` + audit `report.exported`; gateways PUT 422 sin secreto, cifra/máscara, GET sin secretos, PATCH y audit sin secretos; chat `channel` WEB/WHATSAPP, respuesta WEB 201, WHATSAPP sin credenciales 409 sin guardar mensaje, cross-org 404; inbound WA setea `channel=WHATSAPP` y `externalId`                                                                                                                                                                                                                                                                                                       | Cierre F2 + WhatsApp saliente   |
| `test/ai-images.e2e-spec.ts`                  | `POST /ai/social-posts` con `IMAGE_PROVIDER=mock` → 201 con `imageUrl` firmada e `imageProvider=mock`; la URL descarga 200 `image/svg+xml` con el SVG; `POST /:id/image` con prompt custom cambia `imagePrompt` y sobrescribe la misma key (audit `ai.social_post_image_generated`); listado con `imageUrl`; 403 sin `social:generate`, 404 cross-org y 409 con `IMAGE_PROVIDER=openai` sin key en app nueva                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Imágenes con IA                 |

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

## Hallazgos de imágenes de producto (tarea 11)

- `imageUrl` es una URL presignada del bucket privado `vc-products`: TTL de
  **900 s** en `GET /products` y respuestas de subida, y **3600 s** en
  `GET /catalogs/public/:slug` (que además conserva `imageKey`). Si MinIO no
  responde, el listado no falla: `imageUrl` queda `null` y la UI usa placeholder.
- Las operaciones de storage que fallan responden `503 INTERNAL_ERROR` con
  `details.reason = 'storage_unavailable'` (no se agregó un código nuevo a
  `packages/contracts`): aplica a subida y borrado; el borrado del objeto viejo es
  best-effort.
- La importación resuelve la columna `imagen`: URL `http(s)` accesible → se sube a
  MinIO; URL rota → warning `IMAGE_DOWNLOAD_FAILED`; valor relativo → warning
  `IMAGE_UNRESOLVED`. Los warnings no bloquean la fila ni cuentan como
  cuarentena, y por eso el import del fixture ya no guarda `img/sku-…` como key.
- El seed sube SVG demo determinísticos (color y texto por SKU) a `vc-products`
  para la versión demo **y** para la versión activa del catálogo demo, y limpia
  objetos huérfanos de ese catálogo. Es best-effort: si MinIO no está arriba, el
  seed termina igual con un aviso.

## Hallazgos de ventas (clientes, cotizaciones y pedidos)

- `Customer.type` (`PERSON`/`COMPANY`) es una columna real desde la migración
  `storefront_orders_and_debts`; antes se guardaba en `customer.notes` como sobre
  JSON. El motivo de cancelación de un pedido también vive en
  `orders.cancelReason` (no se concatena en `notes`).
- Numeración: `COT-YYYY-NNNNNN` para cotizaciones y `PED-YYYY-NNNNNN` para
  pedidos, secuencial por organización y **año comercial de Costa Rica**, con
  `pg_advisory_xact_lock` dentro de la transacción (el lock se usa con
  `$executeRaw` porque `pg_advisory_xact_lock` devuelve `void` y `$queryRaw` no
  lo deserializa).
- La conversión copia snapshots y totales de la cotización sin recalcular; el
  pedido nace `PENDING_PAYMENT`. Cancelar con pagos registrados responde
  `ORDER_HAS_PAYMENTS`; las transiciones inválidas `ORDER_INVALID_TRANSITION` con
  `details.from/to/allowed`. Los estados de cotización no cubiertos por el
  contrato (`accept`/`convert` desde un estado distinto) responden 409
  `VALIDATION_FAILED` con `details.reason`.
- El PDF usa `pdf-lib` + `StandardFonts.Helvetica` (WinAnsi); el colón `₡` y
  cualquier carácter fuera de cp1252 se normalizan antes de dibujar para que el
  documento nunca falle. Se guarda en `vc-docs` como `quotes/{orgId}/{quoteId}.pdf`
  y se sirve con URL firmada de 300 s.
- El seed crea clientes demo (`cliente@`, `maria.solis@`, `compras@`, este último
  `COMPANY`) y asigna los permisos de ventas a `org_admin`, `catalog_admin`,
  `vendedor`, `finanzas` y `superadmin`.

## Hallazgos de la cara B (checkout invitado y portal)

- Migración `20261028171500_storefront_orders_and_debts`: agrega el enum
  `CustomerType`, `customers.type` y las columnas `orders.publicToken` (único),
  `publicTokenExpiresAt`, `claimedAt` y `cancelReason`. Resuelve la deuda de
  ventas: el motivo de cancelación ya no se concatena en `notes` y
  `Customer.type` es una columna real. Como el shell no es interactivo,
  `prisma migrate dev` no puede correr; la migración se generó con
  `prisma migrate diff` y se aplicó con `prisma migrate deploy`.
- El token del pedido es aleatorio (32 bytes base64url) y **solo se devuelve en
  claro en el checkout**; la base guarda `sha256(token)` en `publicToken`. La
  búsqueda pública siempre hashea el token recibido. Expira a los 30 días: pasado
  ese plazo responde 409 `VALIDATION_FAILED` con `details.reason =
'order_token_expired'` (token inexistente → 404).
- Reclamo: solo el email de la sesión customer que coincide con el email del
  cliente invitado puede reasignar el pedido a su `Customer` y marcar
  `claimedAt`; email distinto o pedido ya reclamado por otro → 404 (no se revela
  existencia). Sin email de contacto → 409 `claim_email_missing`.
- `/me/orders` y `/me/orders/:id` filtran por `customerId` **en la firma del
  repositorio** (resuelto desde el `CustomerAccount` de la sesión, nunca por
  query param). Un token `aud=staff` contra `/me/*` → 403
  `AUTH_WRONG_AUDIENCE`.
- El checkout reutiliza el patrón de snapshots de ventas y la secuencia
  `PED-YYYY-NNNNNN`; los warnings de imágenes no aplican aquí.

## Hallazgos de imágenes con IA (F3)

- Migración `20261028210000_social_post_images`: `SocialPost.imageKey`,
  `imagePrompt`, `imageProvider`, `imageModel` (nullable). El contrato
  `socialPostSchema` ya trae `imageUrl/imagePrompt/imageProvider`.
- `ImageProvider` (`mock|openai`) se resuelve con `IMAGE_PROVIDER` (default
  `mock`): el mock dibuja un SVG 1080×1080 determinista con degradado de marca,
  título, producto/precio, CTA y "VentasCatálogo"; `openai` usa `gpt-image-1` por
  fetch (timeout 60 s) y sin `OPENAI_API_KEY` → 409 `INTEGRATION_NOT_CONFIGURED`.
  `validateEnv` aborta si `IMAGE_PROVIDER=mock` con `NODE_ENV=production`.
- La imagen se genera **best-effort** al crear el post: si el proveedor falla o
  no está configurado, el post queda con `imageUrl=null` y se loguea el warning.
  `POST /ai/social-posts/:id/image` regenera (409 si no hay proveedor) y audita
  `ai.social_post_image_generated` sin secretos.
- Almacenamiento: se agregaron `putPublicObject`/`presignPublicObject(Safe)`/
  `removePublicObject` a `StorageService` (bucket `vc-public`), key
  `ai/posts/{orgId}/{postId}.{ext}` que se sobrescribe al regenerar; la URL
  firmada se expone con TTL de 3600 s. Los tests borran los objetos en `afterAll`.

## Hallazgos del cierre de F2 (gastos, pasarelas y WhatsApp saliente)

- Migración `20261028200000_chat_channel_and_external_id`: `ChatConversation.channel`
  (default `WEB`) y `externalId` (wa_id). `Expense` y `PaymentGatewayConfig` ya
  existían, no necesitaron cambios de esquema.
- Gastos: soft delete vía `deletedAt`; los totales del listado se calculan sobre
  todo el rango filtrado (no solo la página). El rango por defecto es el mes actual
  en America/Costa_Rica reutilizando `resolveReportRange`.
- Utilidad: `profitMinor = netMinor − refundedMinor − expenses.totalMinor`, con
  `refundedMinor` = reembolsos `PROCESSED` del rango; `marginBp` se calcula en
  enteros (half-up) y es 0 si `netMinor = 0`. El CSV de exportación reutiliza las
  filas de conciliación y agrega filas TOTAL/REEMBOLSADO/NETO.
- Pasarelas: `PUT` exige `secretKey` nueva o previa cuando `enabled=true` (422
  `gateway_secret_required`); los secretos se cifran con AES-256-GCM
  (`encryptSecret`/`ENCRYPTION_KEY`), se expone solo `maskedKey` (últimos 4) y
  `hasSecret`, y las auditorías `payment.gateway_updated` guardan before/after sin
  secretos. `PATCH` solo cambia `enabled` (también exige secreto al habilitar).
- Chat: `conversationSummary.channel` viene de la migración; el inbound WhatsApp
  actualiza `channel='WHATSAPP'` y `externalId=wa_id`. Un mensaje STAFF en una
  conversación WHATSAPP sin credenciales responde 409 `INTEGRATION_NOT_CONFIGURED`
  **sin crear** el mensaje; el canal WEB mantiene `chat.message_sent`. WhatsApp
  saliente exitoso audita `chat.message_sent_channel`.
- Seed demo: 3 gastos `Demo seed · …` del mes actual (idempotentes por descripción)
  y `PaymentGatewayConfig` SANDBOX TEST habilitada sin secretos.

## Hallazgos de IA, WhatsApp entrante y chat (F3)

- No hizo falta migración: `SocialPost`, `ChatConversation`, `ChatMessage` y
  `AiUsageLedger` ya existen desde el esquema inicial.
- `AI_PROVIDER=mock` (determinista, sin red) permite que la UI de contenido
  funcione sin credenciales; `validateEnv` aborta si se usa con
  `NODE_ENV=production` y `AiProviderFactory` también responde 409 en runtime.
  `deepseek` sin `DEEPSEEK_API_KEY` → 409 `INTEGRATION_NOT_CONFIGURED`.
- El parser del output del modelo es tolerante: acepta JSON con o sin fences de
  markdown, JSON embebido en texto y, como último recurso, arma título/cuerpo/
  hashtags/CTA desde texto plano. El mock devuelve tokens 320/180 y el costo se
  calcula con `computeCostMicroUsd` de `packages/ai`.
- WhatsApp entrante: la verificación GET exige `WHATSAPP_VERIFY_TOKEN` configurado
  (si está vacío responde 403) y el POST valida `x-hub-signature-256` HMAC-SHA256
  solo cuando `WHATSAPP_APP_SECRET` está configurado; sin secretos funciona en
  modo demo. Resuelve la organización por `WHATSAPP_ORG_SLUG` (default `demo`) y
  usa su primer catálogo; el número saliente no hace falta para recibir mensajes.
- Chat: `unreadCount` cuenta mensajes CUSTOMER con `readAt` null; abrir
  `GET /chat/conversations/:id/messages` los marca leídos. La conversación demo
  (`Consulta de demo`, 1 CUSTOMER sin leer + 1 STAFF) se crea en el seed de forma
  idempotente si no tiene mensajes.
- `package/contracts` y `apps/web` no se tocaron; los esquemas usados son los ya
  publicados por el lead.

## Hallazgos de ajustes, recordatorios y reportes (F2)

- Migración `20261028190000_self_approval_and_reminders`: `Organization.allowSelfApproval`
  (default false), enums `ReminderChannel`/`ReminderStatus` y tabla `payment_reminders`.
- Autoaprobación configurable: con el flag apagado el solicitante sigue recibiendo
  409 `REFUND_SEGREGATION_REQUIRED`; con el flag encendido debe enviar
  `confirmSelfApproval: true` (si no, 422 `VALIDATION_FAILED` con
  `reason=self_approval_confirmation_required`) y la aprobación queda auditada como
  `payment.refund_self_approved` con `selfApproval: true`. Cambiar el ajuste audita
  `organization.settings_updated` con before/after.
- Recordatorios: EMAIL usa el `EmailService` real (SMTP/Mailpit local); WhatsApp usa
  `WhatsappService` (Cloud API por `fetch` con timeout) y responde 409
  `INTEGRATION_NOT_CONFIGURED` si faltan credenciales. Cada intento queda en
  `payment_reminders` (SENT/FAILED + error) y auditado como `payment.reminder_sent`.
  Orden de validaciones: pedido con saldo → email/teléfono del cliente → credenciales.
- Reportes: rango por defecto = mes actual en America/Costa_Rica (bordes inclusivos
  UTC-6; `from > to` → 422). `grossMinor = netMinor + discountMinor`;
  `balanceMinor`/`receivables` incluyen pedidos no cancelados/reembolsados con saldo;
  vencidas = creadas hace más de 30 días. Reconciliación usa pagos confirmados del
  rango (`paidAt`) y reembolsos `PROCESSED` por pago.
- Los reportes trabajan con la moneda por defecto de la organización
  (`Organization.defaultCurrency`); no convierten montos multi-moneda.

## Hallazgos de cobros (F2)

- Migración `20261028173500_payments_links_and_gateways`: enum `SANDBOX` en
  `PaymentProvider`, `payments.reference`, tablas `payment_links` (token único) y
  `payment_gateway_configs` (única por org+provider). Aplicada con
  `prisma migrate diff` + `prisma migrate deploy` + `prisma generate` (el shell no
  es interactivo).
- `POST /orders/:id/payment-link` crea el link con token aleatorio (24 bytes
  base64url), monto por defecto = `totalMinor - paidMinor` y expiración de 60 min
  por defecto (`PAYMENTS_LINK_TTL_MINUTES`). Rechaza pedidos no cobrables
  (`ORDER_INVALID_TRANSITION`) y montos > saldo / ≤ 0 (422 `VALIDATION_FAILED`).
- Sandbox: el link apunta a `${WEB_PUBLIC_URL}/pago/{token}` y se cobra con
  `POST /payments/sandbox/:token/confirm`. Es idempotente por transición del link
  a `USED`: la segunda confirmación devuelve `alreadyProcessed=true` sin duplicar
  el `Payment`. Con `PAYMENTS_SANDBOX_ENABLED=false` el endpoint responde 404 y la
  pasarela se comporta como no configurada; `validateEnv` aborta si el flag está
  encendido con `NODE_ENV=production`.
- Stripe: `createLink` usa Checkout Sessions por `fetch` (sin SDK) con
  `STRIPE_SECRET_KEY`; sin key → 409 `INTEGRATION_NOT_CONFIGURED`. El webhook
  `POST /payments/webhooks/:provider` verifica `stripe-signature` (HMAC-SHA256,
  tolerancia 300 s) con `STRIPE_WEBHOOK_SECRET` y es idempotente por
  `(provider, externalEventId)` en `payment_webhook_events` (el reintento responde
  200 `idempotent: true`).
- Pagos manuales (CASH/TRANSFER/SINPE): crean `Payment` `SUCCEEDED` y recalculan
  `Order.paidMinor`/estado (`PARTIALLY_PAID`/`PAID`) en una transacción; sobrepago
  → 422. Un pedido con pagos no se cancela (`ORDER_HAS_PAYMENTS`, que gana sobre la
  transición de estado).

## Hallazgos de reembolsos (F2)

- Migración `20261028180000_refunds_segregation`: enum `RefundStatus`
  (`REQUESTED`/`PROCESSED`/`REJECTED`), `PARTIALLY_REFUNDED` en `PaymentStatus`,
  `Order.refundedMinor` y la tabla `refunds`. Aplicada con `prisma migrate diff` +
  `deploy` + `generate` (shell no interactivo).
- Permisos nuevos: `payment:refund_request` y `payment:refund_approve`.
  `org_admin`/`catalog_admin` tienen ambos; `finanzas` solo solicita; `vendedor`
  ninguno. Esto permite probar la segregación en la demo.
- **Segregación de funciones**: el aprobador no puede ser quien solicitó el
  reembolso (`409 REFUND_SEGREGATION_REQUIRED` con los dos userIds). Aprobar dos
  veces responde `409 VALIDATION_FAILED` con `reason=refund_already_decided` y no
  duplica montos.
- Disponible = `Payment.amountMinor − Σ reembolsos PROCESSED`; pedirlo por encima
  responde `422 REFUND_EXCEEDS_PAID` con `details.availableMinor`. Solo se
  reembolsan pagos `SUCCEEDED`/`PARTIALLY_REFUNDED` (si no → `409
PAYMENT_NOT_REFUNDABLE`). La aprobación revalida el disponible dentro de la
  transacción y actualiza `Payment.status`, `Order.refundedMinor` y el estado del
  pedido (`REFUNDED` solo con reembolso total; el parcial conserva `PAID`).
- `GET /orders/:id/refunds` devuelve `balanceMinor = paidMinor − refundedMinor`
  (saldo reembolsable), decisión documentada porque el contrato no lo explicita.
- Seed demo: `finanzas.demo@ventascatalogo.local` (solicita) y
  `aprobador.demo@ventascatalogo.local` (catalog_admin, aprueba), ambos
  `Demo1234!` y sin MFA obligatorio.

## Añadir un test

- Unitario: `src/<módulo>/<archivo>.spec.ts` (misma carpeta que el fuente).
- E2E: `test/<flujo>.e2e-spec.ts`. Reutilizá `test/helpers/test-harness.ts`
  (crea la app sin `listen`) y `test/helpers/fixtures.ts` (usuarios/catálogos
  efímeros y limpieza). Nunca compartas datos entre archivos: cada archivo crea
  y borra lo suyo.
