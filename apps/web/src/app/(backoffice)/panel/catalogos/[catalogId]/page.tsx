import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CatalogVersionSummary } from '@ventascatalogo/contracts';
import { ApiError, apiFetch, tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { CatalogSummary } from '@/lib/types';
import { VersionsPanel } from '@/components/backoffice/versions-panel';
import { ImportPanel } from '@/components/backoffice/import-panel';

export const metadata: Metadata = {
  title: 'Catálogo',
};

export const dynamic = 'force-dynamic';

interface CatalogDetailPageProps {
  params: Promise<{ catalogId: string }>;
}

export default async function CatalogDetailPage({ params }: CatalogDetailPageProps) {
  const { catalogId } = await params;
  const catalogs = await tryApiFetch<{ items: CatalogSummary[] }>('/catalogs');
  const catalog = catalogs?.items.find((item) => item.id === catalogId) ?? null;
  if (!catalog) notFound();

  let versions: CatalogVersionSummary[] = [];
  let loadError: string | null = null;
  try {
    const page = await apiFetch<{ items: CatalogVersionSummary[] }>(
      `/catalogs/${catalogId}/versions`,
    );
    versions = page.items;
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) notFound();
    loadError = caught instanceof Error ? caught.message : 'No pudimos leer las versiones.';
  }

  const session = await getSession();
  const canWrite = session?.permissions.includes('catalog:write') ?? false;
  const active = versions.find((version) => version.isActive) ?? null;
  const totalProducts = versions.reduce((sum, version) => sum + version.productCount, 0);

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Catálogo · versiones e importación</span>
          <h1 className="display">{catalog.name}</h1>
          <p>
            /{catalog.slug} · {catalog.description ?? 'Sin descripción'} ·{' '}
            {active ? `versión activa v${active.versionNumber}` : 'sin versión activa'} ·{' '}
            {catalog.currency}
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{active?.productCount ?? 0}</strong>
          <span>productos en la versión activa</span>
        </div>
      </header>

      <div className="filter-row" style={{ marginBottom: '1.2rem' }}>
        <Link className="btn btn--small btn--secondary" href={`/panel/productos?catalogo=${catalog.id}`}>
          Ver productos
        </Link>
        <Link className="btn btn--small btn--ghost" href="/panel/catalogos">
          ← Volver a catálogos
        </Link>
        <a
          className="btn btn--small btn--ghost"
          href={`/c/${catalog.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Catálogo público ↗
        </a>
        <span className="mono faint">
          {versions.length} versiones · {totalProducts} productos históricos
        </span>
      </div>

      {loadError ? (
        <div className="alert" style={{ marginBottom: '1.2rem' }}>
          {loadError}
        </div>
      ) : null}

      <div className="bo-grid">
        <div className="stack">
          <VersionsPanel catalogId={catalog.id} versions={versions} canWrite={canWrite} />
          <ImportPanel catalogId={catalog.id} canWrite={canWrite} />
        </div>

        <aside className="stack">
          <section className="panel">
            <div className="panel__head">
              <h2>Cómo funciona el versionado</h2>
            </div>
            <div className="panel__body stack" style={{ gap: '1rem', fontSize: '0.84rem' }}>
              <p>
                <strong>Importar</strong> crea una versión <code>VALIDATED</code> con productos,
                cuarentena y checksum SHA-256.
              </p>
              <p>
                <strong>Activar</strong> mueve el puntero <code>activeVersionId</code>: la versión
                anterior queda <code>ARCHIVED</code> y no se tocan los pedidos históricos.
              </p>
              <p>
                <strong>Idempotencia</strong>: el mismo archivo no crea una versión nueva; devuelve
                la existente.
              </p>
              <p>
                <strong>Cuarentena</strong>: las filas con SKU duplicado o precio vacío no crean
                producto; se descargan en CSV para corregirlas.
              </p>
            </div>
            <div className="panel__foot">
              Regla R3: activar nunca modifica registros pasados.
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h2>Última actividad</h2>
            </div>
            <div className="panel__body stack" style={{ gap: '0.6rem', fontSize: '0.84rem' }}>
              {versions.slice(0, 3).map((version) => (
                <p key={version.id} className="mono faint">
                  v{version.versionNumber} · {version.status} ·{' '}
                  {formatDate(version.importedAt ?? version.createdAt)}
                </p>
              ))}
              {versions.length === 0 ? <p className="mono faint">Sin importaciones todavía.</p> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
