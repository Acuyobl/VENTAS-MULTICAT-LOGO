#!/usr/bin/env node
/* global fetch, console, process, Buffer, setTimeout */
// Genera 4 catálogos de demostración en formatos distintos dentro de /catalogs.
// Imágenes reales de Wikimedia Commons (licencias libres).
// Uso: pnpm --filter @ventascatalogo/api exec node scripts/generate-catalogs.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../catalogs');

const UA = 'VentasCatalogoDemo/1.0 (dev@ventascatalogo.local)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const CATALOGS = [
  {
    slug: 'boutique-mar',
    name: 'Boutique Mar',
    description:
      'Moda costera en lino y algodón: vestidos, camisas, calzado y accesorios tejidos. Formato CSV UTF-8.',
    file: '01-boutique-mar.csv',
    format: 'csv',
    currency: 'CRC',
    products: [
      ['VES-001', 'Vestido largo de lino', 'Vestido largo de lino fresco con botones de madera y bolsillos laterales. Ideal para clima de playa.', 'Vestidos', 'Mar', 28500, 17000, 12, 'linen dress'],
      ['BLS-002', 'Blusa de seda manga corta', 'Blusa fluida de seda con cuello redondo y caída suave. Disponible en tonos arena y coral.', 'Blusas', 'Mar', 22000, 13000, 18, 'silk blouse'],
      ['CAM-003', 'Camisa oversize de algodón', 'Camisa oversize de algodón orgánico, corte relajado y costuras reforzadas.', 'Camisas', 'Mar', 19500, 11000, 20, 'oversized shirt'],
      ['PAN-004', 'Pantalón wide leg', 'Pantalón de pierna ancha en viscosa, cintura elástica y caída fluida.', 'Pantalones', 'Mar', 24500, 15000, 14, 'wide leg pants'],
      ['SOM-005', 'Sombrero de paja tejido', 'Sombrero tejido a mano con cinta de algodón y ala media. Protección solar con estilo.', 'Accesorios', 'Mar', 12000, 6000, 25, 'straw hat'],
      ['SAN-006', 'Sandalias de cuero', 'Sandalias artesanales de cuero curtido, suela de goma y tiras ajustables.', 'Calzado', 'Mar', 27500, 16000, 10, 'leather sandals'],
      ['BOL-007', 'Bolso tejido de palma', 'Bolso de palma tejido a mano con forro interno y asa de cuero.', 'Accesorios', 'Mar', 18000, 9500, 16, 'woven bag'],
      ['PAR-008', 'Pareo de playa', 'Pareo de algodón ligero con estampado botánico, multiuso como falda o chal.', 'Accesorios', 'Mar', 9500, 5000, 30, 'beach sarong'],
    ],
  },
  {
    slug: 'ferreteria-central',
    name: 'Ferretería Central',
    description:
      'Herramientas y ferretería general para el hogar y el taller. Formato XLSX con encabezados abreviados y campos extra.',
    file: '02-ferreteria-central.xlsx',
    format: 'xlsx-ferreteria',
    currency: 'CRC',
    products: [
      ['FER-001', 'Taladro inalámbrico 20V', 'Taladro con batería de litio 20V, dos velocidades, luz LED y maletín.', 'Herramientas', 'Truper', 58900, 42000, 8, 'cordless drill', '20V', 'Metal y plástico'],
      ['FER-002', 'Martillo de uña 16 oz', 'Martillo de acero forjado con mango de fibra de vidrio antideslizante.', 'Carpintería', 'Truper', 8900, 5200, 15, 'claw hammer', '16 oz', 'Acero y fibra'],
      ['FER-003', 'Juego de destornilladores', 'Set de 6 destornilladores planos y Phillips con puntas imantadas.', 'Herramientas', 'Stanley', 12500, 7300, 12, 'screwdriver set', '6 piezas', 'Acero'],
      ['FER-004', 'Cinta métrica 5 m', 'Cinta métrica retráctil de 5 metros con freno y clip de cinturón.', 'Medición', 'Stanley', 4500, 2500, 30, 'tape measure', '5 m', 'Acero y plástico'],
      ['FER-005', 'Brocha de 3 pulgadas', 'Brocha de cerda natural para pintura base agua y aceite.', 'Pintura', 'Truper', 3200, 1800, 40, 'paint brush', '3 in', 'Cerda natural'],
      ['FER-006', 'Candado de acero', 'Candado de acero templado con arco protegido y dos llaves.', 'Seguridad', 'Master', 7600, 4400, 18, 'padlock', '50 mm', 'Acero'],
      ['FER-007', 'Linterna LED recargable', 'Linterna LED de alta potencia con batería recargable USB y base magnética.', 'Iluminación', 'Truper', 9900, 5600, 22, 'led flashlight', '—', 'Aluminio'],
      ['FER-008', 'Tornillos surtidos 200 piezas', 'Surtido de tornillos para madera y metal en caja organizadora.', 'Fijaciones', 'Genérico', 6800, 3900, 25, 'screws assortment', 'Surtido', 'Acero'],
    ],
  },
  {
    slug: 'despensa-organica',
    name: 'Despensa Orgánica',
    description:
      'Despensa artesanal: miel, café, chocolate, tés y granola. Formato CSV en Windows-1252 con punto y coma y campos de peso/vencimiento.',
    file: '03-despensa-organica.csv',
    format: 'csv-latin1',
    currency: 'CRC',
    products: [
      ['ORG-001', 'Miel de abeja 500 g', 'Miel pura de flores tropicales, cosecha del año, sin aditivos.', 'Miel', 'Doña Rosa', 7800, 4600, 30, 'honey jar', '500 g', '2027-06-30'],
      ['ORG-002', 'Café tostado 500 g', 'Café de altura tostado medio con notas de chocolate y naranja.', 'Café', 'Altura', 10500, 6600, 55, 'coffee beans', '500 g', '2027-03-15'],
      ['ORG-003', 'Chocolate 70 % cacao 100 g', 'Barra artesanal de cacao costarricense con 70 % cacao.', 'Chocolate', 'Selva Verde', 4500, 2600, 80, 'dark chocolate bar', '100 g', '2027-01-31'],
      ['ORG-004', 'Granola artesanal 400 g', 'Granola horneada con avena, miel, almendras y coco.', 'Cereales', 'Raíz', 5900, 3400, 24, 'granola', '400 g', '2026-12-31'],
      ['ORG-005', 'Té de manzanilla 50 g', 'Manzanilla seca de cultivo orgánico para infusión nocturna.', 'Tés', 'Selva Verde', 3200, 1800, 40, 'chamomile tea', '50 g', '2027-08-31'],
      ['ORG-006', 'Sal marina 500 g', 'Sal de cosecha artesanal de Guanacaste, sin refinar.', 'Especias', 'Raíz', 2900, 1500, 70, 'sea salt', '500 g', '2028-01-31'],
      ['ORG-007', 'Aceite de coco 250 ml', 'Aceite de coco virgen prensado en frío, ideal para cocina y cuidado.', 'Aceites', 'Selva Verde', 6900, 4100, 30, 'coconut oil jar', '250 ml', '2027-05-31'],
      ['ORG-008', 'Galletas de avena 200 g', 'Galletas horneadas con avena integral, miel y canela.', 'Repostería', 'Raíz', 3800, 2100, 60, 'oatmeal cookies', '200 g', '2027-02-28'],
    ],
  },
  {
    slug: 'tecnohogar',
    name: 'TecnoHogar',
    description:
      'Tecnología y hogar en dólares: audio, iluminación, accesorios de escritorio y relojes. Formato XLSX con encabezados no estándar.',
    file: '04-tecnohogar.xlsx',
    format: 'xlsx-tech',
    currency: 'USD',
    products: [
      ['TEC-001', 'Audífonos Bluetooth', 'Audífonos inalámbricos con cancelación de ruido y estuche de carga.', 'Audio', 'AuraSound', 39.9, 24, 12, 'wireless headphones', 'AuraSound X2', '12'],
      ['TEC-002', 'Parlante portátil', 'Parlante Bluetooth resistente al agua con 12 horas de batería.', 'Audio', 'Boom', 59.9, 35, 10, 'bluetooth speaker', 'BoomMini', '12'],
      ['TEC-003', 'Lámpara de escritorio LED', 'Lámpara LED con brazo articulado y tres temperaturas de luz.', 'Iluminación', 'Lumen', 24.5, 13, 20, 'led desk lamp', 'Lumen Flex', '24'],
      ['TEC-004', 'Cargador rápido USB-C 65W', 'Cargador GaN de 65W con dos puertos USB-C y uno USB-A.', 'Accesorios', 'Volt', 29.9, 17, 18, 'usb c charger', 'VoltGaN 65', '12'],
      ['TEC-005', 'Teclado mecánico', 'Teclado mecánico compacto con switches táctiles y retroiluminación.', 'Periféricos', 'KeyPro', 79, 48, 8, 'mechanical keyboard', 'KeyPro K68', '24'],
      ['TEC-006', 'Mouse inalámbrico', 'Mouse ergonómico inalámbrico con sensor ajustable y silencioso.', 'Periféricos', 'KeyPro', 19.9, 11, 25, 'wireless mouse', 'KeyPro M2', '12'],
      ['TEC-007', 'Organizador de escritorio', 'Organizador de madera con bandejas para lápices, teléfono y notas.', 'Hogar', 'Casa', 15.5, 8, 22, 'desk organizer', 'Casa Ord', '—'],
      ['TEC-008', 'Reloj inteligente', 'Reloj con monitor de actividad, notificaciones y batería de 7 días.', 'Wearables', 'AuraSound', 89, 55, 6, 'smartwatch', 'AuraWatch S', '12'],
    ],
  },
];

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function commonsImage(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=900' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}`;
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  const data = await response.json();
  for (const page of Object.values(data?.query?.pages ?? {})) {
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    if (!['image/jpeg', 'image/png'].includes(info.mime)) continue;
    if (/logo|map|diagram|chart|poster|cover/i.test(page.title ?? '')) continue;
    const candidate = info.thumburl ?? info.url;
    if (!candidate) continue;
    try {
      const probe = await fetch(candidate, {
        headers: { 'user-agent': BROWSER_UA, accept: 'image/*' },
        redirect: 'follow',
      });
      if (probe.status === 429) {
        await sleep(1500);
        continue;
      }
      if (!probe.ok) continue;
      const type = probe.headers.get('content-type') ?? '';
      if (!type.startsWith('image/')) continue;
      return candidate;
    } catch {
      await sleep(800);
    }
  }
  return null;
}

function writeCsvComma(path, rows) {
  writeFileSync(path, rows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n', 'utf8');
}

function writeCsvLatin1(path, rows) {
  const text = rows.map((row) => row.map(csvEscape).join(';')).join('\r\n') + '\r\n';
  writeFileSync(path, Buffer.from(text, 'latin1'));
}

function writeXlsx(path, rows) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Catálogo');
  XLSX.writeFile(book, path);
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const manifest = [];

  for (const catalog of CATALOGS) {
    console.log(`\nGenerando ${catalog.name}…`);
    const images = [];
    for (const product of catalog.products) {
      const image = await commonsImage(product[8]);
      images.push(image);
      console.log(`${image ? '✓' : '✗'} ${product[0]} ${product[1]}`);
      await sleep(650);
    }

    const path = resolve(outDir, catalog.file);
    if (catalog.format === 'csv') {
      const rows = [
        ['SKU', 'Nombre', 'Descripción', 'Categoría', 'Marca', 'Precio', 'Costo', 'Stock', 'Imagen'],
        ...catalog.products.map((p, index) => [...p.slice(0, 8), images[index] ?? '']),
      ];
      writeCsvComma(path, rows);
    } else if (catalog.format === 'csv-latin1') {
      const rows = [
        ['SKU', 'Producto', 'Detalle', 'Rubro', 'Precio', 'Existencia', 'Imagen', 'Peso', 'Vencimiento'],
        ...catalog.products.map((p, index) => [
          p[0], p[1], p[2], p[3], p[5], p[7], images[index] ?? '', p[9] ?? '', p[10] ?? '',
        ]),
      ];
      writeCsvLatin1(path, rows);
    } else if (catalog.format === 'xlsx-ferreteria') {
      const rows = [
        ['Código', 'Artículo', 'Descripción', 'Precio final ₡', 'Cant.', 'Medida', 'Material', 'Imagen'],
        ...catalog.products.map((p, index) => [
          p[0], p[1], p[2], p[5], p[7], p[9] ?? '', p[10] ?? '', images[index] ?? '',
        ]),
      ];
      writeXlsx(path, rows);
    } else {
      const rows = [
        ['Ref', 'Producto', 'Descripción larga', 'Precio (USD)', 'Existencia', 'Imagen', 'Modelo', 'Garantía (meses)'],
        ...catalog.products.map((p, index) => [
          p[0], p[1], p[2], p[5], p[7], images[index] ?? '', p[9] ?? '', p[10] ?? '',
        ]),
      ];
      writeXlsx(path, rows);
    }

    manifest.push({
      slug: catalog.slug,
      name: catalog.name,
      description: catalog.description,
      file: catalog.file,
      format: catalog.format,
      currency: catalog.currency,
      products: catalog.products.length,
      images: images.filter(Boolean).length,
    });
  }

  writeFileSync(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), catalogs: manifest }, null, 2) + '\n',
    'utf8',
  );

  const readme = [
    '# Catálogos de demostración',
    '',
    'Cuatro catálogos con fotos reales (Wikimedia Commons) y descripciones, en **formatos distintos**,',
    'listos para cargar desde el backoffice (`/panel/catalogos` → **Cargar catálogo**) o por API.',
    '',
    '| # | Archivo | Catálogo | Formato | Moneda | Campos extra |',
    '|---|---|---|---|---|---|',
    '| 1 | `01-boutique-mar.csv` | Boutique Mar | CSV UTF-8 separado por coma | CRC | — |',
    '| 2 | `02-ferreteria-central.xlsx` | Ferretería Central | XLSX con encabezados abreviados (`Código`, `Artículo`, `Cant.`) | CRC | `Medida`, `Material` |',
    '| 3 | `03-despensa-organica.csv` | Despensa Orgánica | CSV **Windows-1252** separado por `;` | CRC | `Peso`, `Vencimiento` |',
    '| 4 | `04-tecnohogar.xlsx` | TecnoHogar | XLSX con encabezados no estándar (`Ref`, `Descripción larga`, `Existencia`) | USD | `Modelo`, `Garantía (meses)` |',
    '',
    '## Cómo cargarlos',
    '',
    '1. `app.localhost:3010` → **Catálogos** → **Cargar catálogo**.',
    '2. Elegí **Catálogo nuevo** (ponele nombre) o **Catálogo existente** (reemplazar/actualizar).',
    '3. Subí el archivo y pulsá **Analizar con IA**: propone mapeo, campos extra y columnas ignoradas.',
    '4. Confirmá el plan y el modo:',
    '   - **Reemplazar**: el catálogo queda con lo del archivo (la versión anterior se archiva).',
    '   - **Fusionar**: conserva los productos que no vienen en el archivo.',
    '5. Si querés quitar el catálogo anterior, la pantalla ofrece **eliminarlo** (pide confirmación y',
    '   falla si tiene pedidos abiertos).',
    '',
    'La importación descarga las fotos a MinIO y crea una versión activable.',
    '',
    '## Regenerar',
    '',
    '```bash',
    'pnpm --filter @ventascatalogo/api exec node scripts/generate-catalogs.mjs',
    '```',
    '',
    'El script vuelve a buscar imágenes, reescribe los archivos y actualiza `manifest.json`.',
  ].join('\n');
  writeFileSync(resolve(outDir, 'README.md'), readme + '\n', 'utf8');

  console.log('\nListo:', JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
