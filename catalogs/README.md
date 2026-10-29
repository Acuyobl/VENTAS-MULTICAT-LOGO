# Catálogos de demostración

Cuatro catálogos con fotos reales (Wikimedia Commons) y descripciones, en **formatos distintos**,
más un quinto catálogo convertido de una hoja de pedido real. Listos para cargar desde el
backoffice (`/panel/catalogos` → **Cargar catálogo**) o por API.

| # | Archivo | Catálogo | Formato | Moneda | Campos extra |
|---|---|---|---|---|---|
| 1 | `01-boutique-mar.csv` | Boutique Mar | CSV UTF-8 separado por coma | CRC | — |
| 2 | `02-ferreteria-central.xlsx` | Ferretería Central | XLSX con encabezados abreviados (`Código`, `Artículo`, `Cant.`) | CRC | `Medida`, `Material` |
| 3 | `03-despensa-organica.csv` | Despensa Orgánica | CSV **Windows-1252** separado por `;` | CRC | `Peso`, `Vencimiento` |
| 4 | `04-tecnohogar.xlsx` | TecnoHogar | XLSX con encabezados no estándar (`Ref`, `Descripción larga`, `Existencia`) | USD | `Modelo`, `Garantía (meses)` |
| 5 | `05-sublimania-cr.csv` | Sublimania CR | CSV convertido de una **hoja de pedido real**; fotos incrustadas como data URI | CRC | `Talla`, `Tela`, `Tipo`, `Cuello`, `Genero`, `Manga`, `Detalle`, `Urgencia` |

El catálogo 5 se generó con `tools/convert-sublimania.py` a partir de
`Pedido_27-10-2026_SUBLIMANIA_CR.xlsx`: toma las filas de pedido (CAMISA como producto,
COSTO como costo y precio sugerido ×1.5), extrae las fotos de la hoja «Imagenes» y las embebe
como `data:image/...;base64` para que el importador las suba a MinIO.

## Cómo cargarlos

1. `app.localhost:3010` → **Catálogos** → **Cargar catálogo**.
2. Elegí **Catálogo nuevo** (ponele nombre) o **Catálogo existente** (reemplazar/actualizar).
3. Subí el archivo y pulsá **Analizar con IA**: propone mapeo, campos extra y columnas ignoradas.
4. Confirmá el plan y el modo:
   - **Reemplazar**: el catálogo queda con lo del archivo (la versión anterior se archiva).
   - **Fusionar**: conserva los productos que no vienen en el archivo.
5. Si querés quitar el catálogo anterior, la pantalla ofrece **eliminarlo** (pide confirmación y
   falla si tiene pedidos abiertos).

La importación descarga las fotos a MinIO y crea una versión activable.

## Regenerar

```bash
pnpm --filter @ventascatalogo/api exec node scripts/generate-catalogs.mjs
```

El script vuelve a buscar imágenes, reescribe los archivos y actualiza `manifest.json`.
