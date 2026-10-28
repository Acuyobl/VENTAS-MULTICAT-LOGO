# SELF-TEST — Fase 0 (preparación Graphify)

Fecha: 2026-10-28 · Intérprete: `C:\Users\Usuario\AppData\Roaming\uv\tools\graphifyy\Scripts\python.exe`
(graphify importa correctamente; el binario `graphify.exe` está bloqueado por WDAC y **no** se usó).

## Alcance

Autotest **fuera del proyecto**, en `%TEMP%\graphify-selftest`, `-selftest2` y `-selftest3`
(corpus ficticio: `docs/a.md`, `docs/b.md`). En el proyecto solo se creó `graphify-out/` con
los marcadores; **no** se escribió `graph.json` real.

## Comandos ejecutados (todos OK)

```
$PY tools\graphify_run.py init
$PY tools\graphify_run.py detect
$PY tools\graphify_run.py ast
$PY tools\graphify_run.py cache
# chunk semántico simulado escrito a mano: 3 nodos, 2 aristas, cobertura de 2 ficheros
$PY tools\graphify_run.py semantic --expect 1
$PY tools\graphify_run.py combine
$PY tools\graphify_run.py build
$PY tools\graphify_run.py label --auto        # y también --labels "0=Auth y Catalogo"
$PY tools\graphify_run.py html
$PY tools\graphify_run.py manifest
$PY tools\graphify_run.py status
$PY tools\graphify_run.py health
$PY tools\graphify_run.py all                 # atajo detect+ast+cache(+combine+build)
```

## APIs de graphify verificadas (import + firma real)

- `graphify.detect.detect`, `graphify.detect.save_manifest`
- `graphify.extract.extract`, `graphify.extract.collect_files`
- `graphify.cache.check_semantic_cache`, `graphify.cache.save_semantic_cache`
- `graphify.build.build_from_json` (con `root=`), `graphify.build.validate_extraction`
- `graphify.cluster.cluster`, `score_all`, `label_communities_by_hub`
- `graphify.analyze.god_nodes`, `surprising_connections`, `suggest_questions`
- `graphify.report.generate`
- `graphify.export.to_json` (guard anti-shrink), `graphify.export.to_html`
- `graphify.diagnostics.diagnose_extraction`, `format_diagnostic_report`
- `graphify.paths.load_node_link_graph`, `graphify.cli._stamped_manifest_files`
- `graphify.watch._read_build_excludes`, `_read_build_gitignore`

## Resultados verificados

- `detect`: 2 docs detectados; `.graphify_detect.json` escrito (rutas absolutas).
- `ast`: corpus sin código → AST vacío con `nodes/edges` vacíos; sin error.
- `cache` (B0): 1.ª corrida 0 hit / 2 pendientes; 2.ª corrida **2 hit / 0 pendientes**.
- `semantic` (B3): cobertura OK, caché guardada (2 archivos), `.graphify_semantic.json` con 3 nodos.
  Repetido sin chunks → mezcla todo desde caché (3 nodos) sin re-extraer.
- `combine`: 3 nodos / 2 aristas (0 AST + 3 semánticos) en `.graphify_extract.json`.
- `build`: 3 nodos, 2 aristas, 1 comunidad; `graph.json` + `GRAPH_REPORT.md` +
  `.graphify_analysis.json`; health "OK (sin aristas colgantes/colapsadas)".
- `label --auto` y `label --labels "0=..."`: informe regenerado y `community_name`
  presente en los 3 nodos de `graph.json`.
- `html`: `graph.html` (~23 KB) escrito; `manifest`: `manifest.json` + `cost.json` acumulando
  (`10 in / 5 out`); `--clean` borra temporales `.graphify_*` como el paso 9.
- Guard anti-shrink #479: con una extracción reducida a 1 nodo, `build` sale con error y
  `graph.json` queda intacto (3 nodos).
- `source_file` relativizado a la raíz del **proyecto** (`docs/a.md`), ids derivados de la
  ruta (`docs_a_auth`, `docs_b_catalogo`) y manifest con claves `docs/a.md`: sin rutas
  absolutas filtradas.

## Aserciones finales (E2E en `%TEMP%\graphify-selftest3`)

8/8 PASS: nodos≥3, `source_file` = `docs/*.md`, ids `docs_*`, `graph.html`,
`GRAPH_REPORT.md`, `manifest.json` (`docs/a.md`, `docs/b.md`) + `cost.json`, marcadores.
Además: 2.ª corrida de `cache` = 2 hit / 0 pendientes y `semantic` reconstruye desde caché.

## Notas de diseño

- `--root` = raíz del proyecto y `root=` de graphify (INPUT_PATH del runbook): ancla
  `source_file`, ids, cache, manifest e informe. `--corpus` = `<root>/docs` por defecto y
  solo limita qué archivos se escanean; la caché semántica/AST vive en
  `graphify-out/cache/` del proyecto.
- Sin Graphify CLI ni `graphify.llm`: la extracción semántica la escriben los subagentes y
  `semantic` solo hace merge/caché/cobertura.
- En el proyecto no queda ningún `graph.json`: no se dispara el guard anti-shrink en la fase real.
