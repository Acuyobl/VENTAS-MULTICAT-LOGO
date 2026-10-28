import { AppException } from '../../common/errors/app-exception';

export const REPORT_TIMEZONE = 'America/Costa_Rica';
/** Costa Rica no aplica horario de verano: UTC-06:00 todo el año. */
const CR_OFFSET = '-06:00';

export interface ReportRangeInput {
  from?: string;
  to?: string;
}

export interface ResolvedReportRange {
  from: string;
  to: string;
  start: Date;
  end: Date;
  timezone: string;
}

/** Fecha YYYY-MM-DD en la zona de la organización. */
export function localDateString(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function assertValidDate(value: string, field: 'from' | 'to'): void {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppException('VALIDATION_FAILED', 422, { reason: 'invalid_date', field, value });
  }
}

export function startOfLocalDay(value: string): Date {
  return new Date(`${value}T00:00:00.000${CR_OFFSET}`);
}

export function endOfLocalDay(value: string): Date {
  return new Date(`${value}T23:59:59.999${CR_OFFSET}`);
}

/**
 * Rango por defecto: mes actual en America/Costa_Rica. Si `from > to` → 422.
 * Los bordes son inclusivos en la zona de Costa Rica.
 */
export function resolveReportRange(
  query: ReportRangeInput,
  now: Date = new Date(),
): ResolvedReportRange {
  const today = localDateString(now);
  const from = query.from ?? `${today.slice(0, 7)}-01`;
  const to = query.to ?? today;

  assertValidDate(from, 'from');
  assertValidDate(to, 'to');
  if (from > to) {
    throw new AppException('VALIDATION_FAILED', 422, {
      reason: 'invalid_range',
      from,
      to,
    });
  }

  return {
    from,
    to,
    start: startOfLocalDay(from),
    end: endOfLocalDay(to),
    timezone: REPORT_TIMEZONE,
  };
}
