#!/usr/bin/env node
// Mide el bootstrap de un entorno de desarrollo (criterio 8 de F0).
// Uso: node tools/bootstrap-check.mjs
// Imprime una tabla con el tiempo de cada paso y el total. Falla si un paso falla.

import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

const steps = [
  ['instalar dependencias', 'pnpm', ['install', '--frozen-lockfile']],
  ['levantar infraestructura', 'pnpm', ['infra:up']],
  ['aplicar migraciones', 'pnpm', ['db:deploy']],
  ['sembrar datos demo', 'pnpm', ['db:seed']],
  ['compilar paquetes y apps', 'pnpm', ['build']],
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n[FALLO] ${command} ${args.join(' ')} (código ${result.status})`);
    process.exit(result.status ?? 1);
  }
}

function waitForPostgres(timeoutMs = 90_000) {
  const started = performance.now();
  for (;;) {
    const probe = spawnSync(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'vc', '-d', 'ventascatalogo'],
      { stdio: 'ignore', shell: process.platform === 'win32' },
    );
    if (probe.status === 0) return performance.now() - started;
    if (performance.now() - started > timeoutMs) {
      console.error('[FALLO] PostgreSQL no respondió en 90 s');
      process.exit(1);
    }
    spawnSync('node', ['-e', 'setTimeout(() => {}, 1500)']);
  }
}

console.log('Bootstrap de VentasCatálogo — midiendo pasos\n');
const results = [];
const totalStart = performance.now();

for (const [label, command, args] of steps) {
  const start = performance.now();
  run(command, args);
  const seconds = (performance.now() - start) / 1000;
  results.push({ label, seconds });
  console.log(`  ✓ ${label}: ${seconds.toFixed(1)} s\n`);
}

const pgStart = performance.now();
const waitSeconds = waitForPostgres() / 1000;
void pgStart;
results.push({ label: 'esperar PostgreSQL listo', seconds: waitSeconds });
console.log(`  ✓ esperar PostgreSQL listo: ${waitSeconds.toFixed(1)} s\n`);

const total = (performance.now() - totalStart) / 1000;
console.log('| Paso | Tiempo |');
console.log('| --- | --- |');
for (const result of results) {
  console.log(`| ${result.label} | ${result.seconds.toFixed(1)} s |`);
}
console.log(`| **Total** | **${total.toFixed(1)} s** |`);
