#!/usr/bin/env node
/* global fetch, console, process, setTimeout */
// Crea el catálogo "Despensa de Altura CR" con productos y fotos reales de Wikimedia Commons.
// Escribe el CSV de importación en tools/fixtures/despensa-altura.csv.
// Uso: pnpm --filter @ventascatalogo/api exec dotenv -e ../../.env -- node scripts/load-real-catalog.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));
const outCsv = resolve(here, '../../../tools/fixtures/despensa-altura.csv');

const CATALOG = {
  slug: 'despensa-de-altura',
  name: 'Despensa de Altura',
  description:
    'Café de altura, miel, chocolate y despensa artesanal de Costa Rica. Fotos reales de Wikimedia Commons.',
};

const PRODUCTS = [
  ['ALT-001', 'Café en grano tostado 500 g', 'Tueste medio, notas de chocolate y naranja. Finca de Tarrazú.', 'Café', 'Altura', 11500, 7200, 40, 'coffee beans'],
  ['ALT-002', 'Café molido 500 g', 'Molido para cafetera de filtro, tueste medio.', 'Café', 'Altura', 10500, 6600, 55, 'ground coffee'],
  ['ALT-003', 'Café verde 1 kg', 'Grano verde sin tostar para tueste en casa.', 'Café', 'Finca La Loma', 15900, 11000, 12, 'green coffee beans'],
  ['ALT-004', 'Miel de abeja 500 g', 'Miel pura de flores tropicales, cosecha del año.', 'Miel', 'Doña Rosa', 7800, 4600, 30, 'honey jar'],
  ['ALT-005', 'Miel con panal 300 g', 'Panal entero con miel, presentación de regalo.', 'Miel', 'Doña Rosa', 9500, 5800, 15, 'honeycomb'],
  ['ALT-006', 'Chocolate 70 % cacao 100 g', 'Barra artesanal de cacao costarricense.', 'Chocolate', 'Selva Verde', 4500, 2600, 80, 'dark chocolate bar'],
  ['ALT-007', 'Cacao en polvo 250 g', 'Cacao puro sin azúcar, ideal para bebidas.', 'Chocolate', 'Selva Verde', 6200, 3800, 25, 'cocoa powder'],
  ['ALT-008', 'Nibs de cacao 200 g', 'Trozos de cacao tostado, crunch natural.', 'Chocolate', 'Selva Verde', 5400, 3200, 20, 'cocoa nibs'],
  ['ALT-009', 'Galletas de avena 200 g', 'Horneadas con avena integral y miel.', 'Repostería', 'Raíz', 3800, 2100, 60, 'oatmeal cookies'],
  ['ALT-010', 'Galletas de jengibre 200 g', 'Jengibre y canela, textura crocante.', 'Repostería', 'Raíz', 3800, 2100, 45, 'gingerbread cookies'],
  ['ALT-011', 'Mermelada de naranja 250 g', 'Naranja agria de la zona de Palmares.', 'Conservas', 'Doña Rosa', 4200, 2400, 35, 'orange marmalade'],
  ['ALT-012', 'Salsa picante 150 ml', 'Chile criollo y ají, picante medio.', 'Conservas', 'Raíz', 3600, 2000, 50, 'hot sauce bottle'],
  ['ALT-013', 'Té de hierbabuena 50 g', 'Hojas secas de cultivo orgánico.', 'Tés', 'Selva Verde', 3200, 1800, 40, 'peppermint tea'],
  ['ALT-014', 'Té de manzanilla 50 g', 'Manzanilla para infusión nocturna.', 'Tés', 'Selva Verde', 3200, 1800, 40, 'chamomile tea'],
  ['ALT-015', 'Sal marina 500 g', 'Sal de cosecha artesanal de Guanacaste.', 'Especias', 'Raíz', 2900, 1500, 70, 'sea salt'],
  ['ALT-016', 'Pimienta negra 100 g', 'Grano entero para moler al momento.', 'Especias', 'Raíz', 3400, 1900, 55, 'black pepper'],
  ['ALT-017', 'Canela en rajas 100 g', 'Canela de Ceilán en astillas.', 'Especias', 'Raíz', 3100, 1700, 45, 'cinnamon sticks'],
  ['ALT-018', 'Maní tostado 300 g', 'Maní tostado sin sal, bolsa resellable.', 'Frutos secos', 'La Loma', 3900, 2200, 50, 'roasted peanuts'],
  ['ALT-019', 'Macadamia 250 g', 'Macadamia tostada, cosecha nacional.', 'Frutos secos', 'La Loma', 8600, 5400, 25, 'macadamia nuts'],
  ['ALT-020', 'Aceite de coco 250 ml', 'Aceite de coco virgen prensado en frío.', 'Aceites', 'Selva Verde', 6900, 4100, 30, 'coconut oil jar'],
];

const UA = 'VentasCatalogoDemo/1.0 (dev@ventascatalogo.local)';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function commonsImage(term) {
  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
    '&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=900' +
    `&gsrsearch=${encodeURIComponent(`filetype:bitmap ${term}`)}`;
  const response = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!response.ok) throw new Error(`Commons respondió ${response.status} para "${term}"`);
  const data = await response.json();
  const pages = Object.values(data?.query?.pages ?? {});
  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    if (!info) continue;
    if (!['image/jpeg', 'image/png'].includes(info.mime)) continue;
    if (/logo|map|diagram|chart|poster|cover/i.test(page.title ?? '')) continue;
    if (!info.thumburl && !info.url) continue;
    return { url: info.thumburl ?? info.url, title: page.title };
  }
  return null;
}

async function verifyImage(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'user-agent': BROWSER_UA, accept: 'image/*' },
        redirect: 'follow',
      });
      // Wikimedia responde 429 si se descargan muchas miniaturas seguidas.
      if (response.status === 429) {
        await sleep(1500 * attempt);
        continue;
      }
      if (!response.ok) return false;
      const type = response.headers.get('content-type') ?? '';
      const length = Number(response.headers.get('content-length') ?? 0);
      if (!type.startsWith('image/')) return false;
      if (length > 5 * 1024 * 1024) return false;
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function main() {
  const organization = await prisma.organization.findUnique({ where: { slug: 'demo' } });
  if (!organization) throw new Error('No existe la organización demo; corré el seed primero.');

  const catalog = await prisma.catalog.upsert({
    where: { organizationId_slug: { organizationId: organization.id, slug: CATALOG.slug } },
    create: {
      organizationId: organization.id,
      name: CATALOG.name,
      slug: CATALOG.slug,
      description: CATALOG.description,
    },
    update: { name: CATALOG.name, description: CATALOG.description },
  });
  console.log(`catálogo: ${catalog.id} (${catalog.slug})`);

  const rows = [];
  for (const [sku, name, description, category, brand, price, cost, stock, term] of PRODUCTS) {
    let image = null;
    for (const attempt of [term, `${term} food`, `${term} product`]) {
      const candidate = await commonsImage(attempt);
      if (candidate && (await verifyImage(candidate.url))) {
        image = candidate.url;
        break;
      }
    }
    console.log(`${image ? '✓' : '✗'} ${sku} ${name}${image ? '' : ' (sin imagen)'}`);
    rows.push([sku, name, description, category, brand, price, cost, stock, image ?? '']);
    await sleep(700);
  }

  const header = ['SKU', 'Nombre', 'Descripción', 'Categoría', 'Marca', 'Precio', 'Costo', 'Stock', 'Imagen'];
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n') + '\n';
  mkdirSync(dirname(outCsv), { recursive: true });
  writeFileSync(outCsv, csv, 'utf8');
  const withImage = rows.filter((row) => row[8]).length;
  console.log(`CSV: ${outCsv} · ${rows.length} productos · ${withImage} con imagen`);
  console.log(`catalogId=${catalog.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
