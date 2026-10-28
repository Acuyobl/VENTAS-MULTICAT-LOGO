import type { Metadata } from 'next';
import Link from 'next/link';
import { tryApiFetch } from '@/lib/api';
import type { PublicCatalog } from '@/lib/types';
import { CatalogView } from '@/components/catalog-view';

export const metadata: Metadata = {
  title: 'Tienda',
};

export const dynamic = 'force-dynamic';

interface StorePageProps {
  searchParams: Promise<{ categoria?: string }>;
}

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_CATALOG_SLUG ?? 'catalogo-demo';

export default async function StorePage({ searchParams }: StorePageProps) {
  const params = await searchParams;
  const catalog = await tryApiFetch<PublicCatalog>(`/catalogs/public/${DEMO_SLUG}`);

  if (!catalog) {
    return (
      <>
        <section className="store-hero">
          <div className="stack">
            <span className="eyebrow">Tienda pública</span>
            <h1 className="store-hero__title display">
              El catálogo
              <br />
              está en el <em>horno</em>.
            </h1>
          </div>
          <aside className="store-hero__aside">
            <p>
              No encontramos un catálogo activo con el slug <code>{DEMO_SLUG}</code>. Corré el
              seed y volvé a cargar esta página.
            </p>
            <Link className="btn" href="/">
              Volver al inicio
            </Link>
          </aside>
        </section>
        <div className="store-strip">
          <span>PostgreSQL</span>
          <span>Prisma</span>
          <span>Seed idempotente</span>
        </div>
        <section className="catalog-section">
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Todavía no hay nada que mostrar</h3>
            <p>
              Ejecutá <code>pnpm db:seed</code> para crear «Catálogo Demo» con 12 productos y una
              versión activa.
            </p>
          </div>
        </section>
      </>
    );
  }

  return <CatalogView catalog={catalog} category={params.categoria} basePath="/tienda" />;
}
