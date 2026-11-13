---
title: Importar un catálogo desde un link
tipo: guia
estado: implementado
version: 1.0
fecha: 2026-11-10
idioma: es-CR
---

# Importar un catálogo desde un link

La pantalla **Panel → Catálogos → Importar** permite cargar el catálogo sin subir un archivo:
pegando el link de un archivo o de una carpeta pública de Google Drive, o una URL directa.

## Cómo se usa

1. Entrá a **Catálogos → Importar**.
2. En la sección **«…o cargar desde un link»** pegá el link, por ejemplo:
   `https://drive.google.com/drive/folders/1oWZlZtqsS4Lk3Typy_lmdKnvpxF63-Y-`
3. Tocá **Explorar link**.
   - Si es un archivo, queda seleccionado.
   - Si es una carpeta, aparece la lista de archivos y subcarpetas. Elegí un archivo o
     **Abrir esa carpeta** para entrar a una subcarpeta.
4. Tocá **Analizar con IA** para ver la propuesta de mapeo.
5. Revisá el mapeo/opciones y tocá **Importar** (o **Analizar** seguido de **Importar**).

## Qué soporta

- **Carpeta pública de Drive**: se lista con `embeddedfolderview` (un nivel). Las subcarpetas
  se pueden abrir desde la misma pantalla.
- **Archivo de Drive**: links `/file/d/<id>/…` u `open?id=…`.
- **URL directa** a un archivo: `.xlsx`, `.xls`, `.ods`, `.csv`, `.tsv`, `.txt`, `.json`,
  `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`.
- Límite de **300 MB** por archivo (configurable con `IMPORT_MAX_MB`).
- Los formatos se procesan con el mismo pipeline que un archivo subido (heurística + IA,
  plantillas, OCR para PDF/imágenes).

## Requisitos del link

- El archivo o la carpeta deben estar compartidos como **«cualquiera con el enlace»**.
  Si Drive devuelve una página de login, la API responde con un mensaje claro.
- Solo se permiten URLs `http(s)` públicas: se bloquean `localhost`, redes privadas,
  `169.254.*` (metadata) y hosts `.local`/`.internal`.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| `POST` | `/api/v1/catalogs/{catalogId}/imports/link/list` | Lista archivos/subcarpetas del link |
| `POST` | `/api/v1/catalogs/{catalogId}/imports/from-link/preview` | Analiza el archivo apuntado |
| `POST` | `/api/v1/catalogs/{catalogId}/imports/from-link` | Importa el archivo apuntado |

Cuerpo JSON:

```json
{
  "url": "https://drive.google.com/drive/folders/<id>",
  "fileUrl": "https://drive.usercontent.google.com/download?id=<id>&export=download&confirm=t",
  "name": "catalogo.xlsx",
  "currency": "CRC",
  "taxRateBp": 1300,
  "mapping": { "sku": "Código", "name": "Producto" }
}
```

`fileUrl` es el archivo elegido de la lista; si se omite, se usa el primer archivo de la
carpeta. Las opciones (`currency`, `taxRateBp`, `taxIncluded`, `mapping`, `extraFields`,
`mode`, `saveTemplate`, `templateName`, `useAgent`) son las mismas de la importación multipart.

## Implementación

- `apps/api/src/modules/catalogs/import/remote-source.ts`: detección de links de Drive,
  listado de carpetas, descarga con límite de tamaño y validación anti-SSRF.
- `apps/api/src/modules/catalogs/imports.controller.ts`: endpoints `link/list`,
  `from-link/preview` y `from-link` (convierten el link en un archivo y reutilizan
  `ImportsService`/`AdaptiveImportService`).
- `apps/web/src/components/backoffice/import-panel.tsx`: sección «…o cargar desde un link».
- Tests: `apps/api/src/modules/catalogs/import/remote-source.spec.ts` (14 casos).

## Limitaciones conocidas

- Solo carpetas **públicas**; no usa OAuth ni la API oficial de Drive.
- Se lista **un nivel** por vez (las subcarpetas se abren con «Abrir esa carpeta»).
- Una carpeta con muchas imágenes (por ejemplo, fotos de productos) se importa de a un
  archivo; la importación masiva de imágenes como productos no está incluida.

## Catálogo principal con subcarpetas (marcas)

El panel **«Cargar todas las carpetas de Drive como catálogos»** crea **un solo catálogo**
(nombre que escribe el usuario) y carga cada subcarpeta **dentro de ese catálogo** como
subcarpeta interna:

- Cada carpeta se importa en modo **MERGE**: sus productos se agregan a la versión activa
  del catálogo principal (no se crean catálogos separados).
- La **categoría** de cada producto es el nombre de la carpeta/marca.
- La pantalla de detalle del catálogo muestra la sección **«Subcarpetas del catálogo»** con
  tarjetas (marca + cantidad de productos). Al hacer clic se abre
  `/panel/productos?catalogo=<id>&categoria=<marca>` filtrado; también hay «Ver todos».
- Endpoint de apoyo: `GET /api/v1/catalogs/{id}/subcatalogs` → `[{ name, count }]`.
- Las imágenes se cargan como productos con precio provisional `1.00` y la marca como
  categoría; el catálogo se publica automáticamente al tener productos.

> Los catálogos sueltos creados con la versión anterior (uno por carpeta) se pueden eliminar
> desde Catálogos; el flujo nuevo ya no los separa.
