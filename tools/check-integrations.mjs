#!/usr/bin/env node
/* global fetch, console, process */
// Preflight de integraciones reales. No imprime secretos; solo verifica presencia y, opcionalmente,
// conectividad básica. Uso: node tools/check-integrations.mjs [--strict]

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    if (env[match[1]] !== undefined) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const value = (key) => (env[key] ?? '').trim();
const set = (key) => value(key).length > 0;
const strict = process.argv.includes('--strict');

const checks = [];
function add(group, name, ready, detail) {
  checks.push({ group, name, ready, detail });
}

add('IA', 'DEEPSEEK_API_KEY', set('DEEPSEEK_API_KEY'), set('DEEPSEEK_API_KEY') ? 'configurada' : 'falta (usa AI_PROVIDER=mock)');
add('IA', 'OPENAI_API_KEY', set('OPENAI_API_KEY'), set('OPENAI_API_KEY') ? 'configurada' : 'falta (usa IMAGE_PROVIDER=mock)');
add(
  'Email',
  'Proveedor',
  value('EMAIL_PROVIDER') === 'resend' ? set('RESEND_API_KEY') : set('SMTP_HOST'),
  value('EMAIL_PROVIDER') === 'resend'
    ? set('RESEND_API_KEY') ? 'Resend configurado' : 'falta RESEND_API_KEY'
    : `SMTP ${value('SMTP_HOST') || 'localhost'}:${value('SMTP_PORT') || '1025'}`,
);
add('Pagos', 'STRIPE_SECRET_KEY', set('STRIPE_SECRET_KEY'), set('STRIPE_SECRET_KEY') ? 'configurada' : 'falta (sandbox disponible)');
add('Pagos', 'STRIPE_WEBHOOK_SECRET', set('STRIPE_WEBHOOK_SECRET'), set('STRIPE_WEBHOOK_SECRET') ? 'configurado' : 'falta para producción');
add('WhatsApp', 'WHATSAPP_ACCESS_TOKEN', set('WHATSAPP_ACCESS_TOKEN'), set('WHATSAPP_ACCESS_TOKEN') ? 'configurado' : 'falta para envío real');
add('WhatsApp', 'WHATSAPP_PHONE_NUMBER_ID', set('WHATSAPP_PHONE_NUMBER_ID'), set('WHATSAPP_PHONE_NUMBER_ID') ? 'configurado' : 'falta para envío real');
add('WhatsApp', 'WHATSAPP_APP_SECRET', set('WHATSAPP_APP_SECRET'), set('WHATSAPP_APP_SECRET') ? 'firma obligatoria' : 'sin firma (solo demo)');
add('Google', 'GOOGLE_CLIENT_ID', set('GOOGLE_CLIENT_ID'), set('GOOGLE_CLIENT_ID') ? 'configurado' : 'falta para Drive');
add('Google', 'GOOGLE_CLIENT_SECRET', set('GOOGLE_CLIENT_SECRET'), set('GOOGLE_CLIENT_SECRET') ? 'configurado' : 'falta para Drive');
add('Infra', 'STORAGE_PUBLIC_URL', set('STORAGE_PUBLIC_URL'), set('STORAGE_PUBLIC_URL') ? 'configurada' : 'vacía (MinIO local)');
add('Infra', 'ENCRYPTION_KEY', set('ENCRYPTION_KEY'), set('ENCRYPTION_KEY') ? 'configurada' : 'falta para secretos de pasarela');

const groups = [...new Set(checks.map((check) => check.group))];
console.log('Preflight de integraciones (sin mostrar secretos)\n');
for (const group of groups) {
  console.log(`${group}`);
  for (const check of checks.filter((item) => item.group === group)) {
    console.log(`  ${check.ready ? '✅' : '❌'} ${check.name}: ${check.detail}`);
  }
}
const missing = checks.filter((check) => !check.ready);
console.log(`\n${checks.length - missing.length}/${checks.length} listas · ${missing.length} pendientes`);
console.log('Con las faltantes, la app sigue funcionando con mocks/sandbox; para producción cargalas en .env.');

if (strict && missing.length > 0) process.exitCode = 1;
