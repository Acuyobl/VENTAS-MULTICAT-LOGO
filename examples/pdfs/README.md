# PDFs de ejemplo

Diez documentos PDF públicos de distintos temas, descargados para probar el importador y el OCR.
Todos son PDFs válidos de menos de 10 MB (límite de importación) y están en esta carpeta.

| Archivo | Tipo | Páginas | Tamaño | Fuente | Para probar |
|---|---|---:|---:|---|---|
| `01-catalogo-patlite.pdf` | Texto | 2 | 0,9 MB | [PATLITE · catálogo O-BJ04](https://www.patlite.com/_inc_data/webcatalog_file/O-BJ04_LPT_EN.pdf) | Catálogo técnico con tablas de productos |
| `02-catalogo-productos.pdf` | Texto | 83 | 3,6 MB | [USCG UDC Product Catalogue · Wikimedia Commons](https://commons.wikimedia.org/wiki/File:USCG_UDC_Product_Catalogue.pdf) | Catálogo de productos extenso |
| `03-menu-restaurante.pdf` | Texto | 3 | 1,3 MB | [Antoine's Restaurant Menu, 1920s · Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Antoine%27s_Restaurant_Menu_New_Orleans_1920s.pdf) | Menú histórico (precios y platos) |
| `04-factura.pdf` | Texto | 1 | 72 KB | [W3C UBL Joinery Invoice · test data](https://www.w3.org/XML/Binary/2005/03/test-data/UBL-1.0/fs/Invoice/pdf/JoineryInvoice.Example-a4.pdf) | Factura con líneas, impuestos y totales |
| `05-formulario-irs-w9.pdf` | Texto | 6 | 141 KB | [IRS Form W-9](https://www.irs.gov/pub/irs-pdf/fw9.pdf) | Formulario oficial con campos |
| `06-datasheet-raspberrypi.pdf` | Texto | 13 | 413 KB | [Raspberry Pi 4 datasheet](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf) | Ficha técnica con especificaciones |
| `07-informe-cientifico.pdf` | Texto | 15 | 2,2 MB | [arXiv 1706.03762](https://arxiv.org/pdf/1706.03762) | Informe/paper científico |
| `08-escaneado-corte.pdf` | **Escaneado** | 1 | 70 KB | [Allahabad High Court · digital scan](https://dc.allahabadhighcourt.in/assets/documents/digitally_scan_files/UP06288/UP06288_4_18_N_0.pdf) | PDF sin texto → prueba de OCR |
| `09-escaneado-carta.pdf` | **Escaneado** | 3 | 860 KB | [Archive.org · scanned letter](https://archive.org/download/0-2023-09-11-scan-va-rsso-case-286816-letter-arrived-feb-13-2023) | PDF escaneado con imágenes |
| `10-escaneado-examen.pdf` | **Escaneado** | 6 | 73 KB | [MarkUs · scanned exams](https://github.com/MarkUsProject/Markus/tree/master/db/data/scanned_exams) | Examen escaneado (6 páginas) |

> Los archivos 08–10 no tienen capa de texto: el importador los detecta como PDF escaneado y usa
> OCR. Para OCR real, la API debe correr con `OCR_PROVIDER=tesseract`; con `mock` devuelve texto de
> ejemplo (sirve para tests).

## Cómo probarlos

1. `app.localhost:3010/panel/catalogos` → **Cargar catálogo**.
2. Subí un PDF de la tabla → **Analizar** → revisá el mapeo propuesto → **Importar**.
3. Los PDF de texto suelen traer varias columnas y filas; el agente propone el mapeo.
4. Los escaneados pasan por OCR y también se importan como productos.

También se pueden importar por API (requiere la cookie `vc_staff_at`):

```powershell
curl -F "file=@examples/pdfs/04-factura.pdf;type=application/pdf" `
     -H "Cookie: vc_staff_at=<token>" `
     http://localhost:3001/api/v1/catalogs/<catalogId>/imports/preview
```

## Origen y licencias

Son documentos **públicos** usados solo como ejemplos de prueba: catálogo y datasheet de fabricantes,
datos de prueba del W3C, formulario del IRS (dominio público), paper de arXiv, menú y catálogo de
Wikimedia Commons, y escaneos de un tribunal, Archive.org y un repositorio educativo. Respetá la
licencia de cada fuente si los reutilizás fuera de pruebas.

## Reproducir la descarga

```powershell
powershell -File examples/pdfs/download.ps1
```

El script descarga los 10 archivos desde las URLs de la tabla (sin credenciales).
