import type { Metadata } from 'next';
import Link from 'next/link';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { CatalogSummary } from '@/lib/types';
import { DeleteCatalogButton } from '@/components/backoffice/delete-catalog-button';
import { RenameCatalogButton } from '@/components/backoffice/rename-catalog-button';

export const metadata: Metadata = {
  title: 'Catálogos',
};

export const dynamic = 'force-dynamic';

export default async function CatalogsPage() {
  const [catalogs, session] = await Promise.all([
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
    getSession(),
  ]);
  const items = catalogs?.items ?? [];
  const canWrite = session?.permissions.includes('catalog:write') ?? false;

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Catálogos y versiones</span>
          <h1 className="display">
            Una casa, varios <em>mundos</em>.
          </h1>
          <p>
            Cada catálogo tiene versiones inmutables y una versión activa. Los productos se
            consultan siempre contra la versión activa, con el alcance del usuario.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{items.length}</strong>
          <span>catálogos en la organización</span>
          <Link className="btn btn--small" href="/panel/catalogos/importar">
            Cargar catálogo
          </Link>
        </div>
      </header>

      <div className="bo-grid">
        <section className="panel">
          <div className="panel__head">
            <h2>Inventario de catálogos</h2>
            <span className="mono faint">Activo = publicado</span>
          </div>
          {items.length > 0 ? (
            <div className="catalog-list">
              {items.map((catalog) => (
                <div className="catalog-row" key={catalog.id}>
                  <span className="catalog-row__mark" aria-hidden>
                    {catalog.name.slice(0, 1)}
                  </span>
                  <span>
                    <span className="catalog-row__name">{catalog.name}</span>
                    <span className="catalog-row__meta" style={{ display: 'block' }}>
                      /{catalog.slug} · v{catalog.activeVersionNumber ?? '—'}{' '}
                      {catalog.activeVersionId ? '(publicada)' : '(borrador)'} ·{' '}
                      {catalog.currency} · {formatDate(catalog.updatedAt)}
                    </span>
                    <span className="inline" style={{ marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <Link className="btn btn--small" href={`/panel/catalogos/${catalog.id}`}>
                        Versiones e importar
                      </Link>
                      <Link
                        className="btn btn--small btn--secondary"
                        href={`/panel/productos?catalogo=${catalog.id}`}
                      >
                        Productos ({catalog.productCount})
                      </Link>
                      <a
                        className="btn btn--small btn--ghost"
                        href={`/c/${catalog.slug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver tienda ↗
                      </a>
                      <RenameCatalogButton
                        catalogId={catalog.id}
                        catalogName={catalog.name}
                        currentSlug={catalog.slug}
                        canWrite={canWrite}
                      />
                      <DeleteCatalogButton
                        catalogId={catalog.id}
                        catalogName={catalog.name}
                        canWrite={canWrite}
                      />
                    </span>
                  </span>
                  <span className="catalog-row__count">
                    {catalog.productCount}
                    <small>productos</small>
                  </span>
                </div>
              ))}
            </div>
          ) : catalogs === null ? (
            <div className="empty">
              <span className="empty__mark">⚠️</span>
              <h3>Servidor API desconectado</h3>
              <p>
                No pudimos conectar con el servidor backend en <code>http://localhost:3001</code>.
                Asegurate de que <code>pnpm dev</code> esté corriendo en tu terminal.
              </p>
            </div>
          ) : (
            <div className="empty">
              <span className="empty__mark">∅</span>
              <h3>No hay catálogos creados todavía</h3>
              <p>
                Podés crear uno nuevo subiendo cualquier archivo (Excel, CSV, PDF, texto) desde
                el botón «Cargar catálogo».
              </p>
              <div style={{ marginTop: '1rem' }}>
                <Link className="btn btn--small" href="/panel/catalogos/importar">
                  Cargar mi primer catálogo →
                </Link>
              </div>
            </div>
          )}
          <div className="panel__foot">
            Importación universal (CSV, XLSX, PDF, JSON, TXT) con cuarentena, versionado y activación
            ya disponibles. Google Drive llega con credenciales OAuth.
          </div>
        </section>

        <aside className="stack">
          <section className="panel">
            <div className="panel__head">
              <h2>Cómo se aísla</h2>
            </div>
            <div className="panel__body stack" style={{ gap: '1rem', fontSize: '0.84rem' }}>
              <p>
                <strong>Organización:</strong> el token lleva <code>org</code> y el servidor
                vuelve a comprobar membership o cuenta de cliente.
              </p>
              <p>
                <strong>Catálogo:</strong> la API exige <code>catalogId</code> explícito y resuelve
                la versión activa para cada listado.
              </p>
              <p>
                <strong>Rol:</strong> los permisos se evalúan por asignación y scope, no por un
                campo booleano en el usuario.
              </p>
            </div>
            <div className="panel__foot">Regla de oro: nada se consulta sin organizationId.</div>
          </section>
        </aside>
      </div>
    </div>
  );
}
