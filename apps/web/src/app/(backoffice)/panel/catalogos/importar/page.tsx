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
            Subí el archivo, <em>nosotros lo entendemos</em>.
          </h1>
          <p>
            Creá un catálogo nuevo o actualizá uno existente. El analizador propone el mapeo, los
            campos extra y las columnas a ignorar; vos confirmás antes de importar.
          </p>
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
