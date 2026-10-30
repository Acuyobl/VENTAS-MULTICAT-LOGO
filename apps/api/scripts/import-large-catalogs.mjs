#!/usr/bin/env node
/* global fetch, console, process, FormData, Blob */
// Importa los 2 catálogos grandes (CSV con URLs de fotos reales) creando catálogos nuevos.
// Uso: $env:VC_COOKIE=$at; node scripts/import-large-catalogs.mjs

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

const catalogs = [
  { name: 'Hogar y Cocina — catálogo grande', slug: 'hogar-y-cocina-grande', file: 'catalogs/08-hogar-y-cocina.csv' },
  { name: 'Tecnología y Oficina — catálogo grande', slug: 'tecnologia-y-oficina-grande', file: 'catalogs/09-tecnologia-y-oficina.csv' },
];

async function main() {
  const existing = await api('/catalogs');
  for (const spec of catalogs) {
    const old = existing.items.find((item) => item.slug === spec.slug);
    if (old) {
      await api(`/catalogs/${old.id}`, { method: 'DELETE' });
      console.log(`- eliminado catálogo previo ${spec.slug}`);
    }

    const file = readFileSync(resolve(root, spec.file));
    const catalog = await api('/catalogs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: spec.name, slug: spec.slug, description: 'Catálogo grande de ejemplo con fotos reales de Wikimedia Commons.' }),
    });

    const previewForm = new FormData();
    previewForm.append('file', new Blob([file], { type: 'text/csv' }), spec.file.split('/').pop());
    const previewResponse = await fetch(`${base}/catalogs/${catalog.id}/imports/preview`, {
      method: 'POST',
      headers,
      body: previewForm,
    });
    const preview = await previewResponse.json();
    if (!previewResponse.ok) throw new Error(`preview ${spec.slug}: ${JSON.stringify(preview)}`);

    const importForm = new FormData();
    importForm.append('file', new Blob([file], { type: 'text/csv' }), spec.file.split('/').pop());
    importForm.append('currency', 'CRC');
    importForm.append('taxRateBp', '1300');
    importForm.append('taxIncluded', 'true');
    importForm.append('mode', 'REPLACE');
    importForm.append('mapping', JSON.stringify(preview.proposal.mapping));
    importForm.append('extraFields', JSON.stringify(preview.proposal.extraFields));
    const importResponse = await fetch(`${base}/catalogs/${catalog.id}/imports`, {
      method: 'POST',
      headers,
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
    const ext = new Map();
    for (const product of products.items) {
      const key = product.imageKey ? product.imageKey.split('.').pop() : 'sin';
      ext.set(key, (ext.get(key) ?? 0) + 1);
    }
    console.log(
      `${spec.name}: ${products.items.length} productos · importadas=${result.importedRows} · ` +
        `cuarentena=${result.quarantineRows} · imágenes=${JSON.stringify(Object.fromEntries(ext))} · ` +
        `warnings=${result.issues.filter((i) => i.severity === 'warning').length}`,
    );
    console.log(`  catalogId=${catalog.id}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
