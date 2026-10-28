'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ProductListResponse,
  SocialPost,
  SocialPostListResponse,
} from '@ventascatalogo/contracts';
import type { CatalogSummary } from '@/lib/types';

interface ContentStudioProps {
  catalogs: CatalogSummary[];
  initialPosts: SocialPostListResponse['items'];
}

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'LINKEDIN'] as const;
const TONES = ['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM'] as const;
const GOALS = ['VENTAS', 'LANZAMIENTO', 'RECORDATORIO', 'EDUCATIVO'] as const;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  SCHEDULED: 'Programada',
  PUBLISHED: 'Publicada',
};

export function ContentStudio({ catalogs, initialPosts }: ContentStudioProps) {
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? '');
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>('INSTAGRAM');
  const [tone, setTone] = useState<(typeof TONES)[number]>('CERCANO');
  const [goal, setGoal] = useState<(typeof GOALS)[number]>('VENTAS');
  const [products, setProducts] = useState<ProductListResponse['items']>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [extra, setExtra] = useState('');
  const [posts, setPosts] = useState<SocialPost[]>(initialPosts);
  const [selected, setSelected] = useState<SocialPost | null>(initialPosts[0] ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!catalogId) return;
    void (async () => {
      try {
        const response = await fetch(`/api/v1/products?catalogId=${catalogId}&limit=100`, {
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error('No pudimos cargar los productos.');
        const page = (await response.json()) as ProductListResponse;
        setProducts(page.items);
        setProductIds([]);
      } catch {
        setProducts([]);
      }
    })();
  }, [catalogId]);

  const generate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (productIds.length === 0) {
        setError('Elegí al menos un producto.');
        return;
      }
      setLoading(true);
      setError(null);
      setNotice(null);
      try {
        const response = await fetch('/api/v1/ai/social-posts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            catalogId,
            platform,
            tone,
            goal,
            productIds,
            ...(extra.trim() ? { extraInstructions: extra.trim() } : {}),
          }),
        });
        const payload = (await response.json().catch(() => null)) as
          | SocialPost
          | { code?: string; message?: string }
          | null;
        if (!response.ok) {
          const code = (payload as { code?: string } | null)?.code;
          throw new Error(
            code === 'INTEGRATION_NOT_CONFIGURED'
              ? 'La IA no está configurada: agregá DEEPSEEK_API_KEY al entorno para generar contenido.'
              : ((payload as { message?: string } | null)?.message ?? 'No pudimos generar la publicación.'),
          );
        }
        const post = payload as SocialPost;
        setPosts((current) => [post, ...current]);
        setSelected(post);
        setNotice('Publicación generada. Revisala y aprobala o rechazala.');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Error inesperado.');
      } finally {
        setLoading(false);
      }
    },
    [catalogId, platform, tone, goal, productIds, extra],
  );

  async function decide(post: SocialPost, status: 'APPROVED' | 'REJECTED') {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ai/social-posts/${post.id}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const payload = (await response.json().catch(() => null)) as
        | SocialPost
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? 'No pudimos decidir.');
      }
      const updated = payload as SocialPost;
      setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelected(updated);
      setNotice(status === 'APPROVED' ? 'Publicación aprobada.' : 'Publicación rechazada.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  function toggleProduct(id: string) {
    setProductIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= 5
          ? current
          : [...current, id],
    );
  }

  return (
    <div className="bo-grid">
      <section className="panel">
        <div className="panel__head">
          <h2>Generar publicación</h2>
          <span className="mono faint">IA · prompt v3</span>
        </div>
        <form className="panel__body form-grid" onSubmit={generate}>
          <label className="field">
            <span className="field__label">Catálogo</span>
            <select
              className="select"
              value={catalogId}
              onChange={(event) => setCatalogId(event.target.value)}
            >
              {catalogs.map((catalog) => (
                <option key={catalog.id} value={catalog.id}>
                  {catalog.name}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field">
              <span className="field__label">Plataforma</span>
              <select
                className="select"
                value={platform}
                onChange={(event) => setPlatform(event.target.value as (typeof PLATFORMS)[number])}
              >
                {PLATFORMS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Tono</span>
              <select
                className="select"
                value={tone}
                onChange={(event) => setTone(event.target.value as (typeof TONES)[number])}
              >
                {TONES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Objetivo</span>
              <select
                className="select"
                value={goal}
                onChange={(event) => setGoal(event.target.value as (typeof GOALS)[number])}
              >
                {GOALS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="field">
            <span className="field__label">Productos (máximo 5)</span>
            <div className="stack" style={{ gap: '0.3rem', maxHeight: '11rem', overflow: 'auto' }}>
              {products.map((product) => (
                <label
                  key={product.id}
                  className="inline"
                  style={{ gap: '0.5rem', alignItems: 'center' }}
                >
                  <input
                    type="checkbox"
                    checked={productIds.includes(product.id)}
                    onChange={() => toggleProduct(product.id)}
                  />
                  <span style={{ fontSize: '0.82rem' }}>
                    {product.sku} · {product.name}
                  </span>
                </label>
              ))}
              {products.length === 0 ? <span className="mono faint">Sin productos.</span> : null}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Instrucciones extra (opcional)</span>
            <input
              className="input"
              value={extra}
              maxLength={300}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="Mencioná envío gratis, feria del sábado…"
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}

          <button type="submit" className="btn btn--wide" disabled={loading || !catalogId}>
            {loading ? 'Generando…' : 'Generar con IA'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Vista previa</h2>
          <span className="mono faint">{selected ? STATUS_LABEL[selected.status] : 'sin seleccionar'}</span>
        </div>
        {selected ? (
          <div className="panel__body stack" style={{ gap: '0.7rem' }}>
            <div>
              <span className="mono faint" style={{ fontSize: '0.68rem' }}>
                {selected.platform} · {selected.tone} · {selected.goal}
              </span>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem' }}>
                {selected.title}
              </h3>
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{selected.body}</p>
            <p className="mono faint" style={{ fontSize: '0.75rem' }}>
              {selected.hashtags.join(' ')}
            </p>
            <p style={{ fontSize: '0.85rem' }}>
              <strong>CTA:</strong> {selected.cta}
            </p>
            {selected.visualSuggestion ? (
              <p className="mono faint" style={{ fontSize: '0.72rem' }}>
                Visual sugerido: {selected.visualSuggestion}
              </p>
            ) : null}
            <p className="mono faint" style={{ fontSize: '0.68rem' }}>
              {selected.aiProvider} · {selected.aiModel} · {selected.tokensIn + selected.tokensOut}{' '}
              tokens
            </p>
            {selected.status === 'DRAFT' ? (
              <div className="inline" style={{ gap: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={loading}
                  onClick={() => void decide(selected, 'APPROVED')}
                >
                  Aprobar
                </button>
                <button
                  type="button"
                  className="thumb-remove"
                  disabled={loading}
                  onClick={() => void decide(selected, 'REJECTED')}
                >
                  Rechazar
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Sin publicaciones</h3>
            <p>Generá la primera desde el formulario.</p>
          </div>
        )}
      </section>

      {posts.length > 0 ? (
        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel__head">
            <h2>Publicaciones</h2>
            <span className="mono faint">{posts.length} generadas</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Plataforma</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td>{post.title}</td>
                    <td>{post.platform}</td>
                    <td>
                      <span className={post.status === 'APPROVED' ? 'badge badge--ok' : 'badge'}>
                        {STATUS_LABEL[post.status] ?? post.status}
                      </span>
                    </td>
                    <td className="mono faint">{post.createdAt.slice(0, 10)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => setSelected(post)}
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
