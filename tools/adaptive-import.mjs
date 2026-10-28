#!/usr/bin/env node
/* global fetch, console, process, FormData, Blob */
// Analiza (preview) e importa un catálogo usando el plan que propone el agente.
// Uso (desde PowerShell, con sesión ya iniciada):
//   $env:VC_COOKIE=$at; $env:CATALOG_ID='...'; $env:CSV_PATH='tools/fixtures/...csv'
//   node tools/adaptive-import.mjs [REPLACE|MERGE]

import { readFileSync } from 'node:fs';

const cookie = process.env.VC_COOKIE ?? '';
const catalogId = process.env.CATALOG_ID ?? '';
const csvPath = process.env.CSV_PATH ?? '';
const mode = process.argv[2] ?? 'REPLACE';
const base = process.env.API_BASE ?? 'http://127.0.0.1:3001/api/v1';

if (!cookie || !catalogId || !csvPath) {
  console.error('Faltan VC_COOKIE, CATALOG_ID o CSV_PATH en el entorno.');
  process.exit(1);
}

const authHeaders = { cookie: `vc_staff_at=${cookie}`, accept: 'application/json' };
const csv = readFileSync(csvPath);

async function main() {
  const previewForm = new FormData();
  previewForm.append('file', new Blob([csv], { type: 'text/csv' }), 'catalogo.csv');
  previewForm.append('useAgent', 'true');

  const previewResponse = await fetch(`${base}/catalogs/${catalogId}/imports/preview`, {
    method: 'POST',
    headers: authHeaders,
    body: previewForm,
  });
  const previewText = await previewResponse.text();
  console.log(`preview HTTP ${previewResponse.status}`);
  if (!previewResponse.ok) {
    console.log(previewText);
    process.exit(1);
  }
  const preview = JSON.parse(previewText);
  console.log('mapping:', JSON.stringify(preview.proposal.mapping));
  console.log('extraFields:', JSON.stringify(preview.proposal.extraFields.map((f) => f.column)));
  console.log('ignored:', JSON.stringify(preview.proposal.ignoredColumns.map((c) => c.column)));
  console.log('agent:', JSON.stringify(preview.proposal.agent));
  console.log('preset:', JSON.stringify(preview.preset));

  const importForm = new FormData();
  importForm.append('file', new Blob([csv], { type: 'text/csv' }), 'catalogo.csv');
  importForm.append('currency', 'CRC');
  importForm.append('taxRateBp', '1300');
  importForm.append('taxIncluded', 'true');
  importForm.append('mode', mode);
  importForm.append('saveTemplate', 'true');
  importForm.append('templateName', 'Proveedor Tornillo');
  importForm.append('mapping', JSON.stringify(preview.proposal.mapping));
  importForm.append('extraFields', JSON.stringify(preview.proposal.extraFields));

  const importResponse = await fetch(`${base}/catalogs/${catalogId}/imports`, {
    method: 'POST',
    headers: authHeaders,
    body: importForm,
  });
  const importText = await importResponse.text();
  console.log(`import HTTP ${importResponse.status}`);
  if (!importResponse.ok) {
    console.log(importText);
    process.exit(1);
  }
  const result = JSON.parse(importText);
  console.log('result:', JSON.stringify(result));

  const activateResponse = await fetch(
    `${base}/catalogs/${catalogId}/versions/${result.catalogVersionId}/activate`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: '{}',
    },
  );
  console.log(`activate HTTP ${activateResponse.status}`);
  console.log(await activateResponse.text());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
