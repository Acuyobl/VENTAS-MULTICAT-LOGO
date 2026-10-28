# Graph Report - APLICACIÓN DE VENTAS MULTICATÁLOGO CON IA  (2026-10-28)

## Corpus Check
- 8 files · ~133,285 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 388 nodes · 606 edges · 17 communities (13 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Catálogo, ventas y fases
- Ciclo comercial y cobros
- Dos caras y RBAC
- Planes, COGS y precios
- Supuestos financieros y unit economics
- Generación IA e importación
- Clientes, WhatsApp y RBAC
- Decisiones MVP y puertas
- Pedidos, pagos y finanzas
- Arquitectura de módulos y API
- Inversión y plan de entrega
- Go-to-market y embudo
- Idempotencia y outbox
- Benchmarks de competencia
- Facturación fiscal fuera de MVP
- Offline y modo feria

## God Nodes (most connected - your core abstractions)
1. `Modelo de aislamiento multi-org y por catálogo` - 13 edges
2. `CatalogVersion` - 12 edges
3. `Break-even operativo: ≈170 orgs (ARPU 42) · ≈123 (ARPU 58) · ≈581 (ARPU 19)` - 12 edges
4. `F1 — Catálogo, importación y ventas (semanas 3–6)` - 11 edges
5. `Organization` - 11 edges
6. `VentasCatálogo (PWA multicatálogo con IA)` - 11 edges
7. `M3 — Cobros` - 11 edges
8. `F0 — Fundaciones (semanas 1–2)` - 10 edges
9. `Order` - 10 edges
10. `M1 — Conexión e importación desde Google Drive` - 10 edges

## Surprising Connections (you probably didn't know these)
- `M3 — Cobros` --references--> `ADR-12 — Pagos por adaptadores (PaymentGateway) con webhook idempotente`  [EXTRACTED]
  docs/02-ANALISIS.md → docs/01-CONTEXTO-Y-DECISIONES.md
- `IDs estables citables entre documentos (ADR-nn, RF-módulo-n, RNF-n, ERR-n, RG-n) con ADR-19…24 solo propuestas` --conceptually_related_to--> `ADR-18 — Módulo de usuarios unificado + RBAC de permisos`  [INFERRED]
  docs/README.md → docs/01-CONTEXTO-Y-DECISIONES.md
- `M4 — Finanzas` --shares_data_with--> `Product (producto de una versión de catálogo)`  [INFERRED]
  docs/02-ANALISIS.md → docs/01-CONTEXTO-Y-DECISIONES.md
- `F2 — Dinero (pagos, finanzas, portal Mi cuenta)` --references--> `M3 — Cobros`  [EXTRACTED]
  docs/01-CONTEXTO-Y-DECISIONES.md → docs/02-ANALISIS.md
- `I-26 — Portal de autoservicio del cliente (/mi-cuenta)` --references--> `CustomerAccount (cliente de una organización)`  [EXTRACTED]
  docs/05-IDEAS.md → docs/01-CONTEXTO-Y-DECISIONES.md

## Hyperedges (group relationships)
- **Aislamiento multi-tenant y RBAC por scope** — docs_03_spec_tenantcontext, docs_03_spec_matriz_rbac, docs_03_spec_aislamiento_tenant, docs_03_spec_roleassignment, docs_03_spec_audiencias_token, docs_03_spec_customeraccount [EXTRACTED 1.00]
- **Cadena de cobro idempotente (link → webhook → pago → reembolso)** — docs_03_spec_paymentlink, docs_03_spec_webhookevent, docs_03_spec_payment, docs_03_spec_refund, docs_03_spec_idempotencia [EXTRACTED 1.00]
- **Flujo de generación de contenido IA con validación** — docs_03_spec_generador_contenido_ia, docs_03_spec_ai_generation_job, docs_03_spec_ai_prompt_template, docs_03_spec_fact_validator, docs_03_spec_facts_json, docs_03_spec_ai_usage_ledger, docs_03_spec_sse_streaming [EXTRACTED 1.00]
- **Flujo de dinero: cotización → pedido → pago → webhook → reporte** — docs_04_guia_implementacion_quote, docs_04_guia_implementacion_order, docs_04_guia_implementacion_payment, docs_04_guia_implementacion_paymentwebhookevent, docs_04_guia_implementacion_webhook_pago_idempotente, docs_04_guia_implementacion_expense [EXTRACTED 1.00]
- **Pipeline de importación de catálogo desde Google Drive** — docs_04_guia_implementacion_importacion_google_drive, docs_04_guia_implementacion_catalog_versioning, docs_04_guia_implementacion_cuarentena_importacion, docs_04_guia_implementacion_importjob, docs_04_guia_implementacion_catalogversion, docs_04_guia_implementacion_product, docs_04_guia_implementacion_minio_urls_firmadas [EXTRACTED 1.00]
- **Sistema RBAC de dos audiencias (ADR-17/ADR-18)** — docs_04_guia_implementacion_dos_audiencias, docs_04_guia_implementacion_rbac_dos_caras, docs_04_guia_implementacion_audience_guard, docs_04_guia_implementacion_permissions_guard, docs_04_guia_implementacion_role, docs_04_guia_implementacion_permission, docs_04_guia_implementacion_roleassignment [EXTRACTED 1.00]
- **Escalera de planes de precio (Gratis → Enterprise)** — docs_06_costos_y_precios_plan_gratis, docs_06_costos_y_precios_plan_entrada_19, docs_06_costos_y_precios_plan_principal_39, docs_06_costos_y_precios_plan_multicatalogo_79, docs_06_costos_y_precios_plan_agencia_199, docs_06_costos_y_precios_plan_enterprise_399, docs_06_costos_y_precios_cuota_ia_por_plan [EXTRACTED 1.00]
- **Modelo económico unitario (COGS → ARPU → margen → LTV/CAC → break-even)** — docs_06_costos_y_precios_cogs_variable_org, docs_06_costos_y_precios_arpu_42_mezcla_base, docs_06_costos_y_precios_margen_bruto_escala, docs_06_costos_y_precios_ltv_por_churn, docs_06_costos_y_precios_cac_63_regimen, docs_06_costos_y_precios_ltv_cac_ratio, docs_06_costos_y_precios_break_even_orgs, docs_06_costos_y_precios_payback_inversion_ano_1 [EXTRACTED 1.00]
- **Go-to-market masivo: producto-led con dos palancas y embudo de conversión** — docs_06_costos_y_precios_gtm_producto_led, docs_06_costos_y_precios_plan_gratis_como_canal, docs_06_costos_y_precios_prueba_14_dias, docs_06_costos_y_precios_canal_partners_contadores, docs_06_costos_y_precios_embudo_conversion_gtm, docs_06_costos_y_precios_plan_90_dias_gtm [EXTRACTED 1.00]

## Communities (17 total, 4 thin omitted)

### Community 0 - "Catálogo, ventas y fases"
Cohesion: 0.06
Nodes (36): AiUsageLedger, AuditLog, AuthSession, Cara A — Backoffice staff (app.<dominio>), Cara B — Portal del cliente autenticado (/mi-cuenta), Cara B — Tienda pública (tienda.<dominio>), Catalog, CatalogVersion (+28 more)

### Community 1 - "Ciclo comercial y cobros"
Cohesion: 0.09
Nodes (22): Outbox de eventos (outbox_events), Ciclo cerrado catálogo → contenido → venta → cobro → datos → mejor contenido, ICP: revendedor o PYME de catálogo de temporada (es-CR), M2 — Ventas (cotización, pedido, PDF), M3 — Cobros, M4 — Finanzas, M5 — WhatsApp, M6 — Chat en vivo (+14 more)

### Community 2 - "Dos caras y RBAC"
Cohesion: 0.07
Nodes (37): Modelo de aislamiento multi-org y por catálogo, Audiencia del token (aud=staff / aud=customer), AuthSession (sesión revocable por dispositivo), Cara A — Backoffice (staff), Cara B — Tienda y portal del cliente, CustomerAccount (cliente de una organización), Ley 8968 (protección de datos personales, Costa Rica), Membership (colaborador staff de una organización) (+29 more)

### Community 3 - "Planes, COGS y precios"
Cohesion: 0.08
Nodes (26): AuditLog (auditoría append-only de mutaciones sensibles), Catalog (unidad comercial aislada), Cuota IA por organización y periodo, Organization (tenant del SaaS), M8 — Administración y seguridad, RG-02 — Coste de IA descontrolado, I-22 — Modo agencia white-label, I-25 — Panel de unit economics (+18 more)

### Community 4 - "Supuestos financieros y unit economics"
Cohesion: 0.07
Nodes (43): KPI-B01 — MRR (orgs de pago × ARPU USD 19), KPI-B03 — Margen bruto ≥60 %, KPI-B05 — LTV/CAC ≥3, Puerta G1 — ¿Alguien paga?, Puerta G3 — ¿Es un negocio o una herramienta?, QA-02 — ¿El ICP paga USD 19/mes y por qué concepto? (test de precio), RG-17 — Concentración en un cliente ancla (>40 % del MRR), RG-20 — Dependencia de un único VPS sin alta disponibilidad (+35 more)

### Community 5 - "Generación IA e importación"
Cohesion: 0.07
Nodes (30): AiGenerationJob, AiPromptTemplate versionada, AiQuotaPolicy (cuota IA por organización), AiUsageLedger (medición de tokens y coste), AuditLog append-only, CatalogImportJob, Catálogo activo (puntero active_version_id), CatalogVersion (foto inmutable de productos) (+22 more)

### Community 6 - "Clientes, WhatsApp y RBAC"
Cohesion: 0.15
Nodes (13): AuthSession (sesión por dispositivo), ChatConversation, Chat en vivo con Socket.IO, CustomerAccount, Catálogo de errores ERR-nnn, Membership (colaborador por organización), RF-USR-06 Cuenta de cliente, magic link y consentimientos, RF-WA-2 Envío con opt-in y ventana de 24 h (+5 more)

### Community 7 - "Decisiones MVP y puertas"
Cohesion: 0.07
Nodes (22): CatalogVersion (foto versionada e inmutable del catálogo), F0 — Fundaciones (monorepo, usuarios, roles, auth por audiencia), F1 — Catálogo y ventas, F2 — Dinero (pagos, finanzas, portal Mi cuenta), F3 — IA y canales, F4 — Endurecimiento, F5 — Diferenciación (chat, XLSX, ideas priorizadas), Plan de 15 semanas con 1,5 dev (Must 98,5 dp sobre 112,5 dp) (+14 more)

### Community 8 - "Pedidos, pagos y finanzas"
Cohesion: 0.25
Nodes (8): Quote (cotización), Order (pedido), Payment (pago), PaymentLink (link de pago), Refund (reembolso), RF-COB-2 Webhook idempotente y conciliación, RF-VEN-2 Cotización con totales y PDF compartible, WebhookEvent (evento de pasarela)

### Community 9 - "Arquitectura de módulos y API"
Cohesion: 0.14
Nodes (14): API mínima esperada del brief (endpoints /auth, /catalogs, /orders, /payments, /social, WebSocket /chat), Catálogo (archivo de Drive con productos, precios y stock), Módulo de administración y seguridad, Módulo de chat en vivo con el cliente, Módulo de cobro, Módulo de finanzas, Módulo de generación de contenido para redes sociales (IA), Módulo de conexión e importación desde Google Drive (+6 more)

### Community 10 - "Inversión y plan de entrega"
Cohesion: 0.16
Nodes (15): MoSCoW del MVP en días-persona (Must 106,5 + Should 27,5 = 134 dp), Contingencia de estimación del 15 % (S-C11), USD 7 060 en escenario B, Día-persona (dp): 6 h productivas y 21 dp por dev y mes, Escenario A — Founder-led / equipo propio (USD 200/dp), Escenario B — Equipo local Costa Rica (USD 245/dp, coste empresa ₡2 014 500/mes), Escenario C — Agencia o consultora (USD 460/dp, banda 360–560), MVP + 12 meses: 226 dp dev (134 + 92 de ideas) = 323,99 dp totales, Esfuerzo del MVP completo: 134 dp dev (126 F0–F4 + 8 F5 inmediato) = 192,10 dp totales (+7 more)

### Community 11 - "Go-to-market y embudo"
Cohesion: 0.18
Nodes (13): CAC por canal: self-serve 57,14 · referidos 42 · partner 75 · ferias 83,33 · venta directa 245, Canal de contenido y SEO local: USD 400/mes, 7 altas/mes a CAC 57,14, Canal de ferias y cámaras: 4–6 eventos al año a USD 450–500 (≈250/mes), 3 altas/mes, Canal de contadores y agencias: 25 % recurrente, precio de subcuenta USD 29, 8 partners a 12 meses, Canal de referidos: un mes gratis por referido que paga (CAC 42), Comisión de canal de partners: 25 % recurrente sobre el plan vendido (S-C25), Descuento anual por defecto: 2 meses gratis (USD 390/año = 32,50/mes; margen 90,6 %), Descuento de lanzamiento: −30 % por 12 meses a las primeras 50 organizaciones (+5 more)

### Community 13 - "Benchmarks de competencia"
Cohesion: 0.33
Nodes (5): Loyverse — POS gratis con add-ons de USD 7–25/mes; no comparable (POS de mostrador), Treinta — Esencial ≈USD 10/mes, Pro ≈USD 20/mes (anual −25 %), competidor más peligroso, Benchmarks de precio: Treinta, Loyverse, Shopify, Tienda Nube y stack sustituido, Stack sustituido ≈USD 85/mes (POS/ERP 20 + tienda 30 + programador social 20 + WhatsApp 15), Valor total sustituido USD 156–226/mes; el Principal (39) es el 17–25 % de ese valor

## Knowledge Gaps
- **75 isolated node(s):** `Mapeo de columnas de importación`, `Redis 7 + BullMQ (colas)`, `Streaming SSE de generación IA`, `AiPromptTemplate versionada`, `Catálogo de errores ERR-nnn` (+70 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 102 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `06 — Costos y precios: 3 escenarios × 3 alcances, unit economics, planes, break-even y go-to-market` connect `Dos caras y RBAC` to `Planes, COGS y precios`, `Inversión y plan de entrega`, `Go-to-market y embudo`, `Supuestos financieros y unit economics`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **What connects `Mapeo de columnas de importación`, `Redis 7 + BullMQ (colas)`, `Streaming SSE de generación IA` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Catálogo, ventas y fases` be split into smaller, more focused modules?**
  _Cohesion score 0.060041407867494824 - nodes in this community are weakly interconnected._
- **Why does `M3 — Cobros` connect `Ciclo comercial y cobros` to `Arquitectura de módulos y API`, `Supuestos financieros y unit economics`, `Decisiones MVP y puertas`?**
  _High betweenness centrality (0.085) - this node is a cross-community bridge._
- **Should `Ciclo comercial y cobros` be split into smaller, more focused modules?**
  _Cohesion score 0.08994708994708994 - nodes in this community are weakly interconnected._
- **Why does `Decisiones que condicionan todo: dos caras, usuarios con roles, aislamiento, monolito modular y plan de 15 semanas` connect `Dos caras y RBAC` to `Decisiones MVP y puertas`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Should `Dos caras y RBAC` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._