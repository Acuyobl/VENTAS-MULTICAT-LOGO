---
title: Pendientes de implementación — plan por pasos
tipo: roadmap
estado: vigente
version: 0.3.3
fecha: 2026-11-02
idioma: es-CR
---

# Pendientes de implementación

Estado actual: **v0.3.3** (commit `fe8a6a0`). F0/F1 completos; F2 funcional; F3 parcial.
API **360 unit + 158 e2e**, web 19; CI verde. Ya funcionan: catálogos versionados, importador
universal (Excel/CSV/JSON/TSV/TXT/PDF/OCR/fotos incrustadas), ventas, cobros sandbox, reembolsos,
recordatorios, reportes, gastos, WhatsApp entrante/saliente de texto, chat staff/cliente, contenido
IA, temas y 7 catálogos de ejemplo.

Lo que sigue está ordenado por **impacto para vender el producto**, con pasos verificables. Los
esfuerzos son estimaciones de 1 dev enfocado.

## P0 — Cerrar la promesa «como sea» (1–2 sprints)

### 1. WhatsApp como entrada de catálogo (3–4 días)

Hoy el webhook procesa **texto**; falta que un archivo o foto enviados por WhatsApp se conviertan en
una importación.

**Pasos**
1. Extender `whatsapp-inbound.service` para detectar `document` e `image` en el payload de Cloud API.
2. Descargar el media con `GET /{media-id}` (token) y guardar el buffer temporal (sin persistir en disco).
3. Encolar el archivo en el pipeline existente (`ImportsService.preview`/`import`) usando el catálogo
   activo o el que indique el usuario en el chat.
4. Responder por WhatsApp con el resumen: productos detectados, filas en cuarentena y enlace a la
   pantalla **Cargar catálogo** para confirmar (nunca importar sin confirmación).
5. Adjuntar la conversación a la importación (`ImportJob.chatConversationId` o metadata) para trazabilidad.
6. UI: en `/panel/importar` mostrar el origen «WhatsApp · fecha · teléfono» y el enlace al mensaje.
7. Límites: 10 MB, tipos permitidos, firma HMAC obligatoria en producción, rate limit por teléfono.
8. Tests: payload con document/foto (mock de Graph API), archivo grande rechazado, firma inválida 401.

**Aceptación:** mandar un XLSX/PDF/foto por WhatsApp genera una importación pendiente de confirmar,
visible en el backoffice y con respuesta al cliente.

**Depende de:** `WHATSAPP_ACCESS_TOKEN`, `PHONE_NUMBER_ID`, `APP_SECRET` (para producción).

### 2. Google Drive como fuente (3–5 días)

**Pasos**
1. Crear el cliente OAuth en Google Cloud (scope `drive.readonly`, `access_type=offline`).
2. Guardar tokens por organización cifrados (`ENCRYPTION_KEY`) con refresh.
3. Endpoints `GET /integrations/google-drive/files` y `POST /integrations/google-drive/import`.
4. Descargar el archivo (o exportar Sheets a XLSX) y pasarlo al mismo pipeline de importación.
5. UI en **Cargar catálogo**: pestaña Drive con explorador simple, buscador y selección.
6. Manejo de token vencido/revocado con mensaje claro y botón «Reconectar».
7. Tests con Google Drive mockeado (nunca llamar a Google en CI).

**Aceptación:** el admin conecta su Drive, elige un archivo y lo importa sin descargarlo a mano.

**Depende de:** credenciales OAuth de Google Cloud.

### 3. Credenciales reales de IA, correo y pagos (2–3 días)

**Pasos**
1. Cargar `DEEPSEEK_API_KEY` y `OPENAI_API_KEY` en el entorno de demo/producción.
2. Probar contenido con `AI_PROVIDER=deepseek` (texto) e `IMAGE_PROVIDER=openai` (imagen), y verificar
   cuota (`AI_MONTHLY_QUOTA_TOKENS`) y manejo de 429/errores.
3. Configurar SMTP real o Resend (`EMAIL_PROVIDER=resend` + `RESEND_API_KEY`) y probar invitaciones,
   magic links y recordatorios.
4. Stripe en modo test: claves, webhook secret, moneda y flujo link → pago → webhook → pedido pagado.
5. Documentar las variables en `.env.example` y `docs/09`.

**Aceptación:** un flujo real de demo funciona sin mocks y sin tocar código.

**Depende de:** claves del usuario.

## P1 — Producto listo para vender a escala (2–3 sprints)

### 4. Variantes reales talla/color (4–6 días)

Hoy talla/color se guardan como **atributos**; no tienen stock/precio propio ni selector en tienda.

**Pasos**
1. Modelo Prisma `ProductVariant` (productId, sku, atributos JSON, priceMinor, costMinor, stock) +
   migración y backfill desde `Product.attributes`.
2. Contrato y endpoints de variantes en producto (crear/editar/listar); permisos `product:write`.
3. Importador: agrupar filas por SKU base y generar variantes cuando existan columnas talla/color;
   validar SKU duplicado y stock.
4. UI de producto: tabla de variantes con stock/precio; alta/baja.
5. Tienda: selector de talla/color, stock por variante, carrito y checkout con `variantId`.
6. Cotizaciones/pedidos: snapshot de la variante (nombre + atributos) sin romper históricos.
7. Tests: importación con variantes, stock insuficiente, pedido con variante, migración/backfill.

**Aceptación:** un producto puede tener N variantes con stock y precio; la tienda solo vende
variantes disponibles.

### 5. Onboarding, planes y facturación (5–8 días)

Hoy las organizaciones nacen por seed y el plan es un campo sin límites aplicados.

**Pasos**
1. Registro de organización + admin inicial (email verificado) y creación de catálogo demo opcional.
2. Catálogo de planes (features y límites: usuarios, catálogos, productos, tokens IA) y enforcement
   en guards/servicios (helper `assertPlanLimit`).
3. Facturación: integrar Stripe Billing (suscripción, portal del cliente, webhooks) o cobro manual
   para los primeros clientes.
4. UI de Plan en Ajustes: uso actual vs límite y botón de upgrade.
5. Tests de límites (usuario/catálogo/producto/tokens) y webhook de suscripción.

**Aceptación:** un cliente nuevo se registra, elige plan, tiene límites aplicados y puede pagar.

**Depende de:** modelo de precios/planes y claves de Stripe.

### 6. Conciliación programada, cierre de mes y reportes por catálogo (3–4 días)

**Pasos**
1. Job repetible (BullMQ) diario que calcule conciliación y detecte diferencias; guardar snapshot.
2. Cierre de mes: bloquear edición de gastos/pagos de meses cerrados y registrar `closedAt`.
3. Reportes filtrables por catálogo (CSV/PDF) y comparativa mes a mes.
4. UI: historial de conciliaciones, estado del cierre y descarga.
5. Tests con reloj simulado y datos de dos meses.

**Aceptación:** cada noche queda una conciliación automatizada y un mes se puede cerrar sin editarse.

### 7. Publicación real en redes y campañas de WhatsApp (4–6 días)

**Pasos**
1. Conexión OAuth a Meta (IG/Facebook) por organización y selección de cuenta.
2. Publicar inmediato y programado desde Contenido, con estados (borrador, aprobado, publicado, error).
3. Webhooks/estado de publicación y reintentos.
4. Campañas WhatsApp: audiencia (clientes con teléfono), plantilla aprobada, envío por lotes, tracking
   y opt-out.
5. Tests con APIs mockeadas y rate limits.

**Aceptación:** un post generado se publica o programa de verdad; una campaña sale a una audiencia
con estado por destinatario.

**Depende de:** app de Meta, tokens y plantillas aprobadas.

### 8. Chat en tiempo real, adjuntos y UI de cuota IA (3–4 días)

**Pasos**
1. Cambiar polling del chat por SSE o WebSocket (gateway), conservando el fallback.
2. Adjuntos en chat (imagen/PDF) con presigned upload y vista previa.
3. Endpoint `GET /ai/usage` y panel en Ajustes/Contenido: tokens consumidos, cuota, costo estimado.
4. Notificaciones de no leídos (badge y, si aplica, email).
5. Tests de entrega, reconexión y límites de adjuntos.

**Aceptación:** dos usuarios ven los mensajes al instante y el admin ve su consumo de IA.

## P2 — Calidad, seguridad y operación (1–2 sprints)

### 9. Endurecimiento de seguridad (2–3 días)

1. `jti`/`sid` en access token + blocklist en Redis al revocar sesión.
2. Rotación de refresh token ya implementada: agregar detección de reuso en access.
3. Rate limit e idempotencia en webhooks de pago/WhatsApp (por IP/proveedor).
4. CSP, headers de seguridad y revisión de cookies (`SameSite`, `HttpOnly`, `Secure`).
5. Swagger: ruta comodín `/*path` para eliminar el warning de `path-to-regexp`.
6. Visor de `audit_log` para admins y exportación.

**Aceptación:** revocar una sesión invalida el access token en <1 min; webhooks duplicados no
duplican efectos.

### 10. CI, E2E, cobertura y rendimiento (3–4 días)

1. Correr **E2E en CI** con Postgres/Redis/MinIO de servicio (hoy CI corre unit).
2. Umbrales de cobertura ≥70 % en `catalogs`, `sales`, `payments`.
3. Pruebas de carga del catálogo público (k6: 50 productos, 100 usuarios) y del import de 500 filas.
4. Accesibilidad (axe) y revisión móvil de tienda/portal.
5. Alinear el `CHECK` de totales de `docs/03` con la convención implementada.

**Aceptación:** CI falla si baja la cobertura o se rompe un flujo E2E; catálogo público responde
p95 < 500 ms con la carga objetivo.

### 11. Despliegue y observabilidad (3–5 días)

1. Dockerfiles de producción (API/web) y `docker-compose.prod` o manifiesto del destino.
2. Dominio + HTTPS (Caddy/Nginx/Traefik o plataforma), variables y secretos.
3. Migraciones automáticas en deploy y backups de Postgres/MinIO con restore probado.
4. Logs estructurados, métricas, alertas (errores 5xx, latencia, colas) y `/health` externo.
5. CI/CD de despliegue con rollback y smoke test post-deploy.

**Aceptación:** un deploy a staging con HTTPS queda verde, con backup/restore y alertas activas.

### 12. Deuda menor de datos y documentos (1 día)

1. Revisar `docs/03` (CHECK de dinero) y `docs/02` (estimaciones ya superadas).
2. Actualizar guion de demo con los 2 catálogos grandes.
3. Regenerar Graphify si se quiere mantener el grafo al día.
4. Limpiar `catalogos_de_prueba/` si no se usa (está sin versionar).

## Orden recomendado (próximos 30 días)

1. **Semana 1**: WhatsApp entrada + credenciales reales (P0.1/P0.3).
2. **Semana 2**: Google Drive + variantes (P0.2/P1.4).
3. **Semana 3**: onboarding/planes (P1.5) y conciliación programada (P1.6).
4. **Semana 4**: despliegue/observabilidad (P2.11) + hardening (P2.9) + E2E CI (P2.10).

## Bloqueos que necesito de vos

| Bloqueo | Qué necesito |
|---|---|
| WhatsApp de entrada | Token de Cloud API, `PHONE_NUMBER_ID` y `APP_SECRET` |
| Google Drive | Proyecto Google Cloud + OAuth client |
| Pagos reales | Claves Stripe/MercadoPago + webhook secret + cuenta de prueba |
| IA real | `DEEPSEEK_API_KEY` y `OPENAI_API_KEY` |
| Onboarding/planes | Precios y límites por plan |
| Despliegue | Destino (VPS/Docker, Railway, Fly.io, AWS…) y dominio |

Sin credenciales, todo lo demás (variantes, conciliación, cuota IA, hardening, E2E, despliegue
local con Docker) se puede implementar y probar con mocks.
