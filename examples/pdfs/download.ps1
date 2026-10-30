# Descarga los 10 PDFs de ejemplo desde sus fuentes públicas.
# Uso: powershell -File examples/pdfs/download.ps1

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '.'
New-Item -ItemType Directory -Force -Path $out | Out-Null

$items = @(
  @{ name = '01-catalogo-patlite.pdf'; url = 'https://www.patlite.com/_inc_data/webcatalog_file/O-BJ04_LPT_EN.pdf' },
  @{ name = '02-catalogo-productos.pdf'; url = 'https://upload.wikimedia.org/wikipedia/commons/4/4a/USCG_UDC_Product_Catalogue.pdf' },
  @{ name = '03-menu-restaurante.pdf'; url = 'https://upload.wikimedia.org/wikipedia/commons/4/4f/Antoine%27s_Restaurant_Menu_New_Orleans_1920s.pdf' },
  @{ name = '04-factura.pdf'; url = 'https://www.w3.org/XML/Binary/2005/03/test-data/UBL-1.0/fs/Invoice/pdf/JoineryInvoice.Example-a4.pdf' },
  @{ name = '05-formulario-irs-w9.pdf'; url = 'https://www.irs.gov/pub/irs-pdf/fw9.pdf' },
  @{ name = '06-datasheet-raspberrypi.pdf'; url = 'https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf' },
  @{ name = '07-informe-cientifico.pdf'; url = 'https://arxiv.org/pdf/1706.03762' },
  @{ name = '08-escaneado-corte.pdf'; url = 'https://dc.allahabadhighcourt.in/assets/documents/digitally_scan_files/UP06288/UP06288_4_18_N_0.pdf' },
  @{ name = '09-escaneado-carta.pdf'; url = 'https://archive.org/download/0-2023-09-11-scan-va-rsso-case-286816-letter-arrived-feb-13-2023/0%202023-09-11%20scan%20VA%20RSSO%20Case%20286816%20letter%20arrived%20Feb%2013%202023.pdf' },
  @{ name = '10-escaneado-examen.pdf'; url = 'https://raw.githubusercontent.com/MarkUsProject/Markus/master/db/data/scanned_exams/midterm_scan_102.pdf' }
)

foreach ($item in $items) {
  $path = Join-Path $out $item.name
  Write-Host "Descargando $($item.name)…"
  curl.exe -sL --max-time 180 -A 'Mozilla/5.0 VentasCatalogoDemo/1.0' -o $path $item.url
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $isPdf = $bytes.Length -ge 5 -and [System.Text.Encoding]::ASCII.GetString($bytes, 0, 5).StartsWith('%PDF')
  if (-not $isPdf) { throw "No es un PDF válido: $($item.name)" }
  Write-Host ("  OK · {0:N0} bytes" -f $bytes.Length)
}

Write-Host 'Listo: 10 PDFs en examples/pdfs/'
