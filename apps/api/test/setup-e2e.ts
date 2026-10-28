/**
 * Setup de los tests E2E.
 *
 * - `reflect-metadata` debe cargarse antes que cualquier módulo de NestJS para
 *   que `emitDecoratorMetadata` registre `design:paramtypes`.
 * - `LOG_LEVEL=silent`: los tests afirman sobre HTTP, no sobre logs. Esto evita
 *   que pino-pretty inunde la salida de Vitest.
 * - `NODE_ENV=test`: entorno declarado; las cookies se emiten sin `Secure`
 *   (solo se marca `Secure` en producción) para que Supertest las reenvíe por
 *   HTTP local.
 */
import 'reflect-metadata';

process.env.LOG_LEVEL ??= 'silent';
process.env.NODE_ENV ??= 'test';
