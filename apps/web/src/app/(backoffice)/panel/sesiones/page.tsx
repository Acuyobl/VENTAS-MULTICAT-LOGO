import type { Metadata } from 'next';
import { tryApiFetch } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { SessionSummary } from '@/lib/types';
import { RevokeSessionButton } from './session-actions';

export const metadata: Metadata = {
  title: 'Sesiones',
};

export const dynamic = 'force-dynamic';

export default async function SessionsPage() {
  const sessions = await tryApiFetch<{ items: SessionSummary[] }>('/auth/sessions');
  const items = sessions?.items ?? [];

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Refresh rotation · F0</span>
          <h1 className="display">
            Cada llave, <em>contada</em>.
          </h1>
          <p>
            Cada refresh token rota en cada uso. Si uno viejo reaparece, la familia completa se
            revoca. Desde acá podés cortar una sesión por dispositivo.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{items.length}</strong>
          <span>sesiones vigentes</span>
        </div>
      </header>

      <section className="panel">
        <div className="panel__head">
          <h2>Sesiones abiertas</h2>
          <span className="mono faint">staff + customer</span>
        </div>

        {items.length > 0 ? (
          <div className="session-list">
            {items.map((session) => (
              <div className="session-row" key={session.id}>
                <span className="session-row__icon">{session.audience === 'STAFF' ? 'ST' : 'CU'}</span>
                <span className="stack" style={{ gap: '0.2rem' }}>
                  <strong style={{ fontSize: '0.9rem' }}>
                    {session.deviceName ?? 'Dispositivo sin nombre'}
                  </strong>
                  <span className="session-row__meta">
                    <span>{session.userAgent?.slice(0, 48) ?? 'Sin user-agent'}</span>
                    <span>IP {session.ip ?? '—'}</span>
                    <span>Creada {formatDate(session.createdAt)}</span>
                    <span>Expira {formatDate(session.expiresAt)}</span>
                  </span>
                </span>
                <RevokeSessionButton sessionId={session.id} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>No hay sesiones visibles</h3>
            <p>Iniciá sesión de nuevo o revisá la conexión con la API.</p>
          </div>
        )}

        <div className="panel__foot">
          Revocar una sesión invalida el refresh; el access token expira solo en 15 minutos.
        </div>
      </section>
    </div>
  );
}
