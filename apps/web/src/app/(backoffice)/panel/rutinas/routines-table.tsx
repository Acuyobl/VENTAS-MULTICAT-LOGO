'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import type { Routine, RoutineRun } from '@ventascatalogo/contracts';

const STATUS_LABELS: Record<RoutineRun['status'], string> = {
  RUNNING: 'En curso',
  SUCCEEDED: 'OK',
  FAILED: 'Falló',
  SKIPPED: 'Omitida',
};

const TIME_ZONE = 'America/Costa_Rica';

function formatMoment(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date);
}

function formatInterval(minutes: number): string {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Diaria' : `Cada ${days} días`;
  }
  if (minutes % 60 === 0) return `Cada ${minutes / 60} h`;
  return `Cada ${minutes} min`;
}

function statusClass(status: RoutineRun['status']): string {
  switch (status) {
    case 'SUCCEEDED':
      return 'badge--ok';
    case 'FAILED':
      return 'badge--danger';
    case 'SKIPPED':
      return 'badge--warn';
    default:
      return '';
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message ?? fallback;
}

interface RoutinesTableProps {
  initialItems: Routine[];
  canManage: boolean;
}

interface BusyState {
  id: string;
  action: 'toggle' | 'run';
}

export function RoutinesTable({ initialItems, canManage }: RoutinesTableProps) {
  const router = useRouter();
  const [items, setItems] = useState<Routine[]>(initialItems);
  const [busy, setBusy] = useState<BusyState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function toggle(routine: Routine) {
    setBusy({ id: routine.id, action: 'toggle' });
    setError(null);
    try {
      const response = await fetch(`/api/v1/routines/${routine.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'No pudimos actualizar la rutina.'));
      }
      const updated = (await response.json()) as Routine;
      setItems((previous) =>
        previous.map((item) => (item.id === routine.id ? updated : item)),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setBusy(null);
    }
  }

  async function runNow(routine: Routine) {
    setBusy({ id: routine.id, action: 'run' });
    setError(null);
    try {
      const response = await fetch(`/api/v1/routines/${routine.id}/run`, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'No pudimos ejecutar la rutina.'));
      }
      const run = (await response.json()) as RoutineRun;
      setItems((previous) =>
        previous.map((item) =>
          item.id === routine.id ? { ...item, lastRunAt: run.startedAt, lastRun: run } : item,
        ),
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setBusy(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <span className="empty__mark">∅</span>
        <h3>Todavía no hay rutinas</h3>
        <p>La próxima carga del panel siembra las rutinas por defecto de la organización.</p>
      </div>
    );
  }

  return (
    <>
      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Rutina</th>
              <th>Frecuencia</th>
              <th>Próxima</th>
              <th>Última ejecución</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((routine, index) => {
              const lastRun = routine.lastRun ?? null;
              const isBusy = busy?.id === routine.id;

              return (
                <tr key={routine.id} className="rise" style={{ '--i': index } as CSSProperties}>
                  <td>
                    <span className="table__primary">
                      <strong>{routine.name}</strong>
                      <span className="mono faint">{routine.key}</span>
                    </span>
                  </td>
                  <td>
                    <span className="stack" style={{ gap: '0.1rem' }}>
                      <strong style={{ fontSize: '0.9rem' }}>
                        {formatInterval(routine.intervalMinutes)}
                      </strong>
                      <span className="mono faint">{routine.intervalMinutes} min</span>
                    </span>
                  </td>
                  <td className="table__num">{formatMoment(routine.nextRunAt)}</td>
                  <td>
                    {lastRun ? (
                      <span className="stack" style={{ gap: '0.25rem' }}>
                        <span className={`badge ${statusClass(lastRun.status)}`}>
                          {STATUS_LABELS[lastRun.status]}
                        </span>
                        <span className="mono faint">
                          {formatMoment(lastRun.finishedAt ?? lastRun.startedAt)}
                        </span>
                        {lastRun.error ? (
                          <span className="field__error" title={lastRun.error}>
                            {truncate(lastRun.error, 60)}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="faint">Sin ejecuciones</span>
                    )}
                  </td>
                  <td>
                    {canManage ? (
                      <span className="inline" style={{ gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn--small btn--ghost"
                          disabled={isBusy}
                          onClick={() => void toggle(routine)}
                        >
                          {isBusy && busy?.action === 'toggle'
                            ? 'Guardando…'
                            : routine.enabled
                              ? 'Pausar'
                              : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--small btn--primary"
                          disabled={isBusy}
                          onClick={() => void runNow(routine)}
                        >
                          {isBusy && busy?.action === 'run' ? 'Ejecutando…' : 'Ejecutar ahora'}
                        </button>
                      </span>
                    ) : (
                      <span className="faint">Solo lectura</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
