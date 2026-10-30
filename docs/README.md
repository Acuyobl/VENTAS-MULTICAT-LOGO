---
title: Paquete documental de VentasCatálogo
tipo: indice
estado: aprobado
version: 1.1
fecha: 2026-10-29
idioma: es-CR
---

# VentasCatálogo — paquete documental

Aplicación de ventas multicatálogo con IA: importa catálogos desde Excel/CSV y hojas de pedido (y
próximamente Drive, PDF, foto y WhatsApp), vende, cobra, lleva finanzas, atiende por WhatsApp y
chat, y genera contenido para redes sociales con IA. Cada catálogo es una unidad de negocio aislada.

**Implementación actual: v0.2.9 (2026-10-29).** F0 cerrado; F1 completo; F2 funcional; F3 con
contenido, WhatsApp, chat, temas visuales y catálogos de ejemplo. Ver [08-ESTADO-F1.md](08-ESTADO-F1.md)
y [../CHANGELOG.md](../CHANGELOG.md).

Estos documentos son la fuente de verdad para construir el producto. Están pensados para leerse
en orden, pero cada uno sirve por separado.

## Mapa de documentos

| # | Documento | Qué responde | Líneas | Lectura |
|---|---|---|---|---|
| 00 | [Brief original](00-BRIEF.md) | Qué pidió el cliente, literal y completo (transcripción UTF-8 del `.txt`) | 127 | 10 min |
| 01 | [Contexto y decisiones](01-CONTEXTO-Y-DECISIONES.md) | Alcance, restricciones reales, ADR-01…ADR-18, convenciones y reglas duras (aislamiento, dos caras, usuarios) | 246 | 25 min |
| 02 | [Análisis](02-ANALISIS.md) | Producto, actores de las dos caras, módulos, requisitos implícitos, ambigüedades resueltas, competencia, riesgos, KPIs, costes, MoSCoW y capacidad | 1.416 | 90 min |
| 03 | [Especificación](03-SPEC.md) | Contratos para implementar: RBAC, 44 RF con Gherkin, 53 entidades, máquinas de estado, 113 endpoints, módulo IA, 28 RNF, 125 errores | 3.491 | 3–4 h |
| 04 | [Guía de implementación](04-GUIA-IMPLEMENTACION.md) | Cómo construirlo: estructura, bootstrap, `.env`, Docker, 15 semanas por fase, patrones de código, Prisma, IA, Drive, testing, CI/CD, operación | 4.516 | 4–6 h |
| 05 | [Nuevas ideas](05-IDEAS.md) | 31 ideas priorizadas con scoring I/E, roadmap de 12 meses, 10 descartadas, 3 experimentos y guardrails | 1.165 | 60 min |
| 06 | [Costos y precios](06-COSTOS-Y-PRECIOS.md) | Cuánto cuesta construirlo (3 escenarios × 3 alcances), año 1, unit economics, escalera de precios, break-even, LTV/CAC y plan de venta masiva | 1.442 | 60 min |
| 07 | [Estado de implementación](07-ESTADO-IMPLEMENTACION.md) | Bitácora de F0: lo construido y verificado, desviaciones del entorno y pendientes históricos | 140 | 10 min |
| 08 | [Estado F1](08-ESTADO-F1.md) | Bitácora completa: versionado, importación inteligente, ventas, cobros, contenido, WhatsApp, chat, temas, catálogos, endurecimiento y pendientes | 750 | 30 min |
| 09 | [Bootstrap medido](09-BOOTSTRAP.md) | Criterio 8 de F0: tiempos reales del bootstrap, camino manual y riesgos del entorno | 72 | 5 min |
| 10 | [Guion de demo](10-DEMO.md) | Recorrido actualizado a v0.2.9: dos caras, temas, chat, catálogos de ejemplo y plan B | 90 | 5 min |
| 11 | [Posicionamiento](11-POSICIONAMIENTO.md) | Frase norte «Subí tu catálogo como sea», anatomía de la promesa y hoja de ruta | 70 | 10 min |

Además, [`CHANGELOG.md`](../CHANGELOG.md) resume los hitos desde `v0.1.0` hasta `v0.2.9`, y
[`catalogs/`](../catalogs/README.md) contiene los 5 catálogos de ejemplo cargables.

## Estado actual (v0.2.9 · 2026-10-29)

| Área | Estado |
|---|---|
| Base (F0) | ✅ Auth de dos audiencias, RBAC, MFA/TOTP, invitaciones, health, CI, bootstrap 75 s |
| Catálogo | ✅ Versionado inmutable, **importador universal** (CSV/TSV/TXT/JSON/XLSX/XLS/ODS/PDF, **fotos con OCR** y **fotos incrustadas de Excel**), multi-hoja, tablas compuestas, data URI, maqueta SVG, cuarentena, renombrar y borrar con slug liberado, 5 catálogos de ejemplo |
| Ventas | ✅ Cotizaciones con PDF, pedidos, tienda con carrito, checkout, portal, PWA |
| Dinero | ✅ Link de pago, Stripe/sandbox, pagos manuales, reembolsos, recordatorios, reportes (CSV/PDF), conciliación, gastos y utilidad |
| Contenido/IA | ✅ Posts con IA, 3 diseños de imagen, variación por plataforma/tono/objetivo, cuota mensual de tokens |
| WhatsApp/chat | ✅ Entrante/saliente, bandeja staff y chat del cliente en el portal |
| UX | ✅ 3 temas visuales, tarjetas de producto, modal de detalle en tienda y estudio de contenido renovado |
| Calidad | ✅ API 360 unit + 158 e2e; web 19; CI verde con cobertura (~1,1 MB) |
| Producción | 🔶 Endurecimiento listo (Resend, secretos de pasarela, `STORAGE_PUBLIC_URL`, outbox); falta despliegue, onboarding/planes y credenciales reales |

## Decisiones que condicionan todo (resumen)

1. **Dos caras** (ADR-17): backoffice para admin/colaboradores (`aud=staff`) y tienda/portal para
   clientes (`aud=customer`). Mismo backend, misma base de datos, shells y dominios separados.
2. **Módulo de usuarios con roles** (ADR-18): identidad única `User` con doble pertenencia
   (`Membership` + `RoleAssignment` para staff, `CustomerAccount` para clientes) y permisos
   atómicos `recurso:acción` evaluados en el servicio.
3. **Aislamiento multi-org y por catálogo**: `organization_id`, `catalog_id` y
   `catalog_version_id` obligatorios en todo lo transaccional; histórico inmutable.
4. **Monolito modular** NestJS 11 + Next.js 15 + PostgreSQL 16/Prisma + Redis/BullMQ,
   desplegado con Docker Compose. Sin microservicios.
5. **Plan de 15 semanas con 1,5 dev** (Must 98,5 dp sobre 112,5 dp, buffer ≈14 dp); con 2 devs
   en F1–F3 baja a 14 semanas. Chat en vivo, exportación XLSX y reparación de imágenes pasan a F5.
   El cálculo está en [02-ANALISIS.md §10.6](02-ANALISIS.md) y el plan en
   [04-GUIA-IMPLEMENTACION.md §12](04-GUIA-IMPLEMENTACION.md).

## Rutas de lectura

- **Quiero entender el negocio** (60 min): 02 §1, §2.1, §6, §8, §9. Luego 05 §0 y §4.
- **Voy a programar** (empieza hoy): 01 completo → 04 §1–§3 (bootstrap) → 04 §4 (F0) →
  03 §2 (RBAC) y §4 (modelo de datos) como referencia permanente.
- **Voy a revisar el diseño**: 01 → 03 §2, §3, §4, §6 → 02 §7 (riesgos) y §11.3 (puertas de decisión).
- **Voy a invertir o priorizar**: 02 §8–§11 → 05 §0–§2, §4, §6.

## Estado y convenciones

- **Versión 1.0 — 2026-10-28.** Cambio mayor registrado: se incorporó el requisito de
  *módulo de usuarios con roles y dos caras*, que afectó a los cinco documentos y al plan
  (14 → 15 semanas). Ver los changelogs al final de 02, 03, 04 y 05.
- **IDs estables**: `ADR-nn` (decisiones), `RF-<módulo>-<n>` (funcionales), `RNF-n` (no
  funcionales), `ERR-n` (errores), `AC-n` (criterios de aceptación), `RI-n` (requisitos
  implícitos), `A-n` (ambigüedades), `RG-n` (riesgos). Se pueden citar entre documentos.
  **ADR-19…ADR-24 son propuestas** de [05-IDEAS.md](05-IDEAS.md) (impersonación, modo agencia,
  etc.), no decisiones adoptadas: solo ADR-01…ADR-18 están aprobadas.
- **Numeración de secciones**: `§n` referido al documento nombrado; los documentos se citan
  como `docs/03-SPEC.md §4.2`.
- **Dinero** en enteros de unidad menor (`amount_minor`) + moneda ISO-4217; impuestos en puntos
  base; fechas en UTC y visualización en `America/Costa_Rica`.
- **Supuestos** marcados `SUPUESTO`; lo no decidido está en las preguntas abiertas de 01 §11,
  02 §12 y 03 §12.

## Grafo de conocimiento (Graphify)

`graphify-out/` contiene el grafo del corpus documental, generado con Graphify 0.9.95:

| Archivo | Para qué |
|---|---|
| `graph.json` | Grafo completo (nodos, aristas, comunidades) para consultas y GraphRAG |
| `GRAPH_REPORT.md` | Informe de auditoría: god nodes, conexiones sorprendentes, preguntas sugeridas |
| `graph.html` | Visualización interactiva (abrir en navegador) |
| `RESUMEN-GRAPHIFY.md` | Resumen en español y comandos de consulta |
| `.graphify_labels.json` | Nombres de comunidades |

Consulta desde PowerShell (el `graphify.exe` del PATH está bloqueado por Application Control;
hay que usar el intérprete del venv de uv):

```powershell
$py = "$env:APPDATA\uv\tools\graphifyy\Scripts\python.exe"
& $py -m graphify query "¿cómo se aplica el aislamiento por catálogo?" --graph graphify-out/graph.json
& $py -m graphify path "AuthSession" "CustomerAccount" --graph graphify-out/graph.json
& $py -m graphify explain "AudienceGuard" --graph graphify-out/graph.json
```

Para regenerar el grafo tras editar los documentos: `python tools/graphify_run.py --help`.

## Pendientes estratégicos

1. **Entradas de catálogo**: WhatsApp de entrada y Google Drive (OAuth de Google Cloud). El
   importador universal ya cubre Excel/CSV/TSV/TXT/JSON/ODS/PDF, **fotos y PDF escaneados con OCR**,
   multi-hoja y tablas compuestas.
2. **Variantes** talla/color con stock y precio propios; conciliación programada/cierre de mes;
   publicación real en redes.
3. **Producción**: onboarding de organizaciones, planes/facturación, despliegue con HTTPS,
   observabilidad y credenciales reales de IA (DeepSeek/OpenAI) y pasarelas.
4. **Endurecimiento fino**: `jti`/`sid` blocklist, aviso de `path-to-regexp`, umbrales de cobertura
   y alineación del `CHECK` de totales de `docs/03`.

La implementación detallada, decisiones y evidencia están en [08-ESTADO-F1.md](08-ESTADO-F1.md);
la promesa de producto y su hoja de ruta, en [11-POSICIONAMIENTO.md](11-POSICIONAMIENTO.md).
