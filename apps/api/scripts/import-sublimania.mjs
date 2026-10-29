#!/usr/bin/env node
/* global fetch, console, process, FormData, Blob */
// Importa catalogs/05-sublimania-cr.csv como catálogo nuevo y activa la versión.
// Uso: $env:VC_COOKIE=$at; node scripts/import-sublimania.mjs

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../');
const base = process.env.API_BASE ?? 'http://127.0.0.1:3001/api/v1';
const cookie = process.env.VC_COOKIE ?? '';
if (!cookie) {
  console.error('Falta VC_COOKIE en el entorno.');
  process.exit(1);
}

const headers = { cookie: `vc_staff_at=${cookie}`, accept: 'application/json' };

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const filePath = resolve(root, 'catalogs/05-sublimania-cr.csv');
  const file = readFileSync(filePath);
  const page = await api('/catalogs');
  let catalog = page.items.find((item) => item.slug === 'sublimania-cr');
  if (!catalog) {
    catalog = await api('/catalogs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Sublimania CR',
        slug: 'sublimania-cr',
        description:
          'Catalogo convertido del pedido real de SUBLIMANIA CR: camisas personalizadas con fotos incrustadas.',
      }),
    });
    console.log(`+ catálogo creado ${catalog.name} (${catalog.id})`);
  } else {
    console.log(`= catálogo existente ${catalog.name} (${catalog.id})`);
  }

  const previewForm = new FormData();
  previewForm.append('file', new Blob([file], { type: 'text/csv' }), '05-sublimania-cr.csv');
  previewForm.append('useAgent', 'true');
  const previewResponse = await fetch(`${base}/catalogs/${catalog.id}/imports/preview`, {
    method: 'POST',
    headers,
    body: previewForm,
  });
  const preview = await previewResponse.json();
  if (!previewResponse.ok) throw new Error(JSON.stringify(preview));
  console.log('mapping:', preview.proposal.mapping);
  console.log('extras:', preview.proposal.extraFields.map((field) => field.column).join(', '));
  console.log('warnings:', preview.proposal.warnings.join(' | '));

  const importForm = new FormData();
  importForm.append('file', new Blob([file], { type: 'text/csv' }), '05-sublimania-cr.csv');
  importForm.append('currency', 'CRC');
  importForm.append('taxRateBp', '1300');
  importForm.append('taxIncluded', 'true');
  importForm.append('mode', 'REPLACE');
  importForm.append('saveTemplate', 'true');
  importForm.append('templateName', 'Pedido SUBLIMANIA');
  importForm.append('mapping', JSON.stringify(preview.proposal.mapping));
  importForm.append('extraFields', JSON.stringify(preview.proposal.extraFields));
  const importResponse = await fetch(`${base}/catalogs/${catalog.id}/imports`, {
    method: 'POST',
    headers,
    body: importForm,
  });
  const result = await importResponse.json();
  if (!importResponse.ok) throw new Error(JSON.stringify(result));
  console.log(
    `import: version=${result.catalogVersionId} filas=${result.importedRows} cuarentena=${result.quarantineRows}`,
  );
  console.log('issues:', result.issues.map((issue) => `${issue.severity}:${issue.code}`).join(', '));

  await api(`/catalogs/${catalog.id}/versions/${result.catalogVersionId}/activate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

  const products = await api(`/products?catalogId=${catalog.id}&limit=20`);
  console.log(`productos: ${products.items.length}`);
  for (const product of products.items) {
    console.log(
      `- ${product.sku} ${product.name} · ${product.priceMinor} · imagen=${Boolean(product.imageKey)} · ` +
        `atributos=${Object.keys(product.attributes ?? {}).join(',')}`,
    );
  }
  console.log('catalogId:', catalog.id);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
