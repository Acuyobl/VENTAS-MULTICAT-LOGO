# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
semántico adaptado a hitos de fase. Fechas en `America/Costa_Rica`.

## [0.1.4] — 2026-10-28

### Añadido
- **Imágenes generadas con IA** en las publicaciones de contenido: al crear una publicación se
  genera texto + imagen; `POST /ai/social-posts/:id/image` permite regenerar con prompt propio.
- Proveedor `mock` (SVG 1080×1080 de marca, sin red ni credenciales) y `openai` (`gpt-image-1`) con
  `OPENAI_API_KEY`; la imagen se guarda en `vc-public` y se sirve con URL firmada.
- `/panel/contenido` muestra la imagen en la vista previa, el prompt usado, botón de
  generar/regenerar y miniaturas en el historial.

### Pruebas
- API: **229 unit** (41 archivos) y **98 e2e** (16 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Gastos** con categorías, filtros por rango, totales por categoría y borrado lógico
  (`/panel/gastos`).
- **Reporte de utilidad**: ingresos netos − reembolsos − gastos, margen en puntos base y desglose por
  categoría, dentro de `/panel/finanzas`.
- **Exportación CSV desde el servidor** del reporte financiero (`text/csv` con adjunto y auditoría).
- **Pasarelas por organización**: alta/edición con secretos cifrados AES-256-GCM, máscara, habilitar
  y deshabilitar, y auditoría sin secretos (`/panel/ajustes`).
- **Canal WhatsApp en el chat**: conversaciones con `channel` y `externalId`; el inbound crea la
  conversación en WhatsApp y la respuesta del staff sale por la Cloud API (409 claro si no hay
  credenciales, sin guardar el mensaje).
- Seed demo: 3 gastos del mes (₡40.500) y pasarela SANDBOX TEST habilitada.

### Pruebas
- API: **210 unit** (37 archivos) y **94 e2e** (15 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Autoaprobación configurable** por organización (`allowSelfApproval`) con confirmación explícita,
  auditoría `payment.refund_self_approved` y pantalla `/panel/ajustes`.
- **Recordatorios de cobro** por correo (SMTP/Mailpit real) y WhatsApp (Cloud API), con historial
  `payment_reminders`, estado SENT/FAILED y auditoría.
- **Reportes financieros y conciliación**: `/panel/finanzas` con rango de fechas, ventas por estado,
  cobros por método, reembolsos, cuentas por cobrar (vencidas > 30 días), top productos y exportación
  CSV; endpoints `GET /reports/finance` y `GET /reports/reconciliation`.
- **IA de contenido**: `/panel/contenido` genera publicaciones desde productos del catálogo
  (plataforma, tono, objetivo), con proveedor `mock` para demo y `deepseek` para producción, parser
  tolerante y aprobación/rechazo auditados.
- **WhatsApp entrante**: webhook con verificación de challenge y firma HMAC que crea cliente,
  conversación y mensaje.
- **Chat del backoffice**: `/panel/chat` con lista de conversaciones, no leídos, hilo y respuestas
  (`chat:write`), marcado de leídos y auditoría.
- **Seed demo**: conversación `Consulta de demo` con mensajes para probar el chat sin integraciones.

### Corregido
- El asunto de los correos con acentos/símbolos ahora se codifica con RFC 2047
  (`=?UTF-8?B?…?=`), evitando «Â·» en clientes estrictos.

### Pruebas
- API: **198 unit** (34 archivos) y **88 e2e** (14 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Reembolsos (F2.6)** con segregación de funciones: solicitud (`payment:refund_request`),
  aprobación/rechazo (`payment:refund_approve`), reembolso parcial o total, actualización
  transaccional de `Payment.status`, `Order.refundedMinor` y estado del pedido, y bloqueo de
  autoaprobación (`REFUND_SEGREGATION_REQUIRED`).
- Detalle de pedido en el backoffice (`/panel/pedidos/[orderId]`) con productos, saldos, pagos con
  monto disponible y reembolsos con acciones según permisos.
- Seed con `finanzas.demo@` (solicita) y `aprobador.demo@` (aprueba) para demostrar la segregación.

### Corregido
- Las rutas de la cara B (`/carrito`, `/checkout`, `/pedido`, `/pago`) respondían 404 cuando se
  abrían desde el host del backoffice; ahora se sirven en cualquier host.
- `.env` regenerado limpio (UTF-8 sin BOM) y un único proceso de API en el puerto 3001.

### Pruebas
- API: **166 unit** (25 archivos) y **75 e2e** (12 archivos). Web: 19 pruebas.

## [0.1.0] — 2026-10-28

Primer hito demostrable: **dos caras completas** (catálogo → venta → cobro → tienda → portal) con
datos aislados por organización y catálogo. F0 cerrado; F1 completo salvo Drive y PWA; F2 con su
primer incremento de cobros.

### Añadido

**Plataforma y seguridad**
- Monorepo pnpm + Turborepo, API NestJS 11, web Next.js 15, PostgreSQL 16/Prisma 6, Redis 7,
  MinIO y Mailpit en Docker Compose.
- Auth de dos audiencias (`staff`/`customer`) con refresh en cookie, Argon2id, TOTP, magic link,
  sesiones revocables y RBAC con permisos atómicos (`recurso:acción`).
- Auditoría con `audit_log`, outbox de eventos, idempotencia de importación y presigned URLs.
- Helper de desarrollo para autocompletar el segundo factor (deshabilitado en producción por
  fail-fast).

**Catálogo**
- CRUD de catálogos y **versiones inmutables** con una sola versión activa por catálogo.
- Importación CSV/XLSX/Google Sheets por URL, normalización de cabeceras, validación por fila,
  cuarentena y detección de duplicados.
- Productos por versión con cursor pagination, stock, SKUs y **imágenes** (subida, importación por
  URL, URLs firmadas y visualización en las dos caras).
- Catálogo público compartible `/c/[slug]` con fotos y precios.

**Ventas**
- Clientes, cotizaciones con snapshot de precios, IVA incluido/agregado y numeración
  `COT-AAAA-NNNNNN` con lock de Postgres.
- **PDF de cotización** real (pdf-lib, A4, acentos) con URL firmada de 300 s.
- Conversión a pedido `PED-AAAA-NNNNNN` sin recapturar datos, estados explícitos, entrega y
  cancelación auditadas.

**Cara B (tienda y portal)**
- Carrito persistente en el navegador, catálogo público con "Agregar", checkout de invitado y
  token público de consulta (30 días, hasheado en base de datos).
- Confirmación `/pedido/[token]`, reclamo del pedido a la cuenta y portal `/mi-cuenta/pedidos` con
  filtro de propiedad en el repositorio.

**Cobros (F2.1–F2.4)**
- Link de pago por pedido con TTL configurable, página pública `/pago/[token]` y pasarela
  **sandbox** idempotente para demos.
- Adaptador **Stripe** (Checkout Session y verificación de firma HMAC) y webhook idempotente por
  evento.
- **Pagos manuales** SINPE/transferencia/efectivo con recálculo de saldo, bloqueo de sobrepago y
  bloqueo de cancelación cuando hay pagos.

### Cambiado
- Totales se calculan siempre en el servidor con la convención de `docs/03 §3.4` (descuento reduce
  la base, subtotal neto, `total = subtotal + IVA`).
- El seed es idempotente y no destructivo: no mueve la versión activa ni pisa datos de demo.
- Las rutas de la cara B (`/c`, `/tienda`, `/carrito`, `/checkout`, `/pedido`, `/pago`, `/mi-cuenta`)
  se sirven en cualquier host; solo `/panel` se reescribe bajo `app.`.
- El bootstrap se mide con `tools/bootstrap-check.mjs` y quedó documentado en `docs/09-BOOTSTRAP.md`.

### Corregido
- Invitados sin rol ni permisos (`scopeId` nulo en asignaciones `ORGANIZATION`).
- Conversión de importes tipo `₡5.000` que devolvía 5 colones.
- Numeración y totales cuadrados contra los casos de aceptación del spec.
- MFA del admin bloqueado: reset por CLI, reset en seed y autocompletado en desarrollo.
- Paginación de productos y presigned URLs en listados y catálogo público.

### Seguridad
- `.env` fuera del repositorio; secretos de pasarelas cifrados AES-256-GCM.
- Sandbox de pagos prohibido con `NODE_ENV=production` (la API aborta al arrancar).
- Tokens públicos de pedidos guardados como `sha256`.

### Pruebas
- API: **163 unit** (24 archivos) y **67 e2e** (11 archivos), incluyendo dos caras, aislamiento
  multi-org, importación, PDF, checkout público y cobros.
- Web: 19 pruebas (caras, TOTP, carrito).
- CI en GitHub Actions: lint → typecheck → unit → cobertura → build, verde y con artefacto de
  cobertura (~640 KB).

### Conocido / pendiente
- Google Drive (OAuth) y PWA de tienda offline.
- Configuración de pasarelas por organización, reembolsos, recordatorios, conciliación y reportes
  financieros (F2.5–F2.11). Stripe real requiere credenciales.
- `Customer.type`/`Order.cancelReason` ya son columnas reales; queda endurecer el reclamo con
  límite de intentos.
- Alinear el `CHECK` de totales de `docs/03` con la convención implementada.
