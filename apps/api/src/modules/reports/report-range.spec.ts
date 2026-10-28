import { describe, expect, it } from 'vitest';
import { AppException } from '../../common/errors/app-exception';
import { localDateString, resolveReportRange } from './report-range';

describe('resolveReportRange', () => {
  // 2026-10-28T18:30:00Z = 2026-10-28 12:30 en Costa Rica (UTC-6).
  const now = new Date('2026-10-28T18:30:00.000Z');

  it('por defecto usa el mes actual en America/Costa_Rica', () => {
    const range = resolveReportRange({}, now);
    expect(range.from).toBe('2026-10-01');
    expect(range.to).toBe('2026-10-28');
    expect(range.timezone).toBe('America/Costa_Rica');
  });

  it('los bordes son inclusivos en hora de Costa Rica', () => {
    const range = resolveReportRange({ from: '2026-09-01', to: '2026-09-30' }, now);
    expect(range.start.toISOString()).toBe('2026-09-01T06:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-10-01T05:59:59.999Z');
  });

  it('un solo extremo se completa con los defaults del mes', () => {
    expect(resolveReportRange({ from: '2026-10-05' }, now)).toMatchObject({
      from: '2026-10-05',
      to: '2026-10-28',
    });
    expect(resolveReportRange({ to: '2026-10-10' }, now)).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-10',
    });
  });

  it('from > to es 422 y una fecha inválida también', () => {
    const inverted = (() => {
      try {
        resolveReportRange({ from: '2026-10-10', to: '2026-10-01' }, now);
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(inverted).toBeInstanceOf(AppException);
    expect((inverted as AppException).getStatus()).toBe(422);

    expect(() => resolveReportRange({ from: '2026-02-30' }, now)).toThrow(AppException);
    expect(() => resolveReportRange({ from: '2026-13-01' }, now)).toThrow(AppException);
  });

  it('localDateString respeta el huso de Costa Rica cerca de medianoche', () => {
    // 2026-01-01T03:00:00Z = 2025-12-31 21:00 en Costa Rica.
    expect(localDateString(new Date('2026-01-01T03:00:00.000Z'))).toBe('2025-12-31');
    expect(localDateString(new Date('2026-01-01T06:30:00.000Z'))).toBe('2026-01-01');
  });
});
