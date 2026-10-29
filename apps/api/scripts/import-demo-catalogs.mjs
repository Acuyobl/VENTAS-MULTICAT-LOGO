#!/usr/bin/env node
/* global fetch, console, process, FormData, Blob */
// Carga los catálogos de /catalogs usando la API real (crea, analiza, importa y activa).
// Uso (PowerShell): $env:VC_COOKIE=$at; node scripts/import-demo-catalogs.mjs

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../catalogs');
const base = process.env.API_BASE ?? 'http://127.0.0.1:3001/api/v1';
const cookie = process.env.VC_COOKIE ?? '';
if (!cookie) {
  console.error('Falta VC_COOKIE en el entorno.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
const authHeaders = { cookie: `vc_staff_at=${cookie}`, accept: 'application/json' };
const MIME = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

async function api(path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...authHeaders, ...init.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const catalogsPage = await api('/catalogs');
  const existing = new Map(catalogsPage.items.map((catalog) => [catalog.slug, catalog]));
  const summary = [];

  for (const spec of manifest.catalogs) {
    const filePath = resolve(root, spec.file);
    const file = readFileSync(filePath);
    const type = spec.file.endsWith('.xlsx') ? MIME.xlsx : MIME.csv;

    let catalog = existing.get(spec.slug);
    if (!catalog) {
      catalog = await api('/catalogs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: spec.name,
          slug: spec.slug,
          description: spec.description,
        }),
      });
      console.log(`+ catálogo ${spec.name} (${catalog.id})`);
    } else {
      console.log(`= catálogo existente ${spec.name} (${catalog.id})`);
    }

    const previewForm = new FormData();
    previewForm.append('file', new Blob([file], { type }), spec.file);
    previewForm.append('useAgent', 'true');
    const previewResponse = await fetch(`${base}/catalogs/${catalog.id}/imports/preview`, {
      method: 'POST',
      headers: authHeaders,
      body: previewForm,
    });
    const preview = await previewResponse.json();
    if (!previewResponse.ok) throw new Error(`preview ${spec.slug}: ${JSON.stringify(preview)}`);

    const importForm = new FormData();
    importForm.append('file', new Blob([file], { type }), spec.file);
    importForm.append('currency', spec.currency);
    importForm.append('taxRateBp', '1300');
    importForm.append('taxIncluded', 'true');
    importForm.append('mode', 'REPLACE');
    importForm.append('saveTemplate', 'true');
    importForm.append('templateName', `Proveedor ${spec.name}`);
    importForm.append('mapping', JSON.stringify(preview.proposal.mapping));
    importForm.append('extraFields', JSON.stringify(preview.proposal.extraFields));

    const importResponse = await fetch(`${base}/catalogs/${catalog.id}/imports`, {
      method: 'POST',
      headers: authHeaders,
      body: importForm,
    });
    const result = await importResponse.json();
    if (!importResponse.ok) throw new Error(`import ${spec.slug}: ${JSON.stringify(result)}`);

    await api(`/catalogs/${catalog.id}/versions/${result.catalogVersionId}/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    const products = await api(`/products?catalogId=${catalog.id}&limit=100`);
    const withImage = products.items.filter((product) => product.imageKey).length;
    summary.push({
      catalog: spec.name,
      file: spec.file,
      currency: spec.currency,
      products: products.items.length,
      withImage,
      attributes: products.items.filter(
        (product) => product.attributes && Object.keys(product.attributes).length > 0,
      ).length,
      warnings: result.issues.filter((issue) => issue.severity === 'warning').length,
      quarantine: result.quarantineRows,
    });
    console.log(
      `✓ ${spec.name}: ${products.items.length} productos · ${withImage} con imagen · ` +
        `${summary.at(-1).attributes} con atributos · cuarentena ${result.quarantineRows}`,
    );
  }

  console.log('\nResumen:', JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
