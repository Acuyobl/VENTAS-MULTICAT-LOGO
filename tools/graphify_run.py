#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pipeline Graphify reutilizable para el corpus documental de VentasCatalogo.

Implementa por fases el runbook de ``graphify/skill-windows.md`` (pasos 1-9)
sobre el interprete que tiene graphify instalado (uv tool). No usa la CLI
``graphify.exe`` (bloqueada por WDAC): importa el paquete instalado.

El proyecto tiene dos raices:

* ``--root``     raiz del PROYECTO: aqui viven ``graphify-out/``, ``tools/``
                 y el marcador ``graphify-out/.graphify_root``. Es el
                 ``root=``/``INPUT_PATH`` del runbook: ancla ``source_file``,
                 ids, cache, manifest e informe (``docs/00-BRIEF.md`` ->
                 ``docs_00_brief``).
* ``--corpus``   raiz del CORPUS escaneado (por defecto ``<root>/docs``);
                 solo limita que archivos se detectan.

Fases / subcomandos (en orden de ejecucion):

  init            crea graphify-out/ + .graphify_python + .graphify_root
  detect          escanea el corpus -> .graphify_detect.json
  ast             Parte A: extraccion AST (vacia si el corpus no tiene codigo)
  cache           Parte B0: consulta la cache semantica -> .graphify_cached.json
                  y .graphify_uncached.txt (lista de ficheros a extraer)
  semantic        Parte B3: recibe los chunks .graphify_chunk_*.json ya escritos
                  por los subagentes, verifica cobertura, guarda cache y escribe
                  .graphify_semantic.json
  combine         Parte C: merge AST + semantica -> .graphify_extract.json
  update-detect   update incremental: detecta solo docs nuevos/cambiados
  merge-update    update incremental: build_merge conserva y reemplaza lo cambiado
  build           build + cluster + analyze + report + to_json + diagnostico
                  de salud -> graph.json, GRAPH_REPORT.md, .graphify_analysis.json
  label           etiqueta comunidades (manual/auto), regenera informe y
                  reexporta graph.json con community_name
  html            exporta graph.html interactivo
  manifest        manifest.json + cost.json (y limpieza opcional de temporales)
  health          solo diagnostico de salud sobre .graphify_extract.json
  status          inventario de artefactos y conteos
  all             detect + ast + cache + combine + build (se detiene si aun no
                  hay extraccion semantica; util cuando ya existen los chunks)

Ejemplos:

  & $PY tools/graphify_run.py init
  & $PY tools/graphify_run.py detect
  & $PY tools/graphify_run.py ast
  & $PY tools/graphify_run.py cache
  & $PY tools/graphify_run.py semantic --expect 1
  & $PY tools/graphify_run.py combine
  & $PY tools/graphify_run.py build
  & $PY tools/graphify_run.py label --auto
  & $PY tools/graphify_run.py html
  & $PY tools/graphify_run.py manifest --clean

No usa bash, heredocs ni la CLI ``graphify``: solo stdlib + el paquete
``graphify`` instalado (y sus dependencias, p. ej. networkx).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import traceback
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

OUT_NAME = "graphify-out"
CHUNK_GLOB = ".graphify_chunk_*.json"
SEMANTIC_CATEGORIES = ("document", "paper", "image")
CATEGORY_LABELS = {
    "code": "codigo",
    "document": "docs",
    "paper": "papers",
    "image": "imagenes",
    "video": "video",
}

# --------------------------------------------------------------------------- #
# Utilidades de E/S (UTF-8 sin BOM, JSON con acentos legibles)
# --------------------------------------------------------------------------- #


def _configure_stdio() -> None:
    """Evita UnicodeEncodeError en consolas/pipes Windows con acentos."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass


def _write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _write_json(path: Path, data: Any, *, indent: int = 2) -> None:
    _write_text(path, json.dumps(data, indent=indent, ensure_ascii=False))


def _read_json(path: Path) -> Any:
    return json.loads(_read_text(path))


def log(msg: str = "") -> None:
    print(msg, flush=True)


def warn(msg: str) -> None:
    print(f"AVISO: {msg}", file=sys.stderr, flush=True)


def die(msg: str, code: int = 1) -> int:
    print(f"ERROR: {msg}", file=sys.stderr, flush=True)
    return code


def _default_root() -> Path:
    return Path(__file__).resolve().parent.parent


def get_root(args: argparse.Namespace) -> Path:
    raw = getattr(args, "root", None)
    root = Path(raw).expanduser() if raw else _default_root()
    if not root.is_absolute():
        root = Path.cwd() / root
    return root.resolve()


def resolve_corpus(args: argparse.Namespace, root: Path) -> Path:
    raw = getattr(args, "corpus", None)
    if raw:
        corpus = Path(raw).expanduser()
        if not corpus.is_absolute():
            corpus = root / corpus
        return corpus.resolve()
    docs = root / "docs"
    return docs.resolve() if docs.is_dir() else root


def out_dir(root: Path) -> Path:
    return root / OUT_NAME


def _marker_warning(root: Path, out: Path) -> None:
    marker = out / ".graphify_root"
    if not marker.is_file():
        return
    try:
        saved = _read_text(marker).strip()
    except OSError:
        return
    if saved and Path(saved).resolve() != root:
        warn(
            f".graphify_root apunta a {saved!r} pero la raiz usada es {str(root)!r}; "
            "no se sobrescribe (usa `init --force` si es intencional)."
        )


def ensure_out(root: Path, *, rewrite_markers: bool = False) -> Path:
    """Crea graphify-out/ y los marcadores del runbook (paso 1)."""
    out = out_dir(root)
    out.mkdir(parents=True, exist_ok=True)
    python_marker = out / ".graphify_python"
    root_marker = out / ".graphify_root"
    if rewrite_markers or not python_marker.is_file():
        _write_text(python_marker, str(Path(sys.executable).resolve()))
    if rewrite_markers or not root_marker.is_file():
        _write_text(root_marker, str(root))
    else:
        _marker_warning(root, out)
    return out


def require_out(root: Path) -> Path:
    out = ensure_out(root)
    return out


def default_spec_path(explicit: str | None = None) -> Path:
    """Prompt de extraccion que firma la cache (extraction-spec.md instalado)."""
    if explicit:
        p = Path(explicit).expanduser()
        if not p.is_absolute():
            p = Path.cwd() / p
        if not p.is_file():
            raise FileNotFoundError(f"no existe el prompt de extraccion: {p}")
        return p.resolve()
    try:
        import graphify  # noqa: F401  (solo para localizar el paquete)
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError(
            "graphify no es importable desde este interprete; ejecuta el script "
            f"con el python del uv tool. Detalle: {exc}"
        ) from exc
    pkg = Path(graphify.__file__).resolve().parent
    candidate = pkg / "skills" / "claude" / "references" / "extraction-spec.md"
    if not candidate.is_file():
        raise FileNotFoundError(f"no se encontro extraction-spec.md en {pkg}")
    return candidate


def _flatten(by_type: dict[str, list[str]]) -> list[str]:
    seen: list[str] = []
    for files in by_type.values():
        for f in files:
            if f not in seen:
                seen.append(f)
    return seen


def _load_detect(out: Path) -> dict:
    path = out / ".graphify_detect.json"
    if not path.is_file():
        raise FileNotFoundError(
            f"falta {path.name}; ejecuta antes `detect`."
        )
    return _read_json(path)


def _cosmetic_count(n: int, singular: str, plural: str) -> str:
    return f"{n} {singular if n == 1 else plural}"


# --------------------------------------------------------------------------- #
# init / status
# --------------------------------------------------------------------------- #


def cmd_init(args: argparse.Namespace) -> int:
    root = get_root(args)
    out = ensure_out(root, rewrite_markers=bool(getattr(args, "force", False)))
    log(f"Proyecto : {root}")
    log(f"Salida   : {out}")
    log(f"Interprete: {_read_text(out / '.graphify_python')}")
    log(f"Marcador .graphify_root: {_read_text(out / '.graphify_root')}")
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    root = get_root(args)
    out = out_dir(root)
    corpus = resolve_corpus(args, root)
    log(f"Proyecto : {root}")
    log(f"Corpus   : {corpus}")
    log(f"Salida   : {out}")
    if not out.is_dir():
        log("graphify-out/ no existe todavia (ejecuta `init`).")
        return 0
    checks = [
        ".graphify_python",
        ".graphify_root",
        ".graphify_detect.json",
        ".graphify_ast.json",
        ".graphify_semantic.json",
        ".graphify_extract.json",
        ".graphify_analysis.json",
        ".graphify_labels.json",
        "graph.json",
        "GRAPH_REPORT.md",
        "graph.html",
        "manifest.json",
        "cost.json",
    ]
    log("")
    for name in checks:
        p = out / name
        if p.is_file():
            log(f"  [x] {name:<26} {p.stat().st_size:>10,} bytes")
        else:
            log(f"  [ ] {name}")
    graph_path = out / "graph.json"
    if graph_path.is_file():
        try:
            data = _read_json(graph_path)
            nodes = len(data.get("nodes", []))
            links = len(data.get("links", data.get("edges", [])))
            hyper = len(data.get("hyperedges", []))
            cids = {
                n.get("community")
                for n in data.get("nodes", [])
                if n.get("community") is not None
            }
            log("")
            log(
                f"graph.json: {nodes} nodos, {links} aristas, "
                f"{len(cids)} comunidades, {hyper} hiperaristas"
            )
        except (OSError, ValueError) as exc:
            warn(f"graph.json ilegible: {exc}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 1 - detect
# --------------------------------------------------------------------------- #


def cmd_detect(args: argparse.Namespace) -> int:
    from graphify.detect import detect
    from graphify.watch import _read_build_excludes, _read_build_gitignore

    root = get_root(args)
    corpus = resolve_corpus(args, root)
    out = require_out(root)
    if not corpus.is_dir():
        return die(f"el corpus no existe o no es un directorio: {corpus}")

    result = detect(
        corpus,
        extra_excludes=_read_build_excludes(out),
        gitignore=_read_build_gitignore(out),
        # cache_root= mantiene el cache de conteo de palabras en el
        # graphify-out/ del PROYECTO (no en <corpus>/graphify-out), igual que
        # extract y check_semantic_cache; asi el stat-index no cambia de raiz a
        # mitad de proceso (#3989).
        cache_root=root,
    )
    _write_json(out / ".graphify_detect.json", result)

    log(f"Corpus: {result['total_files']} archivos · ~{result['total_words']:,} palabras")
    files = result.get("files", {})
    for cat in ("code", "document", "paper", "image", "video"):
        n = len(files.get(cat, []))
        if n:
            log(f"  {CATEGORY_LABELS[cat]:<9} {_cosmetic_count(n, 'archivo', 'archivos')}")
    skipped = result.get("skipped_sensitive") or []
    if skipped:
        log(f"  omitidos sensibles: {len(skipped)}")
        for item in skipped[:10]:
            log(f"    - {item}")
    if result.get("unclassified"):
        log(f"  no clasificables: {len(result['unclassified'])}")
    if result.get("ignored"):
        log(f"  ignorados por reglas: {len(result['ignored'])}")
    if result.get("warning"):
        log(f"AVISO corpus: {result['warning']}")
    if result.get("total_files", 0) == 0:
        return die(f"no se encontraron archivos soportados en {corpus}")
    log(f"Detect escrito en {out / '.graphify_detect.json'}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 2 - Part A: AST (vacio si no hay codigo)
# --------------------------------------------------------------------------- #


def cmd_ast(args: argparse.Namespace) -> int:
    from graphify.extract import collect_files, extract

    root = get_root(args)
    out = require_out(root)
    detection = _load_detect(out)

    code_files: list[Path] = []
    for f in detection.get("files", {}).get("code", []):
        p = Path(f)
        if p.is_dir():
            code_files.extend(collect_files(p))
        else:
            code_files.append(p)

    if code_files:
        # root= absoluto del PROYECTO (igual que INPUT_PATH del runbook): ancla
        # ids y source_file; la cache vive en <root>/graphify-out/cache.
        result = extract(code_files, cache_root=root, root=root)
        log(
            f"AST: {len(result.get('nodes', []))} nodos, "
            f"{len(result.get('edges', []))} aristas "
            f"({len(code_files)} archivos de codigo)"
        )
    else:
        result = {
            "nodes": [],
            "edges": [],
            "input_tokens": 0,
            "output_tokens": 0,
        }
        log("Sin archivos de codigo: AST vacio (Parte A skip).")

    _write_json(out / ".graphify_ast.json", result)
    log(f"AST escrito en {out / '.graphify_ast.json'}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 3 - Part B0: cache semantica
# --------------------------------------------------------------------------- #


def cmd_cache(args: argparse.Namespace) -> int:
    from graphify.cache import check_semantic_cache

    root = get_root(args)
    out = require_out(root)
    detection = _load_detect(out)
    spec = default_spec_path(getattr(args, "spec", None))

    all_files = [
        f for cat in SEMANTIC_CATEGORIES for f in detection.get("files", {}).get(cat, [])
    ]

    cached_nodes, cached_edges, cached_hyperedges, uncached = check_semantic_cache(
        all_files,
        root=root,
        cache_root=root,
        prompt_file=spec,
    )

    if cached_nodes or cached_edges or cached_hyperedges:
        _write_json(
            out / ".graphify_cached.json",
            {
                "nodes": cached_nodes,
                "edges": cached_edges,
                "hyperedges": cached_hyperedges,
            },
        )
    else:
        (out / ".graphify_cached.json").unlink(missing_ok=True)

    _write_text(out / ".graphify_uncached.txt", "\n".join(uncached))
    # Cualquier chunk en disco es de una ejecucion interrumpida; B3 los mezclaria.
    stale = list(out.glob(CHUNK_GLOB))
    for path in stale:
        path.unlink()

    hits = len(all_files) - len(uncached)
    log(
        f"Cache semantica: {hits} archivos en cache, "
        f"{len(uncached)} por extraer (prompt: {spec.name})"
    )
    if stale:
        log(f"  eliminados {len(stale)} chunks obsoletos de una corrida anterior")
    if not all_files:
        warn("el detect no reporto documentos/papers/imagenes: no hay fase semantica")
    log(f"Pendientes en {out / '.graphify_uncached.txt'}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 4 - Part B3: merge de chunks, cobertura y cache
# --------------------------------------------------------------------------- #


def _count_lines(path: Path) -> int:
    with path.open("r", encoding="utf-8", errors="replace") as fh:
        return sum(1 for _ in fh)


def _coverage_rows(coverage: dict[str, Any], corpus: Path) -> list[tuple[str, int, int]]:
    rows: list[tuple[str, int, int]] = []
    for src, reported in coverage.items():
        p = Path(src)
        if not p.is_absolute():
            p = corpus / src
        if not p.is_file():
            continue
        try:
            read_lines = int(reported)
        except (TypeError, ValueError):
            read_lines = 0
        rows.append((str(p.resolve()), read_lines, _count_lines(p)))
    return rows


def merge_semantic_chunks(
    chunks: Sequence[Path | str | dict],
    *,
    root: Path,
    corpus: Path,
    out: Path,
    uncached: Iterable[str] | None = None,
    spec_path: Path | None = None,
    check_coverage: bool = True,
    allow_empty: bool = False,
) -> dict[str, Any]:
    """Parte B3 del runbook: recibe los chunks ya extraidos por los subagentes.

    Acepta rutas a ``.graphify_chunk_NN.json`` o directamente los dicts ya
    cargados. Hace, en este orden:

    1. agrega nodos/aristas/hiperaristas y tokens de cada chunk;
    2. verifica la cobertura declarada contra las lineas reales de cada archivo
       y escribe ``.graphify_partial.txt`` con los ficheros leidos a medias;
    3. escribe ``.graphify_semantic_new.json``;
    4. guarda la cache semantica (``save_semantic_cache``) con el mismo prompt
       que uso ``cache``;
    5. mezcla cache + nuevos, deduplica por id y escribe
       ``.graphify_semantic.json``;
    6. limpia los temporales de la fase.

    Devuelve un resumen con conteos y ficheros parciales.
    """
    from graphify.build import validate_extraction
    from graphify.cache import save_semantic_cache

    all_nodes: list[dict] = []
    all_edges: list[dict] = []
    all_hyperedges: list[dict] = []
    total_in = 0
    total_out = 0
    coverage: dict[str, Any] = {}
    accepted = 0
    rejected: list[str] = []
    real_errors: list[str] = []

    for item in chunks:
        label = str(item) if not isinstance(item, dict) else "<dict>"
        if isinstance(item, dict):
            data = item
        else:
            path = Path(item)
            if not path.is_file():
                rejected.append(f"{label} (no existe)")
                warn(f"chunk ausente: {path}")
                continue
            try:
                data = _read_json(path)
            except (OSError, ValueError) as exc:
                rejected.append(f"{label} (JSON invalido: {exc})")
                warn(f"chunk invalido {path}: {exc}")
                continue
        if not isinstance(data, dict):
            rejected.append(f"{label} (no es un objeto JSON)")
            warn(f"chunk ignorado {label}: no es un objeto JSON")
            continue
        nodes = data.get("nodes") or []
        edges = data.get("edges") or []
        hyperedges = data.get("hyperedges") or []
        if not isinstance(nodes, list) or not isinstance(edges, list):
            rejected.append(f"{label} (nodes/edges no son listas)")
            warn(f"chunk ignorado {label}: nodes/edges no son listas")
            continue
        errors = validate_extraction({"nodes": nodes, "edges": edges})
        real = [e for e in errors if "does not match any node id" not in e]
        if real:
            real_errors.extend(f"{label}: {e}" for e in real)
        all_nodes.extend(n for n in nodes if isinstance(n, dict))
        all_edges.extend(e for e in edges if isinstance(e, dict))
        all_hyperedges.extend(h for h in hyperedges if isinstance(h, dict))
        total_in += int(data.get("input_tokens", 0) or 0)
        total_out += int(data.get("output_tokens", 0) or 0)
        for src, reported in (data.get("coverage") or {}).items():
            try:
                reported_i = int(reported)
            except (TypeError, ValueError):
                reported_i = 0
            prev = coverage.get(src)
            if prev is None or reported_i > int(prev):
                coverage[src] = reported_i
        accepted += 1

    if real_errors:
        warn(
            f"{len(real_errors)} problema(s) de esquema en los chunks "
            "(se conservan igualmente; revisa source_file/file_type):"
        )
        for err in real_errors[:10]:
            warn(f"  - {err}")

    new_result = {
        "nodes": all_nodes,
        "edges": all_edges,
        "hyperedges": all_hyperedges,
        "input_tokens": total_in,
        "output_tokens": total_out,
    }
    _write_json(out / ".graphify_semantic_new.json", new_result)

    # Cobertura real (paso B3.5 del runbook).
    partial: list[str] = []
    coverage_rows: list[dict[str, Any]] = []
    if check_coverage and coverage:
        for src, read_lines, total in _coverage_rows(coverage, corpus):
            coverage_rows.append(
                {"file": src, "lines_read": read_lines, "lines_total": total}
            )
            if total and read_lines < total:
                partial.append(src)
    _write_text(out / ".graphify_partial.txt", "\n".join(partial))
    if partial:
        warn(
            f"{len(partial)} archivo(s) leidos solo en parte; quedan fuera del "
            "manifiesto y se reintentaran en el proximo `--update`:"
        )
        for row in coverage_rows:
            if row["file"] in partial:
                warn(
                    f"  - {row['file']}: {row['lines_read']} de "
                    f"{row['lines_total']} lineas"
                )
    elif coverage:
        log("Cobertura OK: todos los archivos reportados se leyeron hasta el final.")

    # Lista de ficheros despachados (para limitar que se cachea).
    uncached_list: list[str] = []
    if uncached is not None:
        uncached_list = [str(u) for u in uncached if str(u)]
    else:
        uncached_file = out / ".graphify_uncached.txt"
        if uncached_file.is_file():
            uncached_list = [
                line for line in _read_text(uncached_file).splitlines() if line.strip()
            ]
        elif coverage:
            uncached_list = [str(p) for p in coverage]

    saved = 0
    if accepted and (all_nodes or all_edges or all_hyperedges):
        saved = save_semantic_cache(
            all_nodes,
            all_edges,
            all_hyperedges,
            root=root,
            cache_root=root,
            allowed_source_files=uncached_list or None,
            prompt_file=spec_path,
            partial_source_files=partial or None,
        )

    # Mezcla cache + nuevos.
    cached_path = out / ".graphify_cached.json"
    cached = (
        _read_json(cached_path)
        if cached_path.is_file()
        else {"nodes": [], "edges": [], "hyperedges": []}
    )
    merged_nodes: list[dict] = []
    seen: set[str] = set()
    for node in list(cached.get("nodes", [])) + all_nodes:
        if not isinstance(node, dict):
            continue
        nid = node.get("id")
        if not isinstance(nid, str):
            continue
        if nid in seen:
            continue
        seen.add(nid)
        merged_nodes.append(node)
    merged_edges = list(cached.get("edges", [])) + all_edges
    merged_hyperedges = list(cached.get("hyperedges", [])) + all_hyperedges

    if not merged_nodes and not allow_empty:
        return {
            "ok": False,
            "error": (
                "no hay nodos en la extraccion semantica (ni cache ni chunks). "
                "Revisa que los subagentes hayan escrito .graphify_chunk_*.json."
            ),
            "nodes": 0,
            "edges": 0,
            "partial": partial,
            "saved": saved,
            "chunks_accepted": accepted,
            "chunks_rejected": rejected,
            "coverage": coverage_rows,
        }

    merged = {
        "nodes": merged_nodes,
        "edges": merged_edges,
        "hyperedges": merged_hyperedges,
        "input_tokens": total_in,
        "output_tokens": total_out,
    }
    _write_json(out / ".graphify_semantic.json", merged)

    # Limpieza de temporales de la fase (se conserva .graphify_semantic.json).
    for name in (".graphify_cached.json", ".graphify_uncached.txt", ".graphify_semantic_new.json"):
        (out / name).unlink(missing_ok=True)
    for path in out.glob(CHUNK_GLOB):
        path.unlink()

    return {
        "ok": True,
        "nodes": len(merged_nodes),
        "edges": len(merged_edges),
        "hyperedges": len(merged_hyperedges),
        "cached_nodes": len(cached.get("nodes", [])),
        "new_nodes": len(all_nodes),
        "input_tokens": total_in,
        "output_tokens": total_out,
        "partial": partial,
        "saved": saved,
        "chunks_accepted": accepted,
        "chunks_rejected": rejected,
        "coverage": coverage_rows,
    }


def cmd_semantic(args: argparse.Namespace) -> int:
    root = get_root(args)
    corpus = resolve_corpus(args, root)
    out = require_out(root)
    spec = default_spec_path(getattr(args, "spec", None))

    chunk_paths = sorted(out.glob(getattr(args, "pattern", CHUNK_GLOB)))
    if chunk_paths:
        log(f"Chunks encontrados: {len(chunk_paths)}")
        for p in chunk_paths:
            log(f"  - {p.name}")
    expected = getattr(args, "expect", None)
    if expected is not None and len(chunk_paths) < int(expected):
        warn(
            f"se esperaban {expected} chunks y solo hay {len(chunk_paths)}; "
            "revisa que todos los subagentes hayan escrito su fichero"
        )

    summary = merge_semantic_chunks(
        chunk_paths,
        root=root,
        corpus=corpus,
        out=out,
        spec_path=spec,
        check_coverage=not bool(getattr(args, "no_coverage", False)),
        allow_empty=bool(getattr(args, "allow_empty", False)),
    )
    if not summary.get("ok"):
        return die(str(summary.get("error")))

    log(
        f"Semantica: {summary['nodes']} nodos, {summary['edges']} aristas, "
        f"{summary['hyperedges']} hiperaristas "
        f"({summary['cached_nodes']} desde cache + {summary['new_nodes']} nuevos)"
    )
    log(
        f"  tokens: {summary['input_tokens']:,} in / "
        f"{summary['output_tokens']:,} out · cache guardada: {summary['saved']} archivos"
    )
    if summary["partial"]:
        warn(f"parciales (se reintentaran): {len(summary['partial'])}")
    log(f"Semantica escrita en {out / '.graphify_semantic.json'}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 5 - Part C: merge AST + semantica
# --------------------------------------------------------------------------- #


def _empty_extraction() -> dict:
    return {
        "nodes": [],
        "edges": [],
        "hyperedges": [],
        "input_tokens": 0,
        "output_tokens": 0,
    }


def cmd_combine(args: argparse.Namespace) -> int:
    root = get_root(args)
    out = require_out(root)

    ast_path = out / ".graphify_ast.json"
    sem_path = out / ".graphify_semantic.json"
    if not ast_path.is_file():
        return die(f"falta {ast_path.name}; ejecuta antes `ast`.")
    ast = _read_json(ast_path)
    if sem_path.is_file():
        sem = _read_json(sem_path)
    elif getattr(args, "allow_empty", False):
        warn("no hay extraccion semantica; se combina solo el AST (modo vacio).")
        sem = _empty_extraction()
    else:
        return die(
            f"falta {sem_path.name}; ejecuta `cache`, despacha los subagentes y "
            "luego `semantic` (o usa --allow-empty para un corpus solo-codigo)."
        )

    # El runbook marca explicitamente el origen semantico: un source_location
    # con forma 'L12' haria que build lo tomara por AST (#2843).
    for node in sem.get("nodes", []):
        if isinstance(node, dict):
            node.setdefault("_origin", "semantic")
    for edge in sem.get("edges", []):
        if isinstance(edge, dict):
            edge.setdefault("_origin", "semantic")

    seen = {n.get("id") for n in ast.get("nodes", []) if isinstance(n, dict)}
    merged_nodes = [n for n in ast.get("nodes", []) if isinstance(n, dict)]
    for node in sem.get("nodes", []):
        if not isinstance(node, dict):
            continue
        nid = node.get("id")
        if nid in seen:
            continue
        merged_nodes.append(node)
        seen.add(nid)

    merged = {
        "nodes": merged_nodes,
        "edges": list(ast.get("edges", [])) + list(sem.get("edges", [])),
        "hyperedges": list(sem.get("hyperedges", [])),
        "input_tokens": int(sem.get("input_tokens", 0) or 0),
        "output_tokens": int(sem.get("output_tokens", 0) or 0),
    }
    if not merged_nodes:
        return die("la extraccion combinada no tiene nodos; no se escribe nada.")

    _write_json(out / ".graphify_extract.json", merged)
    log(
        f"Extract combinado: {len(merged_nodes)} nodos, {len(merged['edges'])} aristas "
        f"({len(ast.get('nodes', []))} AST + {len(sem.get('nodes', []))} semanticos)"
    )
    log(f"Extract escrito en {out / '.graphify_extract.json'}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 5b - update incremental (runbook references/update.md)
# --------------------------------------------------------------------------- #

# Carpetas/patrones que no son corpus documental: el proyecto puede contener
# codigo de la implementacion, pero este grafo solo cubre docs/*.md.
UPDATE_EXCLUDES = [
    "apps/",
    "packages/",
    "infra/",
    "tools/",
    "node_modules/",
    ".git/",
    "*.txt",
]


def _under_docs(path: str | Path, root: Path) -> bool:
    try:
        Path(path).resolve().relative_to((root / "docs").resolve())
        return True
    except (ValueError, OSError):
        return False


def _filter_docs_files(by_type: dict[str, list[str]] | None, root: Path) -> dict[str, list[str]]:
    """Deja solo documentos Markdown dentro de docs/ (ignora codigo/README raiz)."""
    filtered: dict[str, list[str]] = {}
    for cat, files in (by_type or {}).items():
        kept = []
        for f in files or []:
            p = Path(f)
            if not _under_docs(p, root):
                continue
            if p.suffix.lower() not in (".md", ".markdown"):
                continue
            kept.append(str(p.resolve()))
        filtered[cat] = sorted(kept)
    return filtered


def cmd_update_detect(args: argparse.Namespace) -> int:
    """Paso 1 del --update: detecta SOLO los docs nuevos/cambiados (manifest)."""
    from graphify.detect import detect, detect_incremental
    from graphify.watch import _read_build_excludes, _read_build_gitignore

    root = get_root(args)
    out = require_out(root)
    manifest = out / "manifest.json"
    if not manifest.is_file():
        return die(
            f"falta {manifest.name}: no hay linea base para el update incremental. "
            "Ejecuta antes un build completo."
        )

    extra = list(_read_build_excludes(out)) + UPDATE_EXCLUDES
    base_gitignore = _read_build_gitignore(out)

    incremental = detect_incremental(
        root,
        manifest_path=str(manifest),
        extra_excludes=extra,
        gitignore=base_gitignore,
        cache_root=root,
    )
    # Escaneo del corpus real (docs/) para all_files + total_words correctos.
    docs_detect = detect(
        (root / "docs").resolve(),
        extra_excludes=_read_build_excludes(out),
        gitignore=base_gitignore,
        cache_root=root,
    )

    changed = _filter_docs_files(incremental.get("new_files", {}), root)
    all_docs = _filter_docs_files(docs_detect.get("files", {}), root)
    changed_total = sum(len(v) for v in changed.values())
    deleted = [
        str(Path(f).resolve())
        for f in (incremental.get("deleted_files") or [])
        if _under_docs(f, root)
    ]

    payload = {
        "new_files": changed,
        "files": all_docs,
        "new_total": changed_total,
        "total_files": docs_detect.get("total_files", 0),
        "total_words": docs_detect.get("total_words", 0),
        "deleted_files": deleted,
        "unchanged_files": [
            f
            for files in all_docs.values()
            for f in files
            if f not in {g for gs in changed.values() for g in gs}
        ],
        "scan_root": str((root / "docs").resolve()),
        "incremental": True,
    }
    _write_json(out / ".graphify_incremental.json", payload)

    # `.graphify_detect.json` con files=subconjunto cambiado y all_files=corpus
    # completo, como pide references/update.md.
    detect_doc = {
        "files": changed,
        "all_files": all_docs,
        "total_files": docs_detect.get("total_files", 0),
        "total_words": docs_detect.get("total_words", 0),
        "needs_graph": True,
        "incremental": True,
        "changed_total": changed_total,
        "skipped_sensitive": docs_detect.get("skipped_sensitive", []),
        "unclassified": docs_detect.get("unclassified", []),
        "ignored": docs_detect.get("ignored", []),
        "walk_errors": docs_detect.get("walk_errors", []),
        "scan_root": str((root / "docs").resolve()),
    }
    _write_json(out / ".graphify_detect.json", detect_doc)

    # Copia de seguridad del grafo/etiquetas previos (para diff y etiquetas).
    for src_name, dst_name in (
        ("graph.json", ".graphify_prev.json"),
        (".graphify_labels.json", ".graphify_prev_labels.json"),
    ):
        src = out / src_name
        if src.is_file():
            shutil.copy2(src, out / dst_name)

    log(f"Corpus docs: {docs_detect.get('total_files', 0)} archivos · "
        f"~{docs_detect.get('total_words', 0):,} palabras")
    log(f"Cambiados/nuevos: {changed_total}")
    for cat, files in changed.items():
        for f in files:
            log(f"  [{cat}] {Path(f).name}")
    if deleted:
        log(f"Eliminados: {len(deleted)}")
        for f in deleted:
            log(f"  - {Path(f).name}")
    unchanged = payload["unchanged_files"]
    log(f"Sin cambios (no se re-extraen): {len(unchanged)}")
    if changed_total == 0 and not deleted:
        log("Nada que actualizar.")
    return 0


def cmd_merge_update(args: argparse.Namespace) -> int:
    """Merge incremental: build_merge conserva el grafo y reemplaza lo cambiado."""
    from graphify.build import build_merge
    from graphify.cli import _stamped_manifest_files
    from graphify.detect import save_manifest

    root = get_root(args)
    out = require_out(root)
    directed = bool(getattr(args, "directed", False))

    inc_path = out / ".graphify_incremental.json"
    ext_path = out / ".graphify_extract.json"
    graph_path = out / "graph.json"
    if not inc_path.is_file():
        return die(f"falta {inc_path.name}; ejecuta antes `update-detect`.")
    if not ext_path.is_file():
        return die(
            f"falta {ext_path.name}; ejecuta `ast`, `cache`, `semantic` y `combine` "
            "sobre los archivos cambiados."
        )
    incremental = _read_json(inc_path)
    new_extraction = _read_json(ext_path)

    old_count = 0
    if graph_path.is_file():
        old_count = len(_read_json(graph_path).get("nodes", []))

    deleted = list(incremental.get("deleted_files") or [])
    G = build_merge(
        [new_extraction],
        graph_path=str(graph_path),
        prune_sources=deleted or None,
        root=root,
        directed=directed,
    )
    merged_out = {
        "nodes": [{"id": n, **d} for n, d in G.nodes(data=True)],
        "edges": [
            {
                **{k: val for k, val in d.items() if k not in ("_src", "_tgt", "source", "target")},
                "source": d.get("_src", u),
                "target": d.get("_tgt", v),
            }
            for u, v, d in G.edges(data=True)
        ],
        "hyperedges": list(G.graph.get("hyperedges", [])),
        "input_tokens": int(new_extraction.get("input_tokens", 0) or 0),
        "output_tokens": int(new_extraction.get("output_tokens", 0) or 0),
    }

    # replace-on-re-extract puede dejar aislados nodos cuyas unicas aristas
    # venian del documento re-extraido. Rescatamos solo esas aristas previas
    # (mismos ids, ya extraidas de los mismos docs) para no perder conocimiento
    # ni crear huerfanos; no se anaden aristas nuevas/inventadas.
    rescued = 0
    prev_path = out / ".graphify_prev.json"
    if prev_path.is_file() and not bool(getattr(args, "no_rescue", False)):
        prev = _read_json(prev_path)
        node_ids = {n["id"] for n in merged_out["nodes"]}
        degree = Counter()
        existing_pairs: set[tuple[str, str]] = set()
        for edge in merged_out["edges"]:
            s, t = edge.get("source"), edge.get("target")
            if not s or not t:
                continue
            degree[s] += 1
            degree[t] += 1
            existing_pairs.add((s, t) if s <= t else (t, s))
        orphans = {nid for nid in node_ids if degree[nid] == 0}
        for link in prev.get("links", []):
            s, t = link.get("source"), link.get("target")
            if not s or not t or s not in node_ids or t not in node_ids:
                continue
            if s not in orphans and t not in orphans:
                continue
            key = (s, t) if s <= t else (t, s)
            if key in existing_pairs:
                continue
            rescued_edge = {
                k: v
                for k, v in link.items()
                if k not in ("_src", "_tgt", "community", "community_name")
            }
            merged_out["edges"].append(rescued_edge)
            existing_pairs.add(key)
            degree[s] += 1
            degree[t] += 1
            rescued += 1
    if rescued:
        log(f"Rescatadas {rescued} aristas previas de nodos que quedaban aislados")
    _write_json(ext_path, merged_out)

    corpus_files = incremental.get("files", {})
    manifest_files = _stamped_manifest_files(
        corpus_files, new_extraction, root
    )
    dispatched = {
        f
        for cat, files in (incremental.get("new_files") or {}).items()
        if cat in SEMANTIC_CATEGORIES
        for f in files
    }
    stamped = {f for files in manifest_files.values() for f in files}
    cleared = dispatched - stamped
    scan_corpus = {f for files in corpus_files.values() for f in files}
    save_manifest(
        manifest_files,
        manifest_path=str(out / "manifest.json"),
        root=root,
        scan_corpus=scan_corpus,
        clear_semantic=cleared or None,
    )
    log(
        f"Merge incremental: {old_count} -> {G.number_of_nodes()} nodos, "
        f"{G.number_of_edges()} aristas, {len(merged_out['hyperedges'])} hiperaristas"
    )
    log(f"Extract fusionado escrito en {ext_path}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 6 - build + cluster + analyze + report + to_json + health
# --------------------------------------------------------------------------- #


def run_health(extraction: dict, *, root: Path, directed: bool) -> dict:
    from graphify.diagnostics import diagnose_extraction, format_diagnostic_report

    summary = diagnose_extraction(extraction, directed=directed, root=root)
    log(format_diagnostic_report(summary))
    flags = [
        f"{summary[k]} {label}"
        for k, label in (
            ("dangling_endpoint_edges", "dangling-endpoint edges"),
            ("missing_endpoint_edges", "missing-endpoint edges"),
            ("self_loop_edges", "self-loop edges"),
            ("directed_same_endpoint_collapsed_edges", "collapsed (directed) edges"),
            ("undirected_same_endpoint_collapsed_edges", "collapsed (undirected) edges"),
        )
        if summary.get(k, 0)
    ]
    if flags:
        warn(
            "GRAPH HEALTH WARNING: " + "; ".join(flags) + " - el grafo puede estar "
            "incompleto/corrupto."
        )
    else:
        log("Salud del grafo: OK (sin aristas colgantes/huerfanas/colapsadas).")
    return summary


def cmd_build(args: argparse.Namespace) -> int:
    from graphify.analyze import god_nodes, suggest_questions, surprising_connections
    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.export import to_json
    from graphify.report import generate

    root = get_root(args)
    out = require_out(root)
    directed = bool(getattr(args, "directed", False))

    extract_path = out / ".graphify_extract.json"
    if not extract_path.is_file():
        return die(f"falta {extract_path.name}; ejecuta antes `combine`.")
    extraction = _read_json(extract_path)
    detection = _load_detect(out)

    # root= absoluto del PROYECTO, igual que el runbook (#1361): source_file se
    # relativiza contra la raiz del proyecto (docs/00-BRIEF.md -> docs_00_brief).
    G = build_from_json(extraction, root=root, directed=directed)
    if G.number_of_nodes() == 0:
        return die(
            "el grafo quedo vacio (la extraccion no produjo nodos). No se "
            "sobrescriben graph.json ni GRAPH_REPORT.md."
        )

    communities = cluster(G)
    cohesion = score_all(G, communities)
    tokens = {
        "input": int(extraction.get("input_tokens", 0) or 0),
        "output": int(extraction.get("output_tokens", 0) or 0),
    }
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    labels = {cid: f"Community {cid}" for cid in communities}
    questions = suggest_questions(G, communities, labels)

    graph_path = out / "graph.json"
    # Guard anti-shrink (#479): to_json devuelve False y no escribe si el grafo
    # nuevo tiene menos nodos que graph.json existente. --force lo salta.
    wrote = to_json(
        G, communities, str(graph_path), force=bool(getattr(args, "force", False))
    )
    if not wrote:
        return die(
            "graphify rechazo sobrescribir graph.json porque el grafo nuevo es "
            "menor (guard anti-shrink #479). Revisa la extraccion o usa --force "
            "solo si la reduccion es intencional."
        )

    report = generate(
        G,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detection,
        tokens,
        str(root),
        suggested_questions=questions,
    )
    _write_text(out / "GRAPH_REPORT.md", report)

    analysis = {
        "communities": {str(k): v for k, v in communities.items()},
        "cohesion": {str(k): v for k, v in cohesion.items()},
        "gods": gods,
        "surprises": surprises,
        "questions": questions,
    }
    _write_json(out / ".graphify_analysis.json", analysis)
    log(
        f"Grafo: {G.number_of_nodes()} nodos, {G.number_of_edges()} aristas, "
        f"{len(communities)} comunidades"
    )
    log(f"graph.json y GRAPH_REPORT.md actualizados en {out}")

    # Paso 4.5: diagnostico de salud (solo lectura, nunca aborta).
    log("")
    health = run_health(extraction, root=root, directed=directed)
    _write_json(out / ".graphify_health.json", health)
    return 0


def cmd_health(args: argparse.Namespace) -> int:
    root = get_root(args)
    out = require_out(root)
    extraction = _read_json(out / ".graphify_extract.json")
    health = run_health(
        extraction,
        root=root,
        directed=bool(getattr(args, "directed", False)),
    )
    _write_json(out / ".graphify_health.json", health)
    return 0


# --------------------------------------------------------------------------- #
# Fase 7 - etiquetado de comunidades + informe final
# --------------------------------------------------------------------------- #


def _parse_labels_arg(raw: str) -> dict[int, str]:
    labels: dict[int, str] = {}
    text = raw.strip()
    if not text:
        return labels
    separator = ";" if ";" in text else ","
    for part in text.split(separator):
        part = part.strip()
        if not part or "=" not in part:
            continue
        key, value = part.split("=", 1)
        labels[int(key.strip())] = value.strip()
    return labels


def _load_saved_labels(out: Path) -> dict[int, str]:
    """Etiquetas guardadas en graphify-out/.graphify_labels.json (ids previos)."""
    labels: dict[int, str] = {}
    saved = out / ".graphify_labels.json"
    if saved.is_file():
        data = _read_json(saved)
        labels.update({int(k): str(v) for k, v in data.items()})
        log(f"Etiquetas previas cargadas de {saved.name}")
    return labels


def _load_explicit_labels(args: argparse.Namespace) -> dict[int, str]:
    """Etiquetas dadas por CLI (--labels/--labels-file) como override."""
    labels: dict[int, str] = {}
    custom_file = getattr(args, "labels_file", None)
    if custom_file:
        data = _read_json(Path(custom_file))
        labels.update({int(k): str(v) for k, v in data.items()})
    raw = getattr(args, "labels", None)
    if raw:
        labels.update(_parse_labels_arg(raw))
    return labels


def cmd_label(args: argparse.Namespace) -> int:
    from graphify.analyze import suggest_questions
    from graphify.build import build_from_json
    from graphify.cluster import label_communities_by_hub
    from graphify.export import to_json
    from graphify.report import generate

    root = get_root(args)
    out = require_out(root)
    directed = bool(getattr(args, "directed", False))

    extraction = _read_json(out / ".graphify_extract.json")
    detection = _load_detect(out)
    analysis_path = out / ".graphify_analysis.json"
    if not analysis_path.is_file():
        return die(f"falta {analysis_path.name}; ejecuta antes `build`.")
    analysis = _read_json(analysis_path)

    G = build_from_json(extraction, root=root, directed=directed)
    communities_new = {int(k): v for k, v in analysis["communities"].items()}
    cohesion = {int(k): v for k, v in analysis["cohesion"].items()}
    communities = communities_new

    # Update incremental: conserva los ids de comunidad (y sus etiquetas)
    # remapeando el clustering nuevo por solapamiento con el grafo previo.
    mapping: dict[int, int] = {}
    prev_path = out / ".graphify_prev.json"
    if prev_path.is_file():
        from graphify.cluster import remap_communities_to_previous

        prev = _read_json(prev_path)
        prev_map = {
            n["id"]: int(n["community"])
            for n in prev.get("nodes", [])
            if isinstance(n, dict) and n.get("community") is not None
        }
        if prev_map:
            remapped = remap_communities_to_previous(communities_new, prev_map)
            by_members = {frozenset(v): cid for cid, v in remapped.items()}
            mapping = {
                cid: by_members[frozenset(members)]
                for cid, members in communities_new.items()
                if frozenset(members) in by_members
            }
            communities = remapped
            cohesion = {
                mapping[cid]: score for cid, score in cohesion.items() if cid in mapping
            }
            log(
                f"Comunidades remapeadas a ids previos: "
                f"{len(mapping)}/{len(communities_new)} coincidencias"
            )

    labels = _load_saved_labels(out)
    # Solo heredan etiqueta las comunidades que existian antes (ids remapeados
    # a un id previo); las nuevas se nombran con --labels/--auto.
    if mapping:
        previous_ids = set(mapping.values())
        labels = {cid: name for cid, name in labels.items() if cid in previous_ids}
    labels.update(_load_explicit_labels(args))
    if bool(getattr(args, "auto", False)):
        hub_labels = label_communities_by_hub(G, communities)
        for cid, name in hub_labels.items():
            labels.setdefault(cid, name)

    missing = [cid for cid in communities if cid not in labels]
    for cid in missing:
        labels[cid] = f"Community {cid}"
    if missing and not getattr(args, "auto", False):
        warn(
            f"{len(missing)} comunidad(es) sin etiqueta propia usan 'Community N'; "
            "pasa --labels \"0=Nombre;1=Otro\" o --auto."
        )
    # Sin etiquetas huerfanas: solo comunidades que existen en este clustering.
    labels = {cid: name for cid, name in labels.items() if cid in communities}

    tokens = {
        "input": int(extraction.get("input_tokens", 0) or 0),
        "output": int(extraction.get("output_tokens", 0) or 0),
    }
    # El analisis se reescribe con los ids remapeados para que html y futuras
    # actualizaciones lean las mismas comunidades que graph.json/GRAPH_REPORT.
    analysis["communities"] = {str(k): v for k, v in communities.items()}
    analysis["cohesion"] = {str(k): float(v) for k, v in cohesion.items()}

    questions = suggest_questions(G, communities, labels)
    report = generate(
        G,
        communities,
        cohesion,
        labels,
        analysis["gods"],
        analysis["surprises"],
        detection,
        tokens,
        str(root),
        suggested_questions=questions,
    )
    _write_text(out / "GRAPH_REPORT.md", report)
    _write_json(out / ".graphify_labels.json", {str(k): v for k, v in labels.items()})

    wrote = to_json(
        G,
        communities,
        str(out / "graph.json"),
        force=bool(getattr(args, "force", False)),
        community_labels=labels,
    )
    if not wrote:
        return die(
            "graphify rechazo reescribir graph.json (guard anti-shrink #479). "
            "No se forzo la escritura."
        )

    analysis["questions"] = questions
    _write_json(analysis_path, analysis)

    log(f"Informe final regenerado con {len(labels)} etiquetas:")
    for cid in sorted(communities):
        log(f"  [{cid}] {labels[cid]} ({len(communities[cid])} nodos)")
    log(f"GRAPH_REPORT.md y graph.json reexportados en {out}")
    return 0


# --------------------------------------------------------------------------- #
# Fase 8 - export HTML
# --------------------------------------------------------------------------- #


def cmd_html(args: argparse.Namespace) -> int:
    from graphify.export import to_html
    from graphify.paths import load_node_link_graph

    root = get_root(args)
    out = require_out(root)
    graph_path = out / "graph.json"
    if not graph_path.is_file():
        return die(f"falta {graph_path.name}; ejecuta antes `build`.")

    G = load_node_link_graph(graph_path)

    communities: dict[int, list[str]] = {}
    analysis_path = out / ".graphify_analysis.json"
    if analysis_path.is_file():
        analysis = _read_json(analysis_path)
        communities = {
            int(k): v for k, v in (analysis.get("communities") or {}).items()
        }
    if not communities:
        # Fallback: atributo `community` que escribe to_json en cada nodo.
        for node_id, attrs in G.nodes(data=True):
            cid = attrs.get("community")
            if cid is not None:
                communities.setdefault(int(cid), []).append(node_id)

    labels: dict[int, str] = {}
    labels_path = out / ".graphify_labels.json"
    if labels_path.is_file():
        labels = {int(k): str(v) for k, v in _read_json(labels_path).items()}
    if not labels:
        for cid, members in communities.items():
            name = None
            for node_id in members:
                name = G.nodes[node_id].get("community_name")
                if name:
                    break
            labels[cid] = str(name) if name else f"Community {cid}"

    html_path = out / "graph.html"
    ok = to_html(
        G,
        communities,
        str(html_path),
        community_labels=labels,
        node_limit=getattr(args, "node_limit", None),
    )
    if not ok:
        return die(f"to_html no escribio {html_path}")
    log(
        f"HTML exportado en {html_path} "
        f"({G.number_of_nodes()} nodos, {len(communities)} comunidades)"
    )
    if G.number_of_nodes() > 5000:
        warn("grafo con >5000 nodos: la visualizacion puede ser pesada.")
    return 0


# --------------------------------------------------------------------------- #
# Fase 9 - manifest + cost.json
# --------------------------------------------------------------------------- #


def cmd_manifest(args: argparse.Namespace) -> int:
    from graphify.cli import _stamped_manifest_files
    from graphify.detect import save_manifest

    root = get_root(args)
    out = require_out(root)

    detect_path = out / ".graphify_detect.json"
    extract_path = out / ".graphify_extract.json"
    if not detect_path.is_file():
        return die(f"falta {detect_path.name}; no se puede guardar manifest.")
    if not extract_path.is_file():
        return die(f"falta {extract_path.name}; no se puede guardar manifest.")
    detection = _read_json(detect_path)
    extraction = _read_json(extract_path)

    corpus_files = detection.get("all_files") or detection.get("files", {})

    partial_path = out / ".graphify_partial.txt"
    partial = set()
    if partial_path.is_file():
        partial = {
            line.strip()
            for line in _read_text(partial_path).splitlines()
            if line.strip()
        }

    manifest_files = _stamped_manifest_files(
        corpus_files, extraction, root, partial_source_files=partial
    )

    # Los ficheros semanticos despachados que no quedaron sellados conservan un
    # semantic_hash viejo: se limpia para que --update los reencole (#1948).
    sem_types = SEMANTIC_CATEGORIES
    dispatched = {
        f
        for cat, files in detection.get("files", {}).items()
        if cat in sem_types
        for f in files
    }
    stamped = {f for files in manifest_files.values() for f in files}
    cleared = dispatched - stamped

    scan_corpus = {f for files in corpus_files.values() for f in files}
    save_manifest(
        manifest_files,
        manifest_path=str(out / "manifest.json"),
        root=root,
        scan_corpus=scan_corpus,
        clear_semantic=cleared or None,
    )
    log(f"Manifest escrito en {out / 'manifest.json'}")
    log(
        f"  {len(manifest_files)} tipos, {len(stamped)} archivos sellados, "
        f"{len(cleared)} sin sellar (parciales/fallidos)"
    )

    # Contador acumulado de tokens.
    input_tok = int(extraction.get("input_tokens", 0) or 0)
    output_tok = int(extraction.get("output_tokens", 0) or 0)
    cost_path = out / "cost.json"
    if cost_path.is_file():
        try:
            cost = _read_json(cost_path)
        except (OSError, ValueError):
            cost = {"runs": [], "total_input_tokens": 0, "total_output_tokens": 0}
    else:
        cost = {"runs": [], "total_input_tokens": 0, "total_output_tokens": 0}
    cost.setdefault("runs", [])
    cost.setdefault("total_input_tokens", 0)
    cost.setdefault("total_output_tokens", 0)
    cost["runs"].append(
        {
            "date": datetime.now(timezone.utc).isoformat(),
            "input_tokens": input_tok,
            "output_tokens": output_tok,
            "files": detection.get("total_files", 0),
        }
    )
    cost["total_input_tokens"] += input_tok
    cost["total_output_tokens"] += output_tok
    _write_json(cost_path, cost)
    log(
        f"Tokens de esta corrida: {input_tok:,} in / {output_tok:,} out · "
        f"acumulado: {cost['total_input_tokens']:,} in / "
        f"{cost['total_output_tokens']:,} out ({len(cost['runs'])} corridas)"
    )

    if bool(getattr(args, "clean", False)):
        cleaned = []
        for name in (
            ".graphify_detect.json",
            ".graphify_extract.json",
            ".graphify_ast.json",
            ".graphify_semantic.json",
            ".graphify_analysis.json",
            ".graphify_partial.txt",
            ".graphify_uncached.txt",
            ".graphify_cached.json",
            ".graphify_semantic_new.json",
            ".needs_update",
        ):
            p = out / name
            if p.is_file():
                p.unlink()
                cleaned.append(name)
        for p in out.glob(CHUNK_GLOB):
            p.unlink()
            cleaned.append(p.name)
        log(f"Temporales eliminados: {', '.join(cleaned) if cleaned else 'ninguno'}")
    return 0


# --------------------------------------------------------------------------- #
# all - atajo para pipelines ya preparados
# --------------------------------------------------------------------------- #


def cmd_all(args: argparse.Namespace) -> int:
    steps = [("detect", cmd_detect), ("ast", cmd_ast), ("cache", cmd_cache)]
    for name, fn in steps:
        log(f"=== {name} ===")
        code = fn(args)
        if code:
            return code
    semantic_path = out_dir(get_root(args)) / ".graphify_semantic.json"
    if not semantic_path.is_file():
        log("")
        log(
            "Fase semantica pendiente: despacha los subagentes con la lista de "
            ".graphify_uncached.txt y luego ejecuta `semantic`, `combine`, "
            "`build`, `label`, `html`, `manifest`."
        )
        return 0
    for name, fn in (("combine", cmd_combine), ("build", cmd_build)):
        log(f"=== {name} ===")
        code = fn(args)
        if code:
            return code
    log("")
    log("Pipeline base completo: sigue `label`, `html` y `manifest`.")
    return 0


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def build_parser() -> argparse.ArgumentParser:
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument(
        "--root",
        default=argparse.SUPPRESS,
        help="Raiz del proyecto (default: directorio padre de tools/)",
    )
    shared.add_argument(
        "--corpus",
        default=argparse.SUPPRESS,
        help="Raiz escaneada (default: <root>/docs si existe, si no <root>)",
    )

    parser = argparse.ArgumentParser(
        prog="graphify_run.py",
        description=(
            "Pipeline Graphify por fases para el corpus de VentasCatalogo "
            "(sin CLI graphify.exe, sin bash/heredocs)."
        ),
        epilog="Consulta el docstring del modulo para el orden de las fases.",
    )
    parser.add_argument(
        "--root",
        default=None,
        help="Raiz del proyecto (default: directorio padre de tools/)",
    )
    parser.add_argument(
        "--corpus",
        default=None,
        help="Raiz escaneada (default: <root>/docs si existe, si no <root>)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add(name: str, help_text: str, fn) -> argparse.ArgumentParser:
        p = sub.add_parser(name, help=help_text, parents=[shared])
        p.set_defaults(func=fn)
        return p

    p = add("init", "crea graphify-out/ y los marcadores del runbook", cmd_init)
    p.add_argument("--force", action="store_true", help="reescribe los marcadores")

    add("status", "inventario de artefactos y conteos", cmd_status)
    add("detect", "escanea el corpus -> .graphify_detect.json", cmd_detect)
    add("ast", "Parte A: extraccion AST (vacia sin codigo)", cmd_ast)

    p = add(
        "cache",
        "Parte B0: cache semantica -> .graphify_cached.json + .graphify_uncached.txt",
        cmd_cache,
    )
    p.add_argument("--spec", default=None, help="ruta a extraction-spec.md")

    p = add(
        "semantic",
        "Parte B3: chunks de subagentes -> cobertura + cache + .graphify_semantic.json",
        cmd_semantic,
    )
    p.add_argument(
        "--pattern",
        default=CHUNK_GLOB,
        help=f"glob de chunks dentro de graphify-out/ (default: {CHUNK_GLOB})",
    )
    p.add_argument(
        "--expect",
        type=int,
        default=None,
        help="numero de chunks esperados (avisa si faltan)",
    )
    p.add_argument("--spec", default=None, help="ruta a extraction-spec.md")
    p.add_argument(
        "--no-coverage",
        action="store_true",
        help="no verificar lineas leidas por los subagentes",
    )
    p.add_argument(
        "--allow-empty",
        action="store_true",
        help="permite escribir una extraccion semantica vacia",
    )

    p = add("combine", "Parte C: merge AST + semantica -> .graphify_extract.json", cmd_combine)
    p.add_argument(
        "--allow-empty",
        action="store_true",
        help="permite combinar sin .graphify_semantic.json (corpus solo-codigo)",
    )

    add(
        "update-detect",
        "update incremental: detecta solo docs nuevos/cambiados (manifest)",
        cmd_update_detect,
    )

    p = add(
        "merge-update",
        "update incremental: build_merge conserva el grafo y reemplaza lo cambiado",
        cmd_merge_update,
    )
    p.add_argument("--directed", action="store_true", help="construye un DiGraph")
    p.add_argument(
        "--no-rescue",
        action="store_true",
        help="no restaurar aristas previas de nodos que quedarian aislados",
    )

    p = add("build", "build/cluster/analyze/report/to_json + salud del grafo", cmd_build)
    p.add_argument("--directed", action="store_true", help="construye un DiGraph")
    p.add_argument(
        "--force",
        action="store_true",
        help="permite sobrescribir graph.json aunque encoja (guard #479)",
    )

    p = add("health", "diagnostico de salud sobre .graphify_extract.json", cmd_health)
    p.add_argument("--directed", action="store_true", help="simula grafo dirigido")

    p = add("label", "etiqueta comunidades y regenera el informe final", cmd_label)
    p.add_argument(
        "--labels",
        default=None,
        help='etiquetas "0=Nombre;1=Otro" (separador ; o ,)',
    )
    p.add_argument("--labels-file", default=None, help="JSON {cid: nombre}")
    p.add_argument(
        "--auto",
        action="store_true",
        help="etiqueta automatica por nodo hub (sin LLM) como base",
    )
    p.add_argument("--directed", action="store_true", help="construye un DiGraph")
    p.add_argument("--force", action="store_true", help="salta el guard anti-shrink")

    p = add("html", "exporta graph.html interactivo", cmd_html)
    p.add_argument(
        "--node-limit", type=int, default=None, help="limite de nodos dibujados"
    )

    p = add("manifest", "manifest.json + cost.json (y limpieza opcional)", cmd_manifest)
    p.add_argument(
        "--clean",
        action="store_true",
        help="borra los temporales .graphify_* como el paso 9 del runbook",
    )

    add("all", "detect+ast+cache (+combine+build si ya hay semantica)", cmd_all)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    _configure_stdio()
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except FileNotFoundError as exc:
        return die(str(exc))
    except Exception:  # noqa: BLE001 - queremos el traceback para depurar
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
