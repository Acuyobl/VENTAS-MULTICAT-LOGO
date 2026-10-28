import type { Prisma } from '@prisma/client';
import {
  ORDER_NUMBER_PREFIX,
  QUOTE_NUMBER_PREFIX,
  businessNumberLockKey,
  businessYear,
  formatBusinessNumber,
  numberPrefix,
  parseBusinessNumber,
} from './numbering';

export type BusinessNumberKind = 'quote' | 'order';

const PREFIX: Record<BusinessNumberKind, string> = {
  quote: QUOTE_NUMBER_PREFIX,
  order: ORDER_NUMBER_PREFIX,
};

/**
 * Secuencia por organización y año con `pg_advisory_xact_lock`, para que dos
 * cotizaciones/pedidos concurrentes no obtengan el mismo número. El lock se
 * libera solo al terminar la transacción.
 */
export async function nextBusinessNumber(
  tx: Prisma.TransactionClient,
  kind: BusinessNumberKind,
  organizationId: string,
  now: Date = new Date(),
): Promise<string> {
  const year = businessYear(now);
  const lockKey = businessNumberLockKey(kind, organizationId, year);
  // `$executeRaw` (no `$queryRaw`): pg_advisory_xact_lock devuelve `void` y Prisma
  // no puede deserializar esa columna.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

  const prefix = numberPrefix(PREFIX[kind], year);
  const last =
    kind === 'quote'
      ? await tx.quote.findFirst({
          where: { organizationId, number: { startsWith: prefix } },
          orderBy: { createdAt: 'desc' },
          select: { number: true },
        })
      : await tx.order.findFirst({
          where: { organizationId, number: { startsWith: prefix } },
          orderBy: { createdAt: 'desc' },
          select: { number: true },
        });

  const lastSequence = last
    ? (parseBusinessNumber(last.number, PREFIX[kind], year)?.sequence ?? 0)
    : 0;
  return formatBusinessNumber(PREFIX[kind], year, lastSequence + 1);
}
