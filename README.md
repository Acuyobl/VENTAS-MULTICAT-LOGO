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
> Es la frase que guía el rediseño. Hoy **Excel/CSV, PDF con texto o escaneado, JSON, TSV, TXT,
> fotos (OCR) y hojas de pedido están disponibles**; WhatsApp como entrada se muestra «en camino».
> Ver [docs/11-POSICIONAMIENTO.md](docs/11-POSICIONAMIENTO.md).

> **Estado actual — v0.3.2 (2026-10-29)**: F0 cerrado; F1 completo (catálogo versionado,
> **importador universal** CSV/TSV/TXT/JSON/XLSX/XLS/ODS/PDF, **OCR de fotos y PDF escaneados**,
> **fotos incrustadas de Excel extraídas y vinculadas**, multi-hoja, tablas compuestas, renombrado,
> imágenes con maqueta SVG de respaldo, ventas, tienda, portal y PWA); F2 funcional (pagos
> sandbox/Stripe, links de pago, pagos manuales, reembolsos, recordatorios, reportes, conciliación,
> gastos y utilidad); F3 con contenido IA + imágenes (3 diseños y variación por
> plataforma/tono/objetivo), WhatsApp entrante/saliente, chat de staff y chat del cliente, **3 temas
> visuales** y **rediseño de UI**. Además: **7 catálogos de ejemplo en `catalogs/`** (incluidos
> **2 grandes de 50 productos con fotos reales**), **borrado con liberación de slug**, reporte
> financiero en PDF y endurecimiento de producción (cuota de IA, Resend, secretos de pasarela,
> `STORAGE_PUBLIC_URL`, outbox).
>
> **Calidad**: API **360 unit + 158 e2e**, web **19**; CI verde con cobertura (~1,1 MB).
>
> **Pendiente**: Google Drive, WhatsApp como **entrada** de catálogo, variantes talla/color,
> conciliación programada, publicación real en redes, UI de consumo de IA, onboarding/planes/
> facturación, credenciales reales de IA y pasarelas, blocklist `jti`/`sid` y umbrales de cobertura.
> Detalle en [`docs/08-ESTADO-F1.md`](docs/08-ESTADO-F1.md), [`docs/10-DEMO.md`](docs/10-DEMO.md),
> [`docs/11-POSICIONAMIENTO.md`](docs/11-POSICIONAMIENTO.md) e hitos en
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
| [`docs/07-ESTADO-IMPLEMENTACION.md`](docs/07-ESTADO-IMPLEMENTACION.md) | Bitácora de F0 (histórica) + actualización 2026-10-29 |
| [`docs/08-ESTADO-F1.md`](docs/08-ESTADO-F1.md) | Estado completo de F1/F2/F3: features, decisiones, endurecimiento y pendientes |
| [`docs/09-BOOTSTRAP.md`](docs/09-BOOTSTRAP.md) | Bootstrap medido (75,1 s en caliente) y riesgos del entorno |
| [`docs/10-DEMO.md`](docs/10-DEMO.md) | Guion de demo actualizado a v0.2.9 (dos caras, temas, chat, catálogos) |
| [`docs/11-POSICIONAMIENTO.md`](docs/11-POSICIONAMIENTO.md) | Frase norte «Subí tu catálogo como sea» y hoja de ruta para cumplirla |
| [`catalogs/`](catalogs/README.md) | 5 catálogos de ejemplo en CSV/XLSX (incluye hoja de pedido real con fotos) |
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
pnpm db:seed                         # 8 roles, usuarios demo y catálogo demo con 37 productos
pnpm --filter @ventascatalogo/api dev    # API en :3001 (Swagger en /api/docs)
pnpm --filter @ventascatalogo/web dev    # web en :3000 (en esta máquina :3010 con build de producción)
```

Catálogos de ejemplo: [`catalogs/`](catalogs/README.md) trae 5 archivos (CSV UTF-8, CSV
Windows-1252, XLSX con encabezados raros y una hoja de pedido real con fotos). Se cargan desde
`/panel/catalogos` → **Cargar catálogo**, o con:

```powershell
pnpm --filter @ventascatalogo/api exec node scripts/import-demo-catalogs.mjs   # requiere VC_COOKIE
pnpm --filter @ventascatalogo/api exec node scripts/import-sublimania.mjs       # catálogo real
```

Usuarios demo con `Demo1234!`: `admin@ventascatalogo.local` (org_admin, MFA obligatorio),
`cliente@ventascatalogo.local` (cliente) y `mixto@ventascatalogo.local` (staff y cliente a la vez).
En esta máquina el Postgres se publica en **55432** y la web de verificación usa **3010** porque
3000/5432/5433 están ocupados por otros procesos (ver `docs/07-ESTADO-IMPLEMENTACION.md` §2).

## Siguiente paso

1. **Entradas de catálogo**: PDF/OCR, foto/visión y WhatsApp de entrada (el motor de mapeo ya está).
2. **Google Drive** con credenciales OAuth de Google Cloud.
3. **Variantes** talla/color, conciliación programada y publicación real en redes.
4. **Producción**: onboarding/planes/facturación, despliegue con HTTPS/observabilidad y credenciales
   reales de IA/pasarelas.

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
