import type { Metadata } from 'next';
import type { CatalogSummary } from '@/lib/types';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { ImportHub } from '@/components/backoffice/import-hub';

export const metadata: Metadata = {
  title: 'Cargar catálogo',
};

export const dynamic = 'force-dynamic';

export default async function ImportCatalogPage() {
  const [session, catalogs] = await Promise.all([
    getSession(),
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
  ]);
  const canWrite = session?.permissions.includes('catalog:write') ?? false;

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Catálogos · carga guiada</span>
          <h1 className="display">
            Subí tu catálogo <em>como sea</em>.
          </h1>
          <p>
            Excel, PDF, foto o WhatsApp: el agente lo convierte en un catálogo vendible, publicable
            y cobrable — sin que toques una columna. Hoy entran Excel y CSV (incluidas hojas de
            pedido); PDF, foto y WhatsApp vienen en camino.
          </p>
          <div className="chip-row" style={{ marginTop: '0.6rem' }}>
            <span className="badge badge--ok">Excel / CSV · disponible</span>
            <span className="badge">PDF · en camino</span>
            <span className="badge">Foto · en camino</span>
            <span className="badge">WhatsApp · en camino</span>
          </div>
        </div>
        <div className="page-head__aside">
          <strong>{catalogs?.items.length ?? 0}</strong>
          <span>catálogos disponibles</span>
        </div>
      </header>

      <ImportHub catalogs={catalogs?.items ?? []} canWrite={canWrite} />
    </div>
  );
}
