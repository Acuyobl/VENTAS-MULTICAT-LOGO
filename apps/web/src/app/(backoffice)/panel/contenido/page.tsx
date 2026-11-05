import type { Metadata } from 'next';
import type { SocialPostListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import type { CatalogSummary } from '@/lib/types';
import { ContentStudio } from '@/components/backoffice/content-studio';

export const metadata: Metadata = {
  title: 'Contenido',
};

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const [catalogs, posts] = await Promise.all([
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
    tryApiFetch<SocialPostListResponse>('/ai/social-posts?limit=20'),
  ]);

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Contenido · IA</span>
          <h1 className="display">
            Publicar sin <em>bloqueo</em>.
          </h1>
          <p>
            Elegí productos del catálogo, plataforma y tono: la IA redacta la publicación con
            gancho, cuerpo, CTA y hashtags. Queda en borrador hasta que la apruebes.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{posts?.items.length ?? 0}</strong>
          <span>publicaciones generadas</span>
        </div>
      </header>

      <ContentStudio catalogs={catalogs?.items ?? []} initialPosts={posts?.items ?? []} />
    </div>
  );
}
