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
          <span className="eyebrow">El catálogo como llegue</span>
          <h1 className="display">
            Subí tu catálogo <em>como sea</em>.
          </h1>
          <p>
            Excel, PDF, foto o WhatsApp: el agente lo convierte en un catálogo vendible, publicable
            y cobrable — sin que toques una columna. Hoy entran Excel, CSV, PDF (con texto), JSON,
            TSV y TXT; foto y WhatsApp vienen en camino.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{productTotal}</strong>
          <span>productos publicados</span>
        </div>
      </header>

      <section className="ingest-grid" aria-label="Formas de cargar un catálogo">
        <Link className="ingest-card ingest-card--ready" href="/panel/catalogos/importar">
          <span className="eyebrow">Excel / CSV / PDF / JSON</span>
          <strong>Subilo y listo</strong>
          <p>
            CSV, XLSX, PDF con texto, JSON, TSV y TXT, incluidas hojas de pedido. El agente propone
            mapeo, campos extra y precio.
          </p>
          <span className="badge badge--ok">Disponible</span>
        </Link>
        <article className="ingest-card ingest-card--ready">
          <span className="eyebrow">PDF</span>
          <strong>Factura o tabla</strong>
          <p>
            Extrae el texto del PDF y arma la tabla automáticamente. Los PDF escaneados (solo
            imagen) necesitan OCR: en camino.
          </p>
          <span className="badge badge--ok">Disponible (texto)</span>
        </article>
        <article className="ingest-card">
          <span className="eyebrow">Foto</span>
          <strong>Lista escrita</strong>
          <p>OCR y visión para leer precios, medidas y nombres desde una foto del cuaderno.</p>
          <span className="badge">En camino</span>
        </article>
        <article className="ingest-card">
          <span className="eyebrow">WhatsApp</span>
          <strong>Mandalo por chat</strong>
          <p>Recibí el archivo o la foto por WhatsApp y el agente lo deja cargado.</p>
          <span className="badge">En camino</span>
        </article>
      </section>

      <p className="mono faint" style={{ margin: '-0.4rem 0 1.2rem', fontSize: '0.72rem' }}>
        La promesa completa: subí tu catálogo como sea y el agente lo deja vendible, publicable y
        cobrable, sin tocar una columna.
      </p>

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
