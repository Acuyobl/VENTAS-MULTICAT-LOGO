import type { Metadata } from 'next';
import type { RoutineListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { RoutinesTable } from './routines-table';

export const metadata: Metadata = {
  title: 'Rutinas',
};

export const dynamic = 'force-dynamic';

export default async function RoutinesPage() {
  const [routines, session] = await Promise.all([
    tryApiFetch<RoutineListResponse>('/routines'),
    getSession(),
  ]);
  const items = routines?.items ?? [];
  const paused = items.filter((routine) => !routine.enabled).length;
  const canManage = session?.permissions.includes('routine:manage') ?? false;

  if (!routines) {
    return (
      <div>
        <header className="page-head">
          <div>
            <span className="eyebrow">Sistema · rutinas</span>
            <h1 className="display">
              El sistema <em>trabaja solo</em>.
            </h1>
            <p>
              Tu rol actual no incluye <code>routine:read</code>. Pedile a un administrador de la
              organización que te asigne el permiso.
            </p>
          </div>
        </header>
        <div className="empty">
          <span className="empty__mark">403</span>
          <h3>Permiso insuficiente</h3>
          <p>La API respondió con un alcance menor al necesario para listar las rutinas.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Sistema · rutinas</span>
          <h1 className="display">
            El sistema <em>trabaja solo</em>.
          </h1>
          <p>
            Rutinas programadas por organización: resumen de consumo de IA, limpieza de
            importaciones viejas y vencimiento de cotizaciones. El scheduler las ejecuta en proceso
            cuando vencen, o podés adelantar una con “Ejecutar ahora”.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{items.length}</strong>
          <span>
            rutinas · {paused} pausada{paused === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>Rutinas programadas</h2>
          <span className="mono faint">{items.length} registros</span>
        </div>

        <RoutinesTable initialItems={items} canManage={canManage} />

        <div className="panel__foot">
          {canManage
            ? 'Activar o pausar reprograma la próxima ejecución según la frecuencia. Una ejecución manual no cambia el estado de la rutina.'
            : 'Tu rol puede ver las rutinas pero no administrarlas: falta el permiso routine:manage.'}
        </div>
      </section>
    </div>
  );
}
