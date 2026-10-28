# RESUMEN — Grafo Graphify de VentasCatálogo

Fecha: 2026-10-28 · Herramienta: graphify 0.9.95 (uv tool) · Artefactos en `graphify-out/`.

> `graphify.exe` está bloqueado por Application Control (WDAC). Todas las consultas deben
> ejecutarse con el intérprete del venv:
> `C:\Users\Usuario\AppData\Roaming\uv\tools\graphifyy\Scripts\python.exe`.

## Corpus

- 7 documentos Markdown de `docs/` (español, sin código fuente): `00-BRIEF`, `01-CONTEXTO-Y-DECISIONES`,
  `02-ANALISIS`, `03-SPEC`, `04-GUIA-IMPLEMENTACION`, `05-IDEAS`, `README`.
- 11.065 líneas · ~114.732 palabras · ~597 KB.
- Extracción semántica en 3 chunks (uno por bloque del plan), cobertura **7/7 archivos al 100 %**
  (sin ficheros parciales). Caché semántica poblada: 7 entradas.

## Métricas del grafo

| Métrica | Valor |
|---|---|
| Nodos | **279** |
| Aristas | **406** |
| Hiperaristas | **9** |
| Comunidades | **15** |
| Nodos huérfanos (grado 0) | **0** |
| Aristas colgantes / self-loops / colapsadas | **0 / 0 / 0** |
| Calidad de aristas | 92 % EXTRACTED · 8 % INFERRED · 0 % AMBIGUOUS (32 INFERRED, confianza media 0,82) |
| Salud | OK (diagnóstico Step 4.5 sin advertencias) |

Nodos por documento: `00-BRIEF` 16 · `01-CONTEXTO` 52 · `02-ANALISIS` 39 · `03-SPEC` 66 ·
`04-GUIA` 74 · `05-IDEAS` 27 · `README` 5. Ningún documento queda sin representación.

> Coste de tokens: el informe muestra `0 input / 0 output` porque los subagentes de extracción
> no devolvieron métricas de `usage` por chunk; no se inventó una estimación. El tamaño del corpus
> es el dato de referencia (114.732 palabras).

## God nodes (top 10)

1. `M2 — Ventas (cotización, pedido, PDF)` — 14 aristas
2. `VentasCatálogo (PWA multicatálogo con IA)` — 12
3. `CatalogVersion` — 12
4. `F1 — Catálogo, importación y ventas (semanas 3–6)` — 11
5. `Organization` — 11
6. `CustomerAccount (cliente de una organización)` — 10
7. `M1 — Conexión e importación desde Google Drive` — 10
8. `M3 — Cobros` — 10
9. `F0 — Fundaciones (semanas 1–2)` — 10
10. `Order` — 10

## Comunidades (15)

| # | Nombre | Nodos |
|---|---|---|
| 0 | Catálogo, ventas y fases | 35 |
| 1 | Ciclo comercial y cobros | 30 |
| 2 | Dos caras y RBAC | 29 |
| 3 | Aislamiento multi-organización | 28 |
| 4 | Fases y plan de entrega | 28 |
| 5 | Generación IA e importación | 26 |
| 6 | Clientes, WhatsApp y RBAC | 22 |
| 7 | Decisiones MVP y puertas | 20 |
| 8 | Pedidos, pagos y finanzas | 18 |
| 9 | Arquitectura de módulos y API | 17 |
| 10 | Fases y mapa documental | 9 |
| 11 | Endurecimiento, pruebas y CI/CD | 7 |
| 12 | Idempotencia y outbox | 4 |
| 13 | Stack y despliegue base | 3 |
| 14 | Facturación fiscal fuera de MVP | 3 |

## Conexiones sorprendentes (5)

- `ADR-11 — Proveedor de IA abstracto (AiProvider) con DeepSeek primario` → `Módulo de generación de
  contenido para redes sociales (IA)` — INFERRED (01 → 00; puente entre comunidades).
- `M2 — Ventas (cotización, pedido, PDF)` → `ADR-07 — Aislamiento por catálogo…` — EXTRACTED
  (02 → 01): la venta depende del aislamiento por catálogo.
- `M3 — Cobros` → `ADR-12 — Pagos por adaptadores (PaymentGateway)…` — EXTRACTED (02 → 01).
- `RG-01 — Fuga de datos entre catálogos u organizaciones` ↔ `R1 — Ninguna consulta cruza organization_id…`
  — INFERRED `semantically_similar_to` (02 ↔ 01): riesgo y regla dura convergen.
- `Paquete documental de VentasCatálogo (v1.0)` → `VentasCatálogo (PWA multicatálogo con IA)` —
  EXTRACTED (README → BRIEF).

## Preguntas sugeridas por el grafo (7, extracto)

1. ¿Por qué `M2 — Ventas` conecta “Ciclo comercial y cobros” con “Dos caras y RBAC”, “Aislamiento
   multi-organización” y “Decisiones MVP y puertas”? (betweenness 0,091).
2. ¿Qué conecta `Prompt maestro del brief original`, `Módulo de ventas` y `Módulo de finanzas` con el
   resto? (52 nodos con ≤1 conexión: posibles huecos de documentación).
3. ¿Conviene dividir “Catálogo, ventas y fases” (cohesión 0,124) en módulos más pequeños?
4. ¿Por qué `CustomerAccount` conecta “Dos caras y RBAC” con “Ciclo comercial y cobros” y
   “Aislamiento multi-organización”? (betweenness 0,062).
5. ¿Conviene dividir “Ciclo comercial y cobros” (cohesión 0,083)?
6. ¿Por qué `Organization` conecta “Aislamiento multi-organización” con “Dos caras y RBAC”?
7. ¿Conviene dividir “Dos caras y RBAC” (cohesión 0,099)?

## Cómo consultar el grafo

Con el intérprete del venv (no usar `graphify.exe`):

```powershell
$PY = "C:\Users\Usuario\AppData\Roaming\uv\tools\graphifyy\Scripts\python.exe"

# Búsqueda BFS sobre el grafo (respuesta + nodos/aristas usados)
& $PY -m graphify query "¿Cómo se aplica RBAC a las dos caras?" --graph graphify-out/graph.json

# Trazado DFS / camino más corto entre dos conceptos
& $PY -m graphify query "importación Drive a catálogo versionado" --dfs --graph graphify-out/graph.json
& $PY -m graphify path "CustomerAccount" "RoleAssignment" --graph graphify-out/graph.json

# Explicación de un nodo y sus vecinos
& $PY -m graphify explain "CustomerAccount" --graph graphify-out/graph.json

# Impacto inverso de un cambio
& $PY -m graphify affected "CatalogVersion" --depth 2 --graph graphify-out/graph.json

# Hubs del grafo
& $PY -m graphify god-nodes --top 10 --graph graphify-out/graph.json
```

También puede usarse el script del proyecto (mismo intérprete):

```powershell
& $PY tools\graphify_run.py status
& $PY tools\graphify_run.py health      # requiere .graphify_extract.json (se limpia en Step 9)
```

## Artefactos

- `graph.json` (235 KB) — grafo node-link con `community`/`community_name`, 9 hiperaristas.
- `GRAPH_REPORT.md` (11,7 KB) — informe de auditoría (god nodes, sorpresas, comunidades, huecos).
- `graph.html` (260 KB) — visualización interactiva.
- `.graphify_labels.json` — etiquetas de comunidades.
- `.graphify_analysis.json` — análisis (comunidades, cohesión, god nodes, sorpresas, preguntas).
- `.graphify_health.json` — diagnóstico de salud del Step 4.5.
- `manifest.json` + `cost.json` — manifiesto incremental y contador de tokens.
- `.graphify_python` / `.graphify_root` — intérprete y raíz para las consultas.

Notas: `graph.svg` no se generó (matplotlib no instalado; export opcional). Los nodos conceptuales
repetidos entre documentos (p. ej. `CustomerAccount` en 01 y 04) se conservan por proveniencia
documental; `graphify query` los muestra con su `source_file`.

## Actualización v1.1 — 2026-10-28 (doc 06 + cambios)

Actualización **incremental** con `tools/graphify_run.py update-detect` + `merge-update`
(manifest previo): solo se re-extraen los 4 documentos cambiados; los 4 intactos
(`00-BRIEF`, `03-SPEC`, `04-GUIA-IMPLEMENTACION`, `05-IDEAS`) se conservan del v1.0.

### Corpus v1.1

- **8 documentos · 12.515 líneas · ~133.285 palabras** (~700 KB, todo `docs/*.md`).
- Nuevo: `docs/06-COSTOS-Y-PRECIOS.md` (1.442 líneas, ~95 KB, tablas + 2 Mermaid).
- Re-extraídos: `01-CONTEXTO-Y-DECISIONES.md` (247 líneas), `02-ANALISIS.md` (1.422), `README.md` (104).
- Extracción: 1 chunk semántico (205 nodos, 309 aristas, 3 hiperaristas) con cobertura **4/4 al 100 %**.
- `build_merge` reemplazó 96 nodos de los documentos cambiados y rescató 13 aristas previas de nodos
  que habrían quedado aislados; health check Step 4.5: OK (0 dangling, 0 self-loops, 0 colapsadas).

### Antes → después

| Métrica | v1.0 (7 docs) | v1.1 (8 docs) |
|---|---|---|
| Nodos | 279 | **388** (+109) |
| Aristas | 406 | **606** (+200) |
| Hiperaristas | 9 | **9** |
| Comunidades | 15 | **17** (+2) |
| Nodos huérfanos (grado 0) | 0 | **0** |
| Calidad de aristas | 92 % EXT / 8 % INF | 95 % EXT / 5 % INF |
| Nodos de `docs/06` | — | **87** |

### Nodos del dominio financiero que aparecieron (doc 06)

- **Inversión MVP:** `Inversión de implementación del MVP (USD 38 420–88 366…)`, `Matriz de inversión
  3 escenarios × 3 alcances`, `Sensibilidad de la inversión del MVP`, `Inversión del año 1`,
  `Necesidad de caja del año 1`, `Payback de la inversión del año 1`, `Costes fijos`, `OPEX del año 1`.
- **Planes y precios:** `Plan Gratis`, `Plan Entrada`, `Plan Principal`, `Plan Multi-catálogo`,
  `Plan Agencia`, `Enterprise`, `Principio de precio`, `Política de precio USD vs CRC`,
  `Catálogo de add-ons`, `Política de descuentos`.
- **Economía unitaria y KPIs:** ARPU (10 nodos: 19/42/58), `Break-even operativo` y `Break-even en
  meses` (5), `LTV/CAC` (4), `CAC` por canal y de régimen (18), `MRR/ARR` (3), `Churn` (8),
  `COGS` por plan y variable (4), `Margen bruto`, `NRR`, `KPI-B01/B03/B05`.
- **Go-to-market:** `Modelo de venta producto-led`, `Embudo`, `CAC por canal`, `Canales de
  contadores/ferias/SEO`, `Plan de 90 días` (comunidad “Go-to-market y embudo”).
- **Benchmarks:** `Benchmarks de precio` (Treinta, Loyverse, Shopify, Tienda Nube) y
  `Valor total sustituido`.

### Comunidades nuevas o reetiquetadas

`Planes, COGS y precios` · `Supuestos financieros y unit economics` · `Inversión y plan de entrega` ·
`Go-to-market y embudo` · `Benchmarks de competencia` · `Stack de datos` · `Offline y modo feria`.
Las comunidades que conservaron contenido y etiqueta mantienen su id y nombre del v1.0.

### God nodes v1.1 (top 5)

1. `Modelo de aislamiento multi-org y por catálogo` — 13 aristas
2. `CatalogVersion` — 12
3. `Break-even operativo: ≈170 orgs (ARPU 42) · ≈123 (ARPU 58) · ≈581 (ARPU 19)` — 12
4. `F1 — Catálogo, importación y ventas (semanas 3–6)` — 11
5. `Organization` — 11

### Artefactos actualizados

`graph.json` (349 KB) · `GRAPH_REPORT.md` (13,8 KB) · `graph.html` (373 KB) · `.graphify_labels.json`
(17 etiquetas) · `.graphify_analysis.json` · `.graphify_health.json` · `manifest.json` · `cost.json`.

> Coste de tokens: de nuevo `0 input / 0 output` porque los agentes de extracción no devolvieron
> métricas `usage`; no se inventó estimación. Corpus de referencia: 133.285 palabras.
