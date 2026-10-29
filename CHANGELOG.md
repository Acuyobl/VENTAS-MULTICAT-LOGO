# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado
semántico adaptado a hitos de fase. Fechas en `America/Costa_Rica`.

## [0.3.1] — 2026-10-29

### Añadido
- **OCR de fotos y PDF escaneados**: el importador acepta JPG/JPEG/PNG/WebP y PDFs sin texto
  seleccionable. Usa `OCR_PROVIDER=mock|tesseract` (Tesseract `spa+eng`, timeout 60 s); en PDF
  escaneados extrae las imágenes `DCTDecode` y las OCR-ea. OCR vacío → 400 `EMPTY_IMPORT` con
  mensaje claro.
- UI actualizada: foto y PDF escaneado figuran como **disponibles (OCR)** en login, resumen, carga
  de catálogo y panel de importación.
- Ejemplos en `catalogs/`: `06-lista-ocr.png` y `07-lista-ocr-escaneada.pdf`.

### Verificado
- OCR real con Tesseract: la foto de lista reconoció 4 productos con precios y el PDF escaneado los
  mismos 4; el encabezado quedó en cuarentena con motivo.

### Pruebas
- API: **354 unit** (59 archivos) y **157 e2e** (31 archivos; nuevo `ocr-import`). Web: 19 pruebas.

## [0.3.0] — 2026-10-29

### Añadido
- **Importador universal**: acepta CSV, TSV, TXT, JSON, XLSX, XLS, XLSM/XLSB, ODS y **PDF con
  texto**, con delimitadores `,` `;` `|` o tabulador, archivos sin cabecera, **multi-hoja**,
  **tablas compuestas** y hojas auxiliares de imágenes vinculadas por cliente/pedido. Los
  ejecutables/comprimidos se rechazan con `UNSUPPORTED_FILE_TYPE`.
- **Maqueta SVG de respaldo**: si una imagen no se puede descargar (URL rota, ruta relativa), el
  producto recibe una maqueta visual generada en MinIO en vez de quedar sin foto.
- **Renombrar catálogo**: PATCH de nombre/slug desde la lista y el detalle, con validación de slug,
  conflicto 409 y actualización de la tienda pública.
- **Rediseño de UI**: nuevo sistema visual, estudio de contenido renovado, modal de detalle de
  producto en la tienda y mejoras en paneles/tarjetas/estados vacíos.

### Pruebas
- API: **336 unit** (58 archivos) y **153 e2e** (30 archivos; nuevos `universal-import` y
  `catalog-rename`). Web: 19 pruebas. CI con cobertura.

## [0.2.9] — 2026-10-29

### Añadido
- **Endurecimiento de producción**:
  - **Cuota mensual de IA** (`AI_MONTHLY_QUOTA_TOKENS`, default 2.000.000): bloquea la generación
    con **429 `RATE_LIMITED`** (`reason=ai_monthly_quota_exceeded`) y reporta tokens consumidos.
  - **Email real con Resend** (`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`) con timeout y fallback
    silencioso.
  - **Anti-enumeración de usuarios**: verificación Argon2id dummy en logins con email inexistente.
  - **Secretos de pasarela por organización**: descifrado con `ENCRYPTION_KEY` y preferencia sobre
    la clave global de Stripe.
  - **`STORAGE_PUBLIC_URL`** para reescribir las URLs firmadas de MinIO detrás de proxy/CDN.
  - **Outbox confiable**: `fetchPending`, `markPublished` y `markFailed` con backoff exponencial y
    límite de 5 intentos.

### Documentación
- README, índice de docs, estado F0 (nota histórica), estado F1/F2/F3 (nuevas §3.28 y §3.29),
  bootstrap, guion de demo v0.2.9, posicionamiento y changelog actualizados al estado real.

### Pruebas
- API: **327 unit** (58 archivos) y **149 e2e** (28 archivos). Web: 19 pruebas. CI con cobertura.

## [0.2.8] — 2026-10-28

### Corregido
- **Borrar catálogo**: además de estar en el detalle y en la carga, ahora hay un botón **Eliminar
  catálogo** visible en **cada fila** del listado `/panel/catalogos`.
- Al eliminar se **libera el slug**: se renombra a `<slug>-eliminado-<sufijo>`, así se puede volver a
  crear un catálogo con el mismo nombre/slug (204; público viejo 404; recrear 201; DELETE repetido
  404). Se mantiene el bloqueo **409** si hay pedidos abiertos.

### Pruebas
- API: **327 unit** (58 archivos) y **149 e2e** (28 archivos). Web: 19 pruebas. CI con cobertura.



### Cambiado
- **Norte del producto**: «Subí tu catálogo como sea (Excel, PDF, foto, WhatsApp) y el agente lo
  convierte en un catálogo vendible, publicable y cobrable — sin que toques una columna.»
  Aplicado al **login**, al **resumen del panel** (4 tarjetas de entrada) y a **Cargar catálogo**,
  con estados honestos: Excel/CSV **Disponible**; PDF, foto y WhatsApp **En camino**.
- Nuevo [docs/11-POSICIONAMIENTO.md](docs/11-POSICIONAMIENTO.md) con la anatomía de la promesa,
  reglas de comunicación y hoja de ruta para cumplirla completa.

### Pruebas
- API: **325 unit** y **147 e2e**. Web: 19 pruebas. CI con cobertura.

## [0.2.6] — 2026-10-28

### Corregido
- **Tarjetas de `/panel/productos`**: las clases del markup estaban duplicadas
  (`bo-bo-product-tile__media`/`bo-bo-product-tile__body`) y no aplicaban el CSS, por lo que la
  imagen y el texto se recortaban. Ahora la tarjeta es flex en columna, imagen 4:3 con `object-fit:
  cover`, nombre a dos líneas, categoría con elipsis y precio alineado al pie.
- **Detalle del producto**: mismas clases duplicadas en `bo-bo-product-detail__media/__image`; la
  foto vuelve a ser cuadrada y ordenada.

### Pruebas
- API: **325 unit** y **147 e2e**. Web: 19 pruebas. CI con cobertura.



### Añadido
- **Catálogo real de SUBLIMANIA CR**: el XLSX era una hoja de pedidos con fotos incrustadas.
  `tools/convert-sublimania.py` la convierte en `catalogs/05-sublimania-cr.csv` (3 camisas, fotos
  como data URI, precio sugerido = costo × 1.5) y quedó cargado/activo en `/c/sublimania-cr`.
- El importador ahora **reconoce hojas de pedido**: `CAMISA`/`PLAYERA`/`BLUSA`/… como nombre,
  fallback de nombre por columna TEXT, precio a partir del costo si no hay precio, SKU sintetizado
  y **imágenes data URI** (base64) además de URLs.

### Pruebas
- API: **325 unit** (58 archivos) y **147 e2e** (27 archivos). Web: 19 pruebas. CI con cobertura.



### Corregido
- **Productos por catálogo**: al cambiar de catálogo en `/panel/productos?catalogo=…`, el listado
  conservaba los productos del catálogo anterior (el componente cliente mantenía su estado inicial).
  Ahora el listado se remonta por catálogo y muestra **solo los productos del catálogo elegido**,
  con sus filtros y versión reiniciados.

### Pruebas
- API: **313 unit** y **145 e2e**. Web: 19 pruebas. CI con cobertura.



### Añadido
- **Carpeta `catalogs/`** en la raíz con **4 catálogos de ejemplo** en formatos distintos (CSV UTF-8,
  CSV Windows-1252 con `;`, XLSX estándar y XLSX con encabezados raros), con fotos reales,
  descripciones, campos extra, `manifest.json` y guía.
- **Pantalla «Cargar catálogo»** (`/panel/catalogos/importar`): crear catálogo nuevo o elegir uno
  existente, analizar con IA, importar (reemplazar/fusionar), activar la versión y **preguntar antes
  de reemplazar**; opción explícita de **eliminar el catálogo anterior** con confirmación (409 si
  tiene pedidos abiertos).
- Scripts `generate-catalogs.mjs` e `import-demo-catalogs.mjs` para regenerar y cargar los catálogos.

### Corregido
- **Descarga de imágenes del importador**: User-Agent descriptivo, limpieza de `utm_*`, reintentos
  con backoff para 429/5xx, `Retry-After`, concurrencia ≤3 y 20 s por imagen. Los 4 catálogos quedan
  con **32/32 imágenes** (antes fallaban por 403/429 de Wikimedia).

### Pruebas
- API: **313 unit** (56 archivos) y **145 e2e** (26 archivos). Web: 19 pruebas. CI con cobertura.



### Corregido
- **Contenido con IA**: cambiar **plataforma, tono u objetivo** no cambiaba el resultado. Ahora:
  - Texto: títulos, ganchos, CTA y hashtags varían por combinación (WhatsApp sin hashtags).
  - Imagen: insignia de plataforma con color, insignia de objetivo
    (OFERTA/NUEVO/ÚLTIMOS DÍAS/APRENDÉ), paleta por tono y variante distinta; se mantiene la foto
    del producto y los atributos `data-platform`/`data-tone`/`data-goal`.
  - El prompt incluye metadatos de plataforma/tono/objetivo y regenerar con otro diseño los conserva.

### Pruebas
- API: **309 unit** (56 archivos) y **145 e2e** (26 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **3 temas visuales de toda la app** seleccionables por el administrador en Ajustes:
  - `CLASICA`: serif editorial, menú lateral numerado, espaciado amplio.
  - `MODERNO`: sans más grande, **barra de navegación superior**, acento verde azulado, grilla densa.
  - `COMPACTO`: títulos mono, rail angosto y alta densidad para operar rápido.
- Los temas cambian **tipografía, tamaños, densidad, el shell de navegación y el orden de los menús**
  en backoffice, tienda y portal.
- `Organization.appTheme` + `GET /public/app-settings` (público) para aplicar el tema sin sesión;
  selector con miniaturas en `/panel/ajustes` («Usar este tema»), auditado.

### Pruebas
- API: **299 unit** (54 archivos) y **143 e2e** (25 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **PWA de la tienda**: manifest, service worker (network-first para navegación, cache-first para
  assets), página offline, íconos 192/512 y maskable; registro solo en producción.
- **Chat del cliente en el portal**: `/mi-cuenta/chat` con hilo y envío; el staff lo ve en
  `/panel/chat` con no leídos; conversación WEB creada automáticamente si no existe.
- **Borrar/archivar catálogo**: `DELETE /catalogs/:id` con soft delete, archivo de la versión activa
  y bloqueo si hay pedidos abiertos; botón con confirmación en el detalle.
- **Reporte financiero en PDF**: `GET /reports/finance/pdf` con ventas, pagos por método,
  reembolsos, gastos/utilidad y conciliación; botón «Reporte PDF» en Finanzas.
- **E2E del DoD de F1**: flujo completo catálogo → importar → activar → cotizar → PDF → pedido →
  entrega.

### Pruebas
- API: **295 unit** (53 archivos) y **138 e2e** (24 archivos). Web: 19 pruebas. CI con cobertura.



### Corregido
- **Textos con `�` (U+FFFD)** en catálogo, chat, clientes, gastos, notas, reembolsos y prompts:
  14 registros reparados con `apps/api/scripts/scan-encoding.mjs`; la base quedó sin caracteres de
  reemplazo.
- **Guardia global de entrada**: los bodies JSON/multipart con U+FFFD se rechazan con 422
  `VALIDATION_FAILED` (`reason=invalid_encoding` + campo), salvo archivos y webhooks firmados.
- **Importador tolerante**: CSV en Windows-1252/Latin-1 (Excel en español) se decodifica bien
  (`Café`, `Piña`); un U+FFFD literal va a cuarentena `INVALID_TEXT_ENCODING` sin guardarse.

### Pruebas
- API: **288 unit** (50 archivos) y **128 e2e** (21 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Galería de productos** en `/panel/productos`: tarjetas con la foto grande del producto, filtros
  y paginación; cada tarjeta abre el detalle.
- **Detalle de producto** (`/panel/productos/<id>`): imagen, precio, costo, stock, descripción,
  catálogo/versión, **campos dinámicos del importador** y gestión de la foto.
- **Edición de producto**: `GET /products/:id` y `PATCH /products/:id` con validaciones y auditoría;
  solo la versión activa es editable (archivada → 409) y `costMinor` se oculta a roles sin permiso.

### Pruebas
- API: **279 unit** (49 archivos) y **124 e2e** (20 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Tres diseños de imagen** para contenido, configurables por organización: `CLASICA` (foto a
  sangre con overlay), `EDITORIAL` (panel crema + foto al 55 %, tipografía serif) y `PROMO` (badge
  «OFERTA», banda diagonal, precio grande).
- Selector en **`/panel/ajustes`** con tarjetas de vista previa (`GET /ai/image-designs`) y botón
  **«Usar este diseño»**; el cambio queda auditado y aplica a imágenes nuevas y regeneradas.
- `imageDesign` en `Organization` y `SocialPost`; override por publicación al regenerar
  (`POST /ai/social-posts/:id/image` con `design`).
- Los tres estilos embeben la foto real del producto y caen a un degradado de marca si no hay foto.

### Pruebas
- API: **273 unit** (46 archivos) y **118 e2e** (19 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Importador inteligente A+B+C**: analizador que infiere tipos de columna, mapea por sinónimos y
  similitud, propone campos extra e ignora columnas de ruido; agente de IA (mock/deepseek) que
  propone el plan en JSON validado y se autocorrige con fallback heurístico; plantillas de mapeo
  reutilizables por firma de encabezados.
- **Campos extra adaptativos**: las columnas sobrantes se guardan en `Product.attributes` y se
  exponen en la API y el catálogo público.
- **Reemplazo o fusión al cargar**: modo `REPLACE` (solo el archivo) o `MERGE` (conserva productos
  que no vienen) y opción «Activar esta versión al importar» para que la tienda se actualice.
- **Imágenes de contenido basadas en la foto del producto**: el mock compone la foto real con
  overlay de marca, título, precio y CTA; varía por producto/prompt. OpenAI usa `images/edits` para
  mantener el producto reconocible.
- Wizard de importación con vista previa, mapeo editable, campos extra, plantillas y modo de carga.

### Corregido
- CSV parseado con parser propio: SheetJS convertía textos como `1/4` en fechas (`1/3/01`).
- Tipos de columna: `ENUM` solo con valores repetidos; medidas y materiales quedan `TEXT`.
- La plantilla de mapeo se guarda aunque haya filas en cuarentena.

### Pruebas
- API: **267 unit** (46 archivos) y **113 e2e** (18 archivos). Web: 19 pruebas. CI con cobertura.



### Añadido
- **Catálogo real "Despensa de Altura"**: 20 productos con fotografías reales de Wikimedia Commons,
  importados por el pipeline (descarga + almacenamiento en MinIO), con versión v1 activa y visible en
  la tienda pública.
- Script reproducible `apps/api/scripts/load-real-catalog.mjs` y fixture
  `tools/fixtures/despensa-altura.csv`; el script reintenta si Wikimedia responde 429.

### Pruebas
- Gates verdes (lint, typecheck, unit, e2e, build). Verificación manual del catálogo en la API y en
  las dos caras.



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
