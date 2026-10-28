import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDate, formatRole } from '@/lib/format';
import type {
  CatalogSummary,
  MembersResponse,
  ReadinessResponse,
} from '@/lib/types';

export const metadata: Metadata = {
  title: 'Resumen',
};

export const dynamic = 'force-dynamic';

export default async function PanelPage() {
  const user = await getSession();
  const [catalogs, members, readiness] = await Promise.all([
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
    tryApiFetch<MembersResponse>('/users'),
    tryApiFetch<ReadinessResponse>('/health/ready'),
  ]);

  const catalogItems = catalogs?.items ?? [];
  const productTotal = catalogItems.reduce((total, catalog) => total + catalog.productCount, 0);
  const teamTotal = members?.items.length ?? 0;
  const checks = readiness?.checks ?? {};
  const infrastructureOk =
    checks.database === 'up' && checks.redis === 'up' && checks.storage === 'up';

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Fundaciones · F0</span>
          <h1 className="display">
            Todo en <em>orden</em>.
          </h1>
          <p>
            Este es el cuarto de máquinas de {user?.organizationName}. Desde acá se cuida el
            catálogo, se invita al equipo y se revisan las sesiones abiertas.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{productTotal}</strong>
          <span>productos publicados</span>
        </div>
      </header>

      <section className="stat-grid" aria-label="Indicadores">
        <div className="stat rise" style={{ '--i': 0 } as CSSProperties}>
          <span className="stat__label">Catálogos</span>
          <span className="stat__value">{catalogItems.length}</span>
          <span className="stat__meta">Con versión activa y alcance por organización.</span>
        </div>
        <div className="stat rise" style={{ '--i': 1 } as CSSProperties}>
          <span className="stat__label">Productos</span>
          <span className="stat__value">{productTotal}</span>
          <span className="stat__meta">Precios en CRC, IVA incluido en el catálogo demo.</span>
        </div>
        <div className="stat rise" style={{ '--i': 2 } as CSSProperties}>
          <span className="stat__label">Equipo</span>
          <span className="stat__value">{teamTotal || '—'}</span>
          <span className="stat__meta">
            {members ? 'Miembros activos e invitados pendientes.' : 'Requiere permiso user:manage.'}
          </span>
        </div>
        <div className="stat rise" style={{ '--i': 3 } as CSSProperties}>
          <span className="stat__label">Infraestructura</span>
          <span className="stat__value" style={{ color: infrastructureOk ? 'var(--ok)' : 'var(--coral)' }}>
            {readiness ? (infrastructureOk ? 'OK' : '!') : '—'}
          </span>
          <span className="stat__meta">
            {readiness
              ? `DB ${checks.database ?? '?'} · Redis ${checks.redis ?? '?'} · MinIO ${checks.storage ?? '?'}`
              : 'No se pudo consultar /health/ready.'}
          </span>
        </div>
      </section>

      <div className="bo-grid">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2>Catálogos</h2>
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                Cada catálogo es una unidad de negocio aislada.
              </p>
            </div>
            <Link className="btn btn--small btn--secondary" href="/panel/catalogos">
              Ver todos
            </Link>
          </div>
          {catalogItems.length > 0 ? (
            <div className="catalog-list">
              {catalogItems.map((catalog) => (
                <Link
                  className="catalog-row"
                  href={`/panel/productos?catalogo=${catalog.id}`}
                  key={catalog.id}
                >
                  <span className="catalog-row__mark" aria-hidden>
                    {catalog.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="catalog-row__name">{catalog.name}</span>
                    <span className="catalog-row__meta" style={{ display: 'block' }}>
                      v{catalog.activeVersionNumber ?? '—'} · {catalog.currency} · actualizado{' '}
                      {formatDate(catalog.updatedAt)}
                    </span>
                  </span>
                  <span className="catalog-row__count">
                    {catalog.productCount}
                    <small>productos</small>
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">
              <span className="empty__mark">∅</span>
              <h3>Todavía no hay catálogos</h3>
              <p>
                Corré <code>pnpm db:seed</code> para crear el catálogo demo con 12 productos.
              </p>
            </div>
          )}
          <div className="panel__foot">La importación desde Drive llega en F1.</div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel__head">
              <h2>Tu contexto</h2>
              <span className="badge badge--ink">{user?.audience}</span>
            </div>
            <div className="panel__body stack" style={{ gap: '0.8rem' }}>
              <div>
                <span className="mono faint">Organización</span>
                <p style={{ fontWeight: 600 }}>{user?.organizationName}</p>
              </div>
              <div>
                <span className="mono faint">Roles</span>
                <div className="chip-row" style={{ marginTop: '0.35rem' }}>
                  {user?.roleKeys.map((role) => (
                    <span className="badge" key={role}>
                      {formatRole(role)}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="mono faint">Permisos atómicos</span>
                <p className="mono" style={{ marginTop: '0.35rem' }}>
                  {user?.permissions.length ?? 0} concedidos
                </p>
              </div>
              <div>
                <span className="mono faint">Segundo factor</span>
                <p style={{ marginTop: '0.2rem' }}>
                  <span className={`badge ${user?.mfaEnabled ? 'badge--ok' : 'badge--warn'}`}>
                    {user?.mfaEnabled ? 'TOTP activo' : 'Pendiente'}
                  </span>
                </p>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Fundaciones</h2>
              <span className="mono faint">F0</span>
            </div>
            <div className="panel__body">
              <ul className="check-list">
                <li>
                  <span className="check-list__dot">✓</span>
                  <span>Monorepo y contratos compartidos</span>
                </li>
                <li>
                  <span className="check-list__dot">✓</span>
                  <span>Dos audiencias con cookies separadas</span>
                </li>
                <li>
                  <span className="check-list__dot">✓</span>
                  <span>RBAC por organización y catálogo</span>
                </li>
                <li>
                  <span className={`check-list__dot ${infrastructureOk ? '' : 'check-list__dot--pending'}`}>
                    {infrastructureOk ? '✓' : '·'}
                  </span>
                  <span>Salud de Postgres, Redis y MinIO</span>
                </li>
                <li>
                  <span className={`check-list__dot ${user?.mfaEnabled ? '' : 'check-list__dot--pending'}`}>
                    {user?.mfaEnabled ? '✓' : '·'}
                  </span>
                  <span>MFA del administrador</span>
                </li>
              </ul>
            </div>
            <div className="panel__foot">Meta F0: CI verde y demo de las dos caras.</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
