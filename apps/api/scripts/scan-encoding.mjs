#!/usr/bin/env node
/* global console, process */
// Escanea columnas de texto en busca del carácter de reemplazo U+FFFD (�) y permite repararlas.
// Uso:
//   node scripts/scan-encoding.mjs          → reporte
//   node scripts/scan-encoding.mjs --fix    → aplica el mapa de reparaciones conocido
// Requiere DATABASE_URL (usar dotenv -e ../../.env -- node scripts/scan-encoding.mjs).

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const shouldFix = process.argv.includes('--fix');

// Reparaciones conocidas de datos demo creados desde consolas con codificación rota.
const KNOWN_FIXES = [
  ['\uFFFDQu\uFFFD', '¿Qué'],
  ['\uFFFDhacen', '¿hacen'],
  ['\uFFFDQu\uFFFD', '¿Qué'],
  ['Mar\uFFFDa', 'María'],
  ['Ferreter\uFFFDa', 'Ferretería'],
  ['Cat\uFFFDlogo', 'Catálogo'],
  ['Caf\uFFFD', 'Café'],
  ['caf\uFFFD', 'café'],
  ['Cotizaci\uFFFDn', 'Cotización'],
  ['Descripci\uFFFDn', 'Descripción'],
  ['Categor\uFFFDa', 'Categoría'],
  ['publicaci\uFFFDn', 'publicación'],
  ['integraci\uFFFDn', 'integración'],
  ['segregaci\uFFFDn', 'segregación'],
  ['Devoluci\uFFFDn', 'Devolución'],
  ['desisti\uFFFD', 'desistió'],
  ['da\uFFFDado', 'dañado'],
  ['c\uFFFDlida', 'cálida'],
  ['M\uFFFDs', 'Más'],
];

async function main() {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text', 'character varying')
    ORDER BY table_name, column_name
  `);

  const findings = [];
  for (const { table_name: table, column_name: column } of columns) {
    try {
      const rows = await prisma.$queryRawUnsafe(
        `SELECT id, "${column}" AS value FROM "${table}"
         WHERE "${column}" IS NOT NULL AND position(chr(65533) in "${column}") > 0
         LIMIT 50`,
      );
      for (const row of rows) {
        findings.push({ table, column, id: row.id, value: row.value });
      }
    } catch {
      // columnas sin PK `id` (p. ej. tablas puente) se omiten
    }
  }

  if (findings.length === 0) {
    console.log('Sin caracteres U+FFFD en la base de datos.');
    return;
  }

  console.log(`Hallazgos: ${findings.length}`);
  for (const finding of findings) {
    console.log(`- ${finding.table}.${finding.column} [${finding.id}]: ${JSON.stringify(finding.value)}`);
  }

  if (!shouldFix) {
    console.log('\nEjecutá con --fix para aplicar el mapa de reparaciones conocido.');
    return;
  }

  let updated = 0;
  for (const finding of findings) {
    if (typeof finding.value !== 'string') continue;
    let fixed = finding.value;
    for (const [from, to] of KNOWN_FIXES) {
      fixed = fixed.split(from).join(to);
    }
    if (fixed === finding.value) continue;
    await prisma.$executeRawUnsafe(
      `UPDATE "${finding.table}" SET "${finding.column}" = $1 WHERE id::text = $2`,
      fixed,
      String(finding.id),
    );
    console.log(`✓ ${finding.table}.${finding.column} [${finding.id}] → ${JSON.stringify(fixed)}`);
    updated += 1;
  }
  console.log(`Reparados: ${updated}. Si quedan hallazgos, revisalos a mano.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
