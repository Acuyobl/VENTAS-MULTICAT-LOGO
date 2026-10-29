---
title: VentasCatálogo
tipo: readme-raiz
estado: implementacion-f0
fecha: 2026-10-28
---

# VentasCatálogo

[![CI](https://github.com/Acuyobl/VENTAS-MULTICAT-LOGO/actions/workflows/ci.yml/badge.svg)](https://github.com/Acuyobl/VENTAS-MULTICAT-LOGO/actions/workflows/ci.yml)
[![Repo](https://img.shields.io/badge/repo-Acuyobl%2FVENTAS--MULTICAT--LOGO-2f6b4f)](https://github.com/Acuyobl/VENTAS-MULTICAT-LOGO)

Aplicación de ventas multicatálogo con IA: importa catálogos desde Excel/CSV (y próximamente Drive,
PDF, foto y WhatsApp), vende, cobra, lleva finanzas, atiende por WhatsApp y chat, y genera contenido
para redes sociales con IA. Cada catálogo es una unidad de negocio aislada. El producto tiene **dos
caras**: backoffice para administradores y colaboradores, y tienda/portal para los clientes.

> **«Subí tu catálogo como sea (Excel, PDF, foto, WhatsApp) y el agente lo convierte en un catálogo
> vendible, publicable y cobrable — sin que toques una columna.»**
>
> Es la frase que guía el rediseño. Hoy **Excel/CSV y hojas de pedido están disponibles**; PDF, foto
> y WhatsApp se muestran como «en camino» hasta tener el flujo completo. Ver
> [docs/11-POSICIONAMIENTO.md](docs/11-POSICIONAMIENTO.md).

> Estado actual: **F0 cerrado, F1 completo salvo Drive/PWA, F2 cerrado en lo funcional y F3 con
> contenido, WhatsApp y chat** — monorepo, auth de dos audiencias, RBAC, web biparte, versionado de
> catálogo, importación CSV/XLSX, imágenes, cotizaciones con PDF, pedidos, tienda con carrito,
> checkout de invitado, portal, **cobros (link de pago, Stripe/sandbox, webhook, pagos manuales),
> reembolsos con segregación configurable, recordatorios, reportes, conciliación, gastos, utilidad,
> exportación CSV y pasarelas por organización**, más **importador inteligente con IA (analiza
> cualquier archivo, propone el mapeo, guarda campos extra y permite reemplazar o fusionar el
> catálogo)**, **IA de contenido con imágenes basadas en la foto real del producto y 3 diseños
> configurables en Ajustes**, **WhatsApp entrante/saliente y chat**, **importación tolerante a
> codificaciones (UTF-8/Windows-1252) con guardia contra texto corrupto**, **PWA de la tienda,
> chat del cliente en el portal, borrado de catálogo, reporte financiero en PDF y E2E del DoD de
> F1**, **3 temas visuales de toda la app configurables en Ajustes (tipografía, tamaños, densidad,
> shell y orden de menús)**, **5 catálogos de ejemplo en `catalogs/` en formatos distintos (incluida
> una hoja de pedido real con fotos incrustadas) y pantalla “Cargar catálogo” con reemplazo/fusión y
> borrado confirmado**, con más de 490 pruebas automáticas. Pendiente: Drive, variantes, PDF/OCR,
> conciliación programada, campañas de WhatsApp, publicación real en redes, cuota de IA y
> credenciales reales. Detalle en
> [`docs/07-ESTADO-IMPLEMENTACION.md`](docs/07-ESTADO-IMPLEMENTACION.md),
> [`docs/08-ESTADO-F1.md`](docs/08-ESTADO-F1.md) e hitos en
> [`CHANGELOG.md`](CHANGELOG.md).

## Qué hay en esta carpeta

| Ruta | Contenido |
|---|---|
| [`apps/api`](apps/api/package.json) | Backend NestJS 11: auth de dos audiencias, usuarios/roles, catálogos, productos, health, auditoría y outbox |
| [`apps/web`](apps/web/package.json) | Next.js 15: backoffice `(backoffice)`, tienda `(tienda)`, portal `(portal)`, middleware por host y catálogo público `/c/[slug]` |
| [`packages/`](packages/contracts/package.json) | `contracts` (Zod + tipos compartidos), `ai` (proveedor y plantillas), `ui`, `config` |
| [`docs/`](docs/README.md) | **Empieza aquí**: análisis, especificación, guía de implementación, ideas y brief |
| [`docs/04-GUIA-IMPLEMENTACION.md`](docs/04-GUIA-IMPLEMENTACION.md) | Bootstrap, plan de 15 semanas, patrones de código, CI/CD y operación |
| [`docs/06-COSTOS-Y-PRECIOS.md`](docs/06-COSTOS-Y-PRECIOS.md) | Inversión de implementación (3 escenarios), año 1, precios, break-even y venta masiva |
| [`docs/07-ESTADO-IMPLEMENTACION.md`](docs/07-ESTADO-IMPLEMENTACION.md) | Bitácora de F0: qué está hecho, qué se verificó, defectos corregidos y pendientes |
| [`docs/08-ESTADO-F1.md`](docs/08-ESTADO-F1.md) | Incremento F1: versionado, importación CSV/XLSX, productos por versión y UI |
| [`tools/fixtures/`](tools/fixtures/catalogo-demo.csv) | Fixture de importación (42 filas: 37 válidas, 3 duplicadas, 2 sin precio) |
| [`infra/`](infra/postgres/init/01-extensions.sql) | Inicialización de Postgres (extensiones) y artefactos de despliegue |
| [`graphify-out/`](graphify-out/RESUMEN-GRAPHIFY.md) | Grafo de conocimiento del corpus: `graph.json`, informe, visualización HTML y consultas |
| `APLICACIÓN DE VENTAS MULTICATÁLOGO CON IA.txt` | Brief original del cliente (Windows-1252); versión legible en `docs/00-BRIEF.md` |

## Resumen del plan

- **Stack**: monolito modular NestJS 11 + Next.js 15 + PostgreSQL 16/Prisma + Redis/BullMQ,
  MinIO y Docker Compose. IA con proveedor abstracto (DeepSeek por defecto).
- **Dos caras**: `app.` (backoffice, `aud=staff`) y `tienda.` + `/mi-cuenta` (`aud=customer`),
  un solo backend y un solo modelo de permisos.
- **Módulo de usuarios**: identidad única con roles y permisos atómicos; el mismo usuario puede
  ser colaborador de una organización y cliente de otra.
- **Calendario**: 15 semanas con 1,5 dev (14 con 2 devs en F1–F3); Must 98,5 dp con buffer ≈14 dp.
- **Coste objetivo**: infra < USD 60/mes y < USD 30/mes de IA en el MVP (ver `docs/02-ANALISIS.md` §9).

## Arranque local

```powershell
docker compose up -d                 # Postgres, Redis, MinIO y Mailpit
pnpm install
pnpm db:migrate                      # aplica migraciones de Prisma
pnpm db:seed                         # 8 roles, 3 usuarios demo y catálogo de 12 productos
pnpm --filter @ventascatalogo/api dev    # API en :3001 (Swagger en /api/docs)
pnpm --filter @ventascatalogo/web dev    # web en :3000
```

Usuarios demo con `Demo1234!`: `admin@ventascatalogo.local` (org_admin, MFA obligatorio),
`cliente@ventascatalogo.local` (cliente) y `mixto@ventascatalogo.local` (staff y cliente a la vez).
En esta máquina el Postgres se publica en **55432** y la web de verificación usa **3010** porque
3000/5432/5433 están ocupados por otros procesos (ver `docs/07-ESTADO-IMPLEMENTACION.md` §2).

## Siguiente paso

1. Cerrar los pendientes de F0 (`docs/07-ESTADO-IMPLEMENTACION.md` §5): pruebas, CI, `/health/ready`
   con Redis caído, demo y tag `v0.1.0`.
2. Arrancar F1 según `docs/04-GUIA-IMPLEMENTACION.md` §4.2: OAuth de Google Drive, importación,
   versionado, catálogo público con carrito, cotizaciones y pedidos.

## Consultar el grafo de conocimiento

Grafo construido: **388 nodos · 606 aristas · 17 comunidades · 97 % aristas EXTRACTED / 3 %
INFERRED**, sobre 8 documentos y ~133.000 palabras (0 nodos huérfanos, salud OK).

```powershell
$py = "$env:APPDATA\uv\tools\graphifyy\Scripts\python.exe"
& $py -m graphify query "¿cómo se aplica el aislamiento por catálogo?" --graph graphify-out/graph.json
```

El ejecutable `graphify.exe` del PATH está bloqueado por Application Control en esta máquina;
usar el intérprete del venv de uv como arriba. Detalles en
[`graphify-out/RESUMEN-GRAPHIFY.md`](graphify-out/RESUMEN-GRAPHIFY.md).
