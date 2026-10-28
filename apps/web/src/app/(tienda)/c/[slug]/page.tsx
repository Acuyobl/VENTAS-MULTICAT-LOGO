import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import type { PublicCatalog } from '@/lib/types';
import { CatalogView } from '@/components/catalog-view';

export const dynamic = 'force-dynamic';

interface CatalogPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ categoria?: string }>;
}

async function loadCatalog(slug: string): Promise<PublicCatalog | null> {
  try {
    return await apiFetch<PublicCatalog>(`/catalogs/public/${encodeURIComponent(slug)}`, {
      authenticated: false,
    });
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 404) return null;
    throw caught;
  }
}

export async function generateMetadata({ params }: CatalogPageProps): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await loadCatalog(slug);
  return {
    title: catalog?.name ?? 'Catálogo',
    description: catalog?.description ?? 'Catálogo público de VentasCatálogo.',
  };
}

export default async function CatalogPage({ params, searchParams }: CatalogPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const catalog = await loadCatalog(slug);
  if (!catalog) notFound();

  return (
    <CatalogView
      catalog={catalog}
      category={query.categoria}
      basePath={`/c/${encodeURIComponent(slug)}`}
    />
  );
}
