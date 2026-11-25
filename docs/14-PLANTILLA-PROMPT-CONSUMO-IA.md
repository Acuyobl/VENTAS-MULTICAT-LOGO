---
title: Plantilla de prompt — gobernanza de consumo IA para cualquier proceso
tipo: plantilla
estado: vigente
version: 1.0
fecha: 2026-11-15
idioma: es-CR
---

# Plantilla de prompt — gobernanza de consumo IA para cualquier proceso

Esta plantilla captura el patrón que ya funciona en `/panel/consumo-ia` para aplicarlo a
**cualquier proceso** que gaste dinero llamando a un proveedor externo (texto, imágenes, OCR,
chat, rutinas, etc.). Reemplazá los `{{placeholders}}` y pegá el bloque en el agente.

## 1. Cómo funciona el proceso de referencia

1. **Dinero en micro-dólares enteros.** `1 USD = 1_000_000 microUSD`. Nunca floats.
2. **Período = mes calendario UTC** (`YYYY-MM`), calculado en el servidor con
   `currentPeriod()`; la UI formatea el mes con `timeZone: 'UTC'`.
3. **Libro de uso** (`ai_usage_ledger`): una fila por llamada real al proveedor con
   `feature`, `provider`, `model`, `tokensIn/Out`, `costMicroUsd`, `latencyMs`,
   `promptTemplateKey`, `promptVersion`, `requestHash`, `cacheHit`, `userId` y la entidad
   dueña (p. ej. `socialPostId`).
4. **Presupuesto por organización** (`ai_budget_policies`): `monthlyBudgetMicroUsd`
   (`0` = sin límite), `alertPercent` (default 80) y `hardStop` (default `true`).
5. **Freno antes de gastar** (`assertCanSpend`):
   - Sin presupuesto explícito → aplica la cuota mensual de tokens del plan
     (`Organization.aiMonthlyQuotaTokens`; `0` = sin límite).
   - Con presupuesto y `hardStop` y proyectado `>=` límite → `429 AI_QUOTA_EXCEEDED` +
     incidente `HARD_STOP`.
   - Al cruzar `alertPercent` → incidente `WARNING` y la llamada sigue.
6. **Registro después de la llamada** (`record`): nunca interrumpe la operación; si la
   escritura falla, solo se loguea (`ai_usage_record_failed`).
7. **Incidentes idempotentes** (`ai_budget_incidents`): único por
   `(organizationId, period, kind)` con `upsert`; se registra uno por mes como máximo.
8. **Costo** con `computeCostMicroUsd(tokensIn, tokensOut, pricing)` usando
   `AI_USD_PER_1K_INPUT` / `AI_USD_PER_1K_OUTPUT`; los proveedores de imagen pueden devolver
   `costMicroUsd` (si no, `0`).
9. **Degradación**: si las tablas de presupuesto/incidentes no están disponibles, la API
   responde con defaults (`policy=null`, `incidents=[]`), nunca 500.
10. **Permisos y auditoría**: `ai:usage_read` (ver) y `ai:budget_manage` (configurar);
    `@Audience('staff')`; cada generación audita su evento de dominio sin secretos.
11. **UI** (`/panel/consumo-ia`): 4 métricas (gasto del mes, presupuesto, tokens, imágenes),
    formulario de presupuesto gateado por permiso, desagregado por `feature` y lista de
    incidentes. La pantalla es un Server Component (`force-dynamic`); el formulario es
    cliente y hace `router.refresh()`.

### Archivos de referencia

| Capa | Archivo |
|---|---|
| Servicio de gobernanza | `apps/api/src/modules/ai-governance/ai-governance.service.ts` |
| Endpoints | `apps/api/src/modules/ai-governance/ai-usage.controller.ts` |
| Módulo | `apps/api/src/modules/ai-governance/ai-governance.module.ts` |
| Contratos Zod | `packages/contracts/src/ai/usage.ts` |
| Costo | `packages/ai/src/budget/cost.ts` |
| Modelos Prisma | `apps/api/prisma/schema.prisma` (`AiUsageLedger`, `AiBudgetPolicy`, `AiBudgetIncident`) |
| Migración de referencia | `apps/api/prisma/migrations/20261108000000_governance_spine` |
| Ejemplo de integración | `apps/api/src/modules/ai/social-posts.service.ts` |
| Permisos | `apps/api/prisma/seed.ts` |
| Pantalla | `apps/web/src/app/(backoffice)/panel/consumo-ia/page.tsx` |
| Formulario | `apps/web/src/components/backoffice/ai-budget-form.tsx` |
| Tests | `apps/api/src/modules/ai-governance/ai-governance.service.spec.ts` |

## 2. Prompt genérico (copiar y pegar)

```text
# OBJETIVO: gobernar el consumo de IA del proceso «{{PROCESO}}»

## Rol
Actuá como ingeniero/a senior full-stack del monorepo VentasCatálogo
(NestJS 11 + Prisma 6 + PostgreSQL en apps/api, Next.js 15 App Router en apps/web,
Zod en packages/contracts, proveedores y costo en packages/ai). Trabajás sobre el
código existente; no reescribís arquitectura ni duplicás lógica.

## Modo
- MODO=INTEGRAR (default en este repo): el subsistema de gobernanza YA EXISTE.
  Inyectá `AiGovernanceService`, llamá `assertCanSpend` antes del proveedor y
  `record` después, agregá el `feature` al desglose del panel y tests.
- MODO=REPLICAR (otra app/stack): creá el subsistema completo (ledger, policy,
  incidents, guard, record, panel, permisos) respetando el mismo contrato
  conceptual y semántica. Documentá las equivalencias de stack.
- Si el proceso NO llama a un proveedor externo con costo variable, detenete,
  explicá por qué no aplica y proponé alternativas (unidades de consumo).

## Contexto que tenés que leer antes de tocar nada
1. `apps/api/src/modules/ai-governance/ai-governance.service.ts` (contrato real:
   getUsage, getBudget, updateBudget, assertCanSpend, record).
2. `apps/api/src/modules/ai/social-posts.service.ts` (ejemplo de integración:
   pre-check con `feature: 'social_post'` + `record` con tokens/costo/latencia).
3. `apps/api/prisma/schema.prisma` → `AiUsageLedger`, `AiBudgetPolicy`,
   `AiBudgetIncident` y `Organization.aiMonthlyQuotaTokens`.
4. `packages/contracts/src/ai/usage.ts` (aiUsageSchema, aiBudgetUpdateSchema,
   aiBudgetIncidentSchema) y `packages/ai/src/budget/cost.ts`.
5. `apps/web/src/app/(backoffice)/panel/consumo-ia/page.tsx` y
   `apps/web/src/components/backoffice/ai-budget-form.tsx`.

## Invariantes (no negociables)
1. Montos en micro-dólares enteros (1 USD = 1_000_000). Nunca floats en DB/API.
2. Período = mes calendario UTC (`YYYY-MM`), sin zonas locales.
3. `monthlyBudgetMicroUsd = 0` significa «sin límite»: rige la cuota de tokens del plan.
4. `assertCanSpend` va SIEMPRE antes de llamar al proveedor. Con `hardStop` y gasto
   proyectado >= presupuesto → `429 AI_QUOTA_EXCEEDED` y incidente `HARD_STOP`.
   Al cruzar `alertPercent` → incidente `WARNING` y la llamada continúa.
5. `record` va SIEMPRE después de la llamada real, una fila por llamada, y NUNCA
   puede tumbar el proceso (try/catch + log `ai_usage_record_failed`).
6. Incidentes idempotentes por `(organizationId, period, kind)` mediante upsert.
7. Si policy/incidents no existen o fallan, degradar (null / lista vacía), no 500.
8. Costo: `computeCostMicroUsd(tokensIn, tokensOut, pricing)` con
   `AI_USD_PER_1K_INPUT`/`AI_USD_PER_1K_OUTPUT`; si el proveedor devuelve costo
   (p. ej. imágenes), usarlo; si no, 0. Truncar a entero >= 0.
9. Trazabilidad: `promptTemplateKey`, `promptVersion`, `requestHash`, `latencyMs`,
   `provider`, `model`, `userId` y el id de la entidad de negocio.
10. Seguridad: organización y usuario SIEMPRE desde la sesión autenticada, nunca del
    body. No registrar secretos ni claves de API.
11. Permisos: lectura `ai:usage_read`, escritura `ai:budget_manage`; el proceso
    conserva sus propios permisos (p. ej. `social:generate`) y audita su evento.
12. Contratos aditivos: campos nuevos opcionales; no romper respuestas existentes.
13. UI: mostrar USD con máximo 4 decimales; feature desconocida se muestra cruda;
    estados vacíos explícitos («sin llamadas», «sin incidentes»).
14. No commitear, no tocar `.env`, no instalar dependencias sin necesidad.

## Plan de implementación
### Fase 0 — Descubrimiento (sin escribir código)
- Localizá TODOS los puntos donde el proceso {{PROCESO}} llama a un proveedor
  externo (fábricas de proveedor, fetch/SDK, OCR, imágenes, chat, rutinas).
- Definí: `feature` estable snake_case (`{{FEATURE_KEY}}`), unidad de consumo
  (`{{UNIDAD}}`), entidad dueña (`{{ENTIDAD}}`), permiso propio del proceso
  (`{{PERMISO}}`) y cómo se calcula el costo (`{{COSTO}}`).
- Reportá el plan en 5 líneas antes de implementar.

### Fase 1 — Datos
- Si existen los modelos, no los cambies; si faltan (MODO=REPLICAR), creá:
  `AiUsageLedger` con índices `(organizationId, createdAt)` y `(requestHash)`;
  `AiBudgetPolicy` con `organizationId` único; `AiBudgetIncident` con único
  `(organizationId, period, kind)`; migración nueva (no editar migraciones viejas).

### Fase 2 — Contratos
- Reutilizá `aiUsageSchema`, `aiBudgetUpdateSchema`, `aiBudgetIncidentSchema`.
  Si el proceso necesita un campo nuevo (p. ej. `units`), agregalo opcional y
  actualizá el desglose por feature.

### Fase 3 — API
- Inyectá `AiGovernanceService` en el servicio del proceso.
- Antes del proveedor: `assertCanSpend(orgId, {{ESTIMACION}}, { feature:
  '{{FEATURE_KEY}}', userId })`. Si podés estimar el costo (páginas, imágenes),
  pasalo como microUSD; si no, `0`.
- Después de la llamada: `record({ organizationId, feature: '{{FEATURE_KEY}}',
  provider, model, promptTemplateKey, promptVersion, tokensIn, tokensOut,
  costMicroUsd, latencyMs, userId, {{ENTIDAD}}Id })`.
- Mapeá errores: cuota/presupuesto → 429 `AI_QUOTA_EXCEEDED` con
  `{ spentMicroUsd, limitMicroUsd }`; proveedor caído → 502 `AI_PROVIDER_ERROR`.
- Escribí auditoría del evento de dominio con before/after sin secretos.

### Fase 4 — Web
- Registrá `{{FEATURE_KEY}}` en el mapa de etiquetas del panel (si aplica) y
  verificá que aparece en «Consumo por función» sin tocar la pantalla.
- Si el proceso requiere métricas propias, agregá una stat opcional al panel
  manteniendo el layout y los formatters (`formatMicroUsd`, `formatTokens`).
- No muestres micro-dólares crudos; formateá a USD.

### Fase 5 — Permisos y seed
- Reutilizá `ai:usage_read` / `ai:budget_manage`; asignálos al rol que corresponda
  en `apps/api/prisma/seed.ts` (org_admin ya los tiene). No dupliques permisos.

### Fase 6 — Tests
- Unit: `currentPeriod` (bordes UTC), `computePercentUsed`, `computeForecastMicroUsd`,
  hardStop (429 + incidente HARD_STOP), warning (incidente WARNING sin cortar),
  cuota de plan, `record` tolerante a fallos, presupuesto 0 = sin límite.
- Integración: el servicio del proceso llama `assertCanSpend` una vez y `record`
  una vez por llamada real, con tokens y costo correctos (proveedor mockeado).

### Fase 7 — Documentación
- Actualizá `CHANGELOG.md` y la doc de estado correspondiente. Si el proceso es
  nuevo, agregá su `feature` a la tabla de procesos gobernados.

## Parámetros
| Placeholder | Descripción | Ejemplo |
|---|---|---|
| {{PROCESO}} | Nombre humano del proceso | Importación de catálogo con OCR |
| {{FEATURE_KEY}} | Clave estable snake_case | `ocr_import` |
| {{UNIDAD}} | Qué se mide | páginas OCR / tokens / imágenes |
| {{ENTIDAD}} | Entidad dueña del gasto | `importJob` |
| {{PERMISO}} | Permiso existente del proceso | `catalog:write` |
| {{COSTO}} | Fórmula de costo | páginas × precio por página |
| {{ESTIMACION}} | MicroUSD estimado pre-llamada o `0` | `0` |

## Criterios de aceptación
- [ ] `assertCanSpend` se ejecuta antes de toda llamada al proveedor del proceso.
- [ ] `record` se ejecuta después de cada llamada real, con tokens/costo/latencia.
- [ ] El gasto aparece en `/panel/consumo-ia` en «Consumo por función» con su label.
- [ ] Con `hardStop` y presupuesto alcanzado, el proceso responde 429 y no llama al
      proveedor; queda un incidente `HARD_STOP` visible.
- [ ] Cruzar `alertPercent` genera `WARNING` sin cortar la generación.
- [ ] Sin presupuesto (`0`), rige la cuota del plan y el panel muestra «Sin límite».
- [ ] Un fallo del ledger no rompe el proceso (solo loguea).
- [ ] Un usuario sin `ai:usage_read` no ve el panel; sin `ai:budget_manage` no
      puede guardar el presupuesto (UI y API).
- [ ] Organización y usuario salen de la sesión, no del body.
- [ ] Tests unitarios e integración nuevos en verde.
- [ ] `pnpm lint`, `pnpm typecheck` y `pnpm test` pasan.
- [ ] Diff mínimo y aditivo; nada de secretos ni cambios de `.env`.

## Entregable
1. Resumen del proceso y del punto exacto de integración.
2. Diff lógico por capa (datos, contratos, API, web, tests).
3. Evidencia: salida de tests y captura/URL del panel mostrando el consumo del proceso.
4. Riesgos y qué quedó fuera de alcance.
```

## 3. Versión corta (para issues o agentes rápidos)

```text
Integrá el proceso «{{PROCESO}}» (feature `{{FEATURE_KEY}}`) al sistema de
gobernanza de consumo IA de este repo. Reglas: (1) `assertCanSpend` antes de
llamar al proveedor; (2) `record` después de cada llamada con tokens, costo en
microUSD, latencia, provider/model, promptTemplateKey/version y userId; (3) costo
con `computeCostMicroUsd`; (4) si hardStop y proyectado >= presupuesto → 429
AI_QUOTA_EXCEEDED + incidente HARD_STOP; al cruzar alertPercent → WARNING;
(5) presupuesto 0 = sin límite → cuota de tokens del plan; (6) el registro nunca
rompe el proceso; (7) org/user desde la sesión; (8) permisos ai:usage_read /
ai:budget_manage; (9) tests unitarios e integración. Reutilizá
`apps/api/src/modules/ai-governance` y el panel `/panel/consumo-ia`; no dupliques
lógica ni toques migraciones viejas. Dejá el gasto visible en «Consumo por
función» y verificá con `pnpm lint && pnpm typecheck && pnpm test`.
```

## 4. Ejemplos de aplicación

| Proceso | feature | Unidad / costo | Entidad |
|---|---|---|---|
| Contenido para redes | `social_post` | tokens texto | `socialPost` |
| Imágenes de contenido | `image` | costo del proveedor de imagen | `socialPost` |
| Importación con OCR/PDF | `ocr_import` | páginas × precio por página | `importJob` |
| Chat con IA | `ai_chat` | tokens entrada/salida | `chatConversation` |
| Rutina que resume consumo | `ai_digest` | 0 (solo lee el ledger) | `routine` |
| WhatsApp saliente (no IA) | `whatsapp_message` | mensajes × costo unitario | `whatsappMessage` |

> Para procesos sin tokens (OCR, mensajes, imágenes) registrá `tokensIn=0` y
> `tokensOut=0`, y poné el costo real en `costMicroUsd`; si necesitás contar
> unidades, agregá un campo opcional `units` al ledger con su migración.
