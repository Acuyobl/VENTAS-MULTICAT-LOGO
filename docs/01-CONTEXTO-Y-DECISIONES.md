---
title: Contexto, alcance y decisiones de arquitectura
tipo: fundacional
estado: aprobado
version: 1.0
fecha: 2026-10-28
idioma: es-CR
autor: Equipo de arquitectura
documentos_relacionados:
  - docs/00-BRIEF.md
  - docs/02-ANALISIS.md
  - docs/03-SPEC.md
  - docs/04-GUIA-IMPLEMENTACION.md
  - docs/05-IDEAS.md
---

# Contexto, alcance y decisiones de arquitectura

> Este documento es la **fuente de verdad compartida**. Cualquier documento posterior
> (análisis, spec, guía de implementación, ideas) debe ser coherente con lo aquí decidido.
> Si un documento necesita contradecir una decisión, debe abrir una sección
> "Decisión propuesta de cambio" y justificarla; no la cambia en silencio.

## 1. Qué estamos construyendo

**VentasCatálogo** es una PWA multi-catálogo que convierte un archivo de catálogo
(Google Sheets, Excel, CSV, PDF) en un negocio operativo: vender, cotizar, cobrar,
llevar finanzas, atender por WhatsApp y chat, y **generar contenido de marketing con IA**
para redes sociales. Cada catálogo es una unidad de negocio aislada: sus productos,
ventas, pagos, finanzas y publicaciones no se mezclan con los de otro catálogo.

El activo diferencial no es "otro CRM": es el **ciclo cerrado catálogo → contenido → venta →
cobro → datos → mejor contenido**. La IA que genera los posts debe alimentarse de los datos
reales del catálogo y del historial de ventas para mejorar con el tiempo.

Además, el producto es **de dos caras** (ver §5.1): una cara de backoffice para el administrador y
sus colaboradores, y una cara de tienda/portal para el cliente final. Ambas comparten backend,
datos y permisos, pero tienen shells, dominios y audiencias de token independientes. Un módulo de
usuarios con roles y permisos es el eje que hace posible esa separación.

## 2. Realidad del proyecto (restricciones de partida)

| Dimensión | Supuesto de trabajo | Implicación |
|---|---|---|
| Equipo | 1–2 desarrolladores full-stack, apoyo parcial de diseño | Priorizar monolito modular y decisiones aburridas; cero microservicios |
| Plazo MVP | 15 semanas con 1,5 dev; 14 con 2 devs en F1–F3; 20–22 con 1 dev | El Must con usuarios y dos caras mide 106,5 dp y la capacidad de 14 semanas con 1,5 dev es 105 dp: no cierra. Se adopta la opción 2 de `docs/02-ANALISIS.md` §10.6: 15 semanas difiriendo a F5 chat en vivo, exportación XLSX y reparación de imágenes (Must 98,5 dp sobre 112,5 dp) |
| Presupuesto infra | < USD 60/mes en MVP | VPS único + Postgres gestionado o Docker; MinIO en lugar de S3 |
| Presupuesto IA | < USD 30/mes en MVP | Cuotas por organización, caché, prompts cortos, modelo económico por defecto |
| Mercado inicial | Costa Rica / Centroamérica, español | CRC y USD, IVA 13 %, Hacienda (fase 3), WhatsApp como canal principal |
| Usuarios | PYMES y revendedores con 50–5 000 SKU | Rendimiento en listados paginados, importación tolerante |
| Cliente final | Compra por WhatsApp o link de pago, móvil primero | UX móvil, PWA instalable, links compartibles |

## 3. Decisiones de arquitectura (ADR resumido)

Formato: `ADR-NN · Decisión — razón — alternativa descartada`.

| ID | Decisión | Razón principal | Alternativa descartada |
|---|---|---|---|
| ADR-01 | **Monolito modular** en un solo repositorio (apps/api + apps/web + packages/*) | Un equipo pequeño no puede operar microservicios; los límites se mantienen por módulos y contratos internos | Microservicios por módulo (coste operativo alto) |
| ADR-02 | **NestJS 11 (Node 22, TypeScript)** para el backend | Un solo lenguaje en todo el stack, Prisma, BullMQ, Socket.IO y guards RBAC de primera clase; el acceso a LLMs es HTTP, no requiere Python | FastAPI (obligaría a dos lenguajes y dos pipelines de tipos) |
| ADR-03 | **Next.js 15 (App Router) + React 19 + Tailwind + shadcn/ui** | SSR para catálogos públicos compartibles + PWA; ecosistema maduro | Vite SPA (peor SEO y peor primer render en gama baja) |
| ADR-04 | **PostgreSQL 16 + Prisma ORM** | Transacciones serias, JSONB para payloads de integración, migraciones versionadas | MySQL (peor soporte JSON/índices parciales), MongoDB (finanzas sin integridad referencial) |
| ADR-05 | **Redis 7 + BullMQ** para colas, caché y rate limit | Generación IA, webhooks, recordatorios y PDFs son asíncronos por naturaleza | Cola en Postgres (SKIP LOCKED) como plan B si Redis no está disponible |
| ADR-06 | **Multi-org ligero**: `organization_id` en todo lo de negocio + `catalog_id` en todo lo transaccional | El brief describe roles de "superadmin" y "admin de catálogo", lo que implica SaaS multi-cliente; añadirlo después es una migración dolorosa | Un solo tenant (bloquea el modelo de negocio SaaS) |
| ADR-07 | **Aislamiento por catálogo con `catalog_id` + `catalog_version_id` obligatorios** y activación por puntero (`active_version_id`) | Cumple el requisito de no romper históricos al cambiar de catálogo | Copiar datos por catálogo (duplicación e inconsistencia) |
| ADR-08 | **Versionado inmutable del catálogo**: `CatalogVersion` con estados `draft → validated → active → archived`; los productos pertenecen a una versión | Permite volver atrás, auditar precios usados en una venta y bloquear ventas de catálogos archivados | Sobrescribir productos (pierde trazabilidad de precios) |
| ADR-09 | **Dinero en enteros de unidad menor** (`amount_minor BIGINT`) + `currency` ISO-4217 | Evita errores de coma flotante en finanzas; CRC y USD convivirán | `float`/`double` (prohibido), `numeric` como alternativa aceptable |
| ADR-10 | **IDs UUIDv7** en tablas de negocio | Ordenables por tiempo, seguros en URLs públicas, sin coordinación central | Auto-increment (filtra volumen de negocio y complica multi-org) |
| ADR-11 | **Proveedor de IA abstracto** (`AiProvider` interface) con DeepSeek como primario y OpenAI-compatible como alternativo | El brief pide DeepSeek; abstraer permite cambiar de proveedor/modelo sin tocar features | Acoplar el SDK de un proveedor en cada módulo |
| ADR-12 | **Pagos por adaptadores** (`PaymentGateway`): Stripe, MercadoPago, PayPal + webhook idempotente | Es un requisito y cada pasarela cambia firma y estados; el núcleo no debe saber de Stripe | Integración directa dispersa |
| ADR-13 | **Outbox de eventos** (`outbox_events`) para publicar a colas y webhooks | Evita perder eventos entre commit y encolado (pagos, posts, mensajes) | Encolar dentro de la transacción (pierde eventos si Redis falla) |
| ADR-14 | **PWA + offline de solo lectura** del catálogo activo (IndexedDB), sin ventas offline en MVP | En feria el móvil pierde señal; vender offline exige resolución de conflictos que el MVP no justifica | Offline-first completo en MVP (complejidad desproporcionada) |
| ADR-15 | **Observabilidad mínima**: logs estructurados (pino), Sentry, `/health`, métricas de negocio y de coste IA | Sin medir coste por organización no hay SaaS sostenible | Solo logs de consola |
| ADR-16 | **Docker Compose** para desarrollo y VPS; imágenes multi-stage; migraciones `prisma migrate deploy` | Cumple el criterio de despliegue del brief y es operable por una persona | Kubernetes (sobredimensionado) |
| ADR-17 | **Dos caras sobre un mismo backend**: backoffice para staff y tienda/portal para clientes, con shells de UI, dominios y audiencias de token distintas | El brief vende a PYMES que atienden clientes: sin cara de cliente el producto es un ERP interno; con dos caras captura la venta completa | Una sola UI con permisos (el cliente vería densidad de backoffice) o dos productos separados (duplica auth, datos y mantenimiento) |
| ADR-18 | **Módulo de usuarios unificado + RBAC de permisos** (`User`, `Membership`, `Role`, `Permission`, `CustomerAccount`) | Un mismo `User` puede ser colaborador de una organización y cliente de otra; los roles del brief se implementan como conjuntos de permisos `recurso:acción` evaluados en el servicio | Tabla de roles fija en código (no permite roles personalizados por organización) o autorización solo en el controlador (la salta cualquier servicio interno) |

## 4. Convenciones transversales (obligatorias en todo el código y documentos)

1. **Dinero**: siempre `amount_minor: bigint` + `currency: 'CRC' | 'USD'`. Formateo solo en el borde (UI/PDF).
2. **Fechas**: almacenar en UTC (`timestamptz`), mostrar en `America/Costa_Rica`. Nunca fechas locales en BD.
3. **Impuestos**: `tax_rate` en puntos base (`1300` = 13 %), `tax_included: boolean`. Sin excepciones por línea en MVP.
4. **IDs públicos**: UUIDv7 en URLs; nunca exponer IDs secuenciales internos.
5. **Errores**: formato `{ code, message, details, traceId }` con catálogo de códigos estable (`CATALOG_ARCHIVED`, `AI_QUOTA_EXCEEDED`, `PAYMENT_SIGNATURE_INVALID`, ...). Los mensajes de UI están en español.
6. **API**: REST versionada en `/api/v1`, JSON `camelCase`, paginación por cursor (`?cursor=&limit=`), filtros documentados, OpenAPI 3.1 generado desde DTOs.
7. **Validación**: Zod en web y `class-validator` en api; los DTOs se comparten en `packages/contracts`.
8. **Autorización**: RBAC por `role` + `scope` (organización/catálogo) comprobado en **servicio**, no solo en controlador.
9. **Auditoría**: toda mutación sensible escribe `audit_log` (quién, qué, antes, después, `traceId`), append-only.
10. **Idempotencia**: `Idempotency-Key` obligatorio en pagos, generación IA, importación y webhooks.
11. **Nombres**: tablas `snake_case` plural, código `camelCase`, documentos `NN-TEMA.md` en `docs/`.
12. **Idioma**: código y comentarios en inglés; UI, documentos y prompts en español (es-CR); prompts de IA versionados como plantillas con `prompt_version`.
13. **Seguridad**: secretos solo por entorno, refresh tokens de Google cifrados en reposo, sin PII en logs, rate limit por IP y por org.
14. **Definición de terminado (DoD)**: tests pasando, migración reversible, endpoint en OpenAPI, caso de error documentado, auditoría escrita, y entrada en `docs/03-SPEC.md` actualizada.
15. **Tipo de cambio de referencia**: ₡510/USD (supuesto del modelo económico de `docs/06-COSTOS-Y-PRECIOS.md`). `docs/02` usa ₡535 y `docs/05` usa ₡515 como supuestos históricos de sus propios cálculos; la diferencia (±5 %) está cuantificada en `docs/06` §2.1 y no altera ninguna decisión de producto. Para precios al cliente se usa siempre ₡510 salvo revisión mensual.

## 5. Modelo de aislamiento (la regla que no se rompe)

```
Organization 1─N Catalog 1─N CatalogVersion 1─N Product
                                    │
      Todo registro transaccional lleva: organization_id, catalog_id, catalog_version_id
      Ejemplos: Quote, Order, Payment, Expense, SocialPost, ChatConversation, WhatsAppMessage
```

Reglas duras:

- **R1** — Ninguna consulta de negocio cruza `organization_id` sin ser `superadmin`.
- **R2** — Ningún listado de productos mezcla versiones: se lee de la versión activa (o de una versión explícita para históricos).
- **R3** — Activar una versión **no** modifica registros pasados; solo cambia el puntero `Catalog.active_version_id`.
- **R4** — No se puede crear una venta/cotización contra una versión `archived`.
- **R5** — Borrar es lógico (`deleted_at`) en entidades de negocio; borrado físico solo en datos efímeros y tras retención.
- **R6** — El motor de IA recibe únicamente datos de la versión activa del catálogo y **nunca** mezcla productos de otro catálogo en una misma generación.
- **R7** — Las métricas de finanzas y marketing se agregan por `catalog_id`; los reportes globales son explícitamente multi-catálogo.

## 5.1 Modelo de dos caras: usuarios, roles y portal del cliente

VentasCatálogo es **un producto con dos caras** sobre un mismo backend, una misma base de datos
y un mismo modelo de permisos. Esto es un requisito de producto explícito del cliente, no un extra.

| | Cara A — Backoffice (staff) | Cara B — Tienda y portal del cliente |
|---|---|---|
| Para quién | superadmin, org_admin, catalog_admin, vendedor, finanzas, social_manager, agente_chat | clientes finales: personas y empresas revendedoras |
| Objetivo | operar el negocio: importar, vender, cobrar, analizar, generar contenido | comprar, cotizar, pagar, dar seguimiento, conversar |
| Superficie | `app.ventascatalogo.com` (o `/panel`) | `tienda.ventascatalogo.com`, catálogo público `/c/{slug}` y portal `/mi-cuenta` |
| Shell UI | sidebar denso, tablas, formularios; desktop-first | mobile-first, PWA instalable, checkout en 3 pasos |
| Audiencia del token | `aud=staff` | `aud=customer` |
| Sesión | access 15 min + refresh 7 días; MFA TOTP obligatorio para org_admin y superadmin | access 15 min + refresh 30 días; magic link o Google; sin MFA |
| Alcance de datos | todo lo de su organización/catálogo según rol | solo sus propios pedidos, cotizaciones, pagos, chats y datos |

Módulo de usuarios (núcleo compartido, `RF-USR`):

- **Identidad única**: `User` (email normalizado y verificado, teléfono, nombre, locale, estado).
  Un mismo `User` puede ser a la vez colaborador de una organización y cliente de otra.
- **Colaborador (staff)**: `Membership(organization_id, user_id, status)` + `RoleAssignment(role_id, scope)`.
  Roles del sistema: `superadmin` (global), `org_admin`, `catalog_admin`, `vendedor`, `finanzas`,
  `social_manager`, `agente_chat`. En fase 2 se permiten roles personalizados por organización
  (mismos permisos atómicos, nombre propio).
- **Cliente**: `CustomerAccount(user_id, organization_id)` con su `Customer` asociado y rol fijo
  `customer`, cuyos únicos permisos son sobre recursos propios (`self`).
- **Permisos**: `Permission(resource:action)`; un `Role` es un conjunto de permisos; la evaluación
  ocurre en el **servicio de dominio**, no solo en el controlador. El cliente no puede acceder a
  ningún endpoint de backoffice y el staff sin permiso no accede al recurso aunque sea su org.
- **Ciclo de vida**: invitación (`invited → active → suspended → deleted`), verificación de email,
  recuperación de contraseña, bloqueo por intentos, baja y anonimización de datos personales
  (Ley 8968) preservando los históricos contables exigidos.
- **Onboarding**: colaborador por invitación con rol y scope asignados; cliente por registro
  email/Google, magic link o **checkout como invitado** que después reclama su cuenta.
- **Sesiones**: `AuthSession` revocable por dispositivo, rotación de refresh token y detección de reutilización.

Reglas duras adicionales (se suman a R1–R7):

- **R8** — Un token `aud=customer` solo puede ejecutar `/api/v1/me/*` y `/api/v1/storefront/*`;
  un token `aud=staff` no puede usar el carrito ni el checkout del cliente. Error `AUTH_WRONG_AUDIENCE`.
- **R9** — El cliente solo ve sus propios datos: el filtro por `customer_id` es obligatorio en el
  repositorio, no una decisión del controlador.
- **R10** — El backoffice nunca muestra datos de clientes de otra organización; el superadmin requiere
  elevación explícita y queda auditado.
- **R11** — La tienda navega y cotiza sin login; para pagar, ver historial o chatear se exige sesión
  `aud=customer` o enlace firmado de un solo uso.

## 6. Stack definitivo (versiones objetivo)

| Capa | Tecnología | Notas |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | `apps/*`, `packages/*` |
| API | NestJS 11, Node 22 LTS, TypeScript 5.x | módulos: auth, orgs, catalogs, products, sales, payments, finance, ai, social, messaging, chat, admin |
| Web | Next.js 15 App Router, React 19, Tailwind 3.4, shadcn/ui, TanStack Query, react-hook-form + zod | PWA con service worker (catálogo offline de lectura) |
| BD | PostgreSQL 16 + Prisma 6 | migraciones versionadas, índices por `(organization_id, catalog_id, created_at)` |
| Caché/colas | Redis 7 + BullMQ | colas: `ai.generate`, `pdf.render`, `webhook.process`, `reminder.send`, `catalog.import` |
| Tiempo real | Socket.IO 4 + adapter Redis | salas por `conversation_id`; fallback SSE |
| IA | DeepSeek (`deepseek-chat` / `deepseek-reasoner`) vía SDK OpenAI-compatible | provider abstracto, streaming SSE, plantillas versionadas |
| Archivos | MinIO (S3-compatible) | imágenes de producto, PDFs, comprobantes |
| PDF | `pdf-lib`/`pdfkit` server-side | plantillas de cotización y recibo |
| Email/WhatsApp | Resend (o SMTP) + WhatsApp Business Cloud API | plantillas aprobadas, ventana de 24 h |
| Testing | Vitest (unit), Supertest + Testcontainers (integración), Playwright (E2E) | cobertura mínima 70 % en dominio |
| Calidad | ESLint 9, Prettier, Husky + lint-staged, commitlint | conventional commits |
| CI/CD | GitHub Actions + Docker + Compose en VPS | dev/staging/prod |
| Observabilidad | pino + OpenTelemetry + Sentry | + panel de coste IA por organización |

## 7. Alcance por fases (resumen ejecutivo)

| Fase | Semanas | Entrega | Módulos |
|---|---|---|---|
| F0 — Fundaciones | 1–2 | Monorepo, usuarios, roles y auth por audiencia, orgs, CI, Docker, diseño de BD | Users, Roles, Auth, Organizations |
| F1 — Catálogo y ventas | 3–6 | Importación Drive, versionado, productos, cotizaciones, pedidos, PDFs y catálogo público con carrito | Catalogs, Products, Sales, Storefront |
| F2 — Dinero | 7–9 | Links de pago, webhooks, registros de pago, gastos, reportes, exportación y portal del cliente "Mi cuenta" | Payments, Finance, Customer Portal |
| F3 — IA y canales | 10–12 | Generador de contenido multicanal, historial/aprobación y WhatsApp en ambas caras | AI Social, WhatsApp |
| F4 — Endurecimiento | 13–15 | RBAC completo, auditoría, cuotas IA, observabilidad, E2E de las dos caras, despliegue y buffer de cierre | Admin, Security |
| F5 — Diferenciación | 16+ | Chat en vivo, exportación XLSX, reparación de imágenes e ideas priorizadas de `docs/05-IDEAS.md` | Chat, según backlog |

## 8. Glosario

- **Catálogo**: carpeta de Drive con un archivo de productos, o el conjunto de productos importado de ella. Unidad comercial aislada.
- **Versión de catálogo**: foto inmutable (o editable mientras es `draft`) de los productos de un catálogo importada en una fecha.
- **Catálogo activo**: versión apuntada por `Catalog.active_version_id`; la única que se ofrece en ventas y en IA.
- **Modelo comercial aislado**: el conjunto de productos + precios + reglas vigentes de un catálogo en una versión, sin contaminación de otros catálogos.
- **Cotización (Quote)**: propuesta de venta con vigencia y PDF compartible.
- **Pedido (Order)**: cotización aceptada o venta directa; origen de pagos y entregas.
- **Post social (SocialPost)**: contenido generado por IA para una plataforma, vinculado a `catalog_id` y a productos.
- **Calendario editorial**: serie planificada de posts generados masivamente por IA.
- **Cuota IA**: límite de tokens/generaciones por organización y periodo, configurable por el superadmin.
- **Outbox**: tabla de eventos pendientes de publicar a cola/webhook de forma fiable.
- **Cara A / Backoffice**: interfaz de trabajo del staff (admin y colaboradores) sobre el negocio.
- **Cara B / Tienda y portal**: interfaz del cliente final para comprar, pagar y dar seguimiento.
- **Colaborador**: `User` con `Membership` activa en una organización y uno o más roles asignados.
- **Cliente registrado**: `User` con `CustomerAccount` en una organización; puede comprar y ver su historial.
- **Invitado**: comprador sin cuenta que completa un checkout con enlace firmado y luego puede reclamar su cuenta.
- **Audiencia (`aud`)**: reclamo del JWT que determina la cara (`staff` o `customer`); las caras no son intercambiables.
- **Permiso**: capacidad atómica `recurso:acción`; los roles agrupan permisos y se asignan con un scope (organización o catálogo).

## 9. Reglas de estilo para los documentos del paquete

- Español técnico, claro, sin marketing; tablas antes que párrafos.
- Cada requisito lleva ID (`RF-xx` funcional, `RNF-xx` no funcional) y criterio de aceptación verificable.
- Toda decisión costosa se acompaña de su alternativa descartada.
- Los diagramas se escriben en Mermaid (se renderizan en GitHub y en la vista previa).
- Lo que no se sabe se marca como **SUPUESTO** o **PREGUNTA ABIERTA**; no se inventa.
- No se duplica contenido entre documentos: se referencia (`ver docs/03-SPEC.md §4.2`).

## 10. Riesgos que condicionan todo lo demás

| Riesgo | Impacto | Mitigación adoptada |
|---|---|---|
| Importación de catálogos sucios (SKU duplicados, precios en texto) | Alto — bloquea la venta | Pipeline de normalización + vista de mapeo con validación y "cuarentena" de filas |
| Coste de IA descontrolado | Alto — mata el margen | Cuotas por org, caché de prompts, modelo económico, tope por generación |
| Fuga entre catálogos | Crítico — destruye confianza | `catalog_id` obligatorio + pruebas de aislamiento automatizadas + revisión en code review |
| Escalado de privilegios entre las dos caras (un cliente llega a backoffice, o un vendedor a datos de otra org) | Crítico — brecha de datos | Guard de audiencia + `PermissionsGuard` en servicio + suite de pruebas de autorización por endpoint + revisión de permisos en cada PR |
| Confundir las dos caras en una sola interfaz | Medio — mala UX y errores operativos | Route groups y layouts separados; el cliente nunca ve navegación de backoffice |
| Soporte de accesos (contraseñas, invitaciones, bloqueos) | Medio — carga operativa | Magic link, self-service de recuperación, reenvío de invitación y panel de sesiones |
| Dependencia de la API de Drive (cuotas, permisos, archivos que cambian) | Medio | Importación snapshot versionada; reintentos; descarga a MinIO |
| Webhooks de pago perdidos o duplicados | Alto — dinero | Firma verificada, idempotencia por `gateway_event_id`, conciliación programada |
| WhatsApp bloquea plantillas o la cuenta | Medio — canal principal | Cola de reintentos, plantillas versionadas, email como respaldo |
| Un solo desarrollador | Alto — bus factor | Documentación ejecutable (este paquete), tests, scripts de bootstrap |

## 11. Preguntas abiertas (se resuelven en `docs/02-ANALISIS.md` y `docs/03-SPEC.md`)

1. ¿El producto es multi-empresa desde el día 1 o se puede lanzar mono-empresa? (ADR-06 asume multi-org ligero).
2. ¿Se necesita facturación electrónica de Costa Rica en el MVP? (ADR → fase 3, ver `docs/05-IDEAS.md`).
3. ¿Las imágenes de producto se sirven desde Drive o se copian a MinIO? (decisión: copiar a MinIO al importar).
4. ¿La app para clientes finales es pública (catálogo compartible) o solo autenticada? —
   **resuelto por ADR-17**: catálogo público por token revocable, checkout con sesión `aud=customer`
   o enlace firmado, chat solo autenticado.
5. ¿Se permite vender sin stock? (decisión: configurable por catálogo, por defecto no).
6. ¿Un cliente empresa puede tener varios usuarios y flujo de aprobación de pedidos? — **decisión:
   sí en fase 2** (cuentas de equipo); el MVP soporta un usuario por cliente.
7. ¿El staff puede "ver como cliente" para dar soporte? — **decisión: impersonación auditada en fase 3**,
   nunca en producción sin `AuditLog` y consentimiento.
