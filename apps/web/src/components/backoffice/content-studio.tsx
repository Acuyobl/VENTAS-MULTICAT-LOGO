'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  ProductListResponse,
  SocialPost,
  SocialPostListResponse,
} from '@ventascatalogo/contracts';
import type { CatalogSummary } from '@/lib/types';
import { formatMoney } from '@/lib/format';

interface ContentStudioProps {
  catalogs: CatalogSummary[];
  initialPosts: SocialPostListResponse['items'];
}

const PLATFORMS = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'LINKEDIN'] as const;
const TONES = ['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM'] as const;
const GOALS = ['VENTAS', 'LANZAMIENTO', 'RECORDATORIO', 'EDUCATIVO'] as const;
const IMAGE_DESIGNS = [
  { key: 'CLASICA', label: 'Clásica', icon: '📸', desc: 'Estudio limpio' },
  { key: 'EDITORIAL', label: 'Editorial', icon: '🎨', desc: 'Estilo revista' },
  { key: 'PROMO', label: 'Promo', icon: '🏷️', desc: 'Oferta y precio' },
] as const;

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
  const [productSearch, setProductSearch] = useState('');
  const [extra, setExtra] = useState('');

  const [imagePrompt, setImagePrompt] = useState('');
  const [selectedDesign, setSelectedDesign] = useState<'CLASICA' | 'EDITORIAL' | 'PROMO'>('CLASICA');
  const [imageBusy, setImageBusy] = useState(false);

  const [posts, setPosts] = useState<SocialPost[]>(initialPosts);
  const [selected, setSelected] = useState<SocialPost | null>(initialPosts[0] ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Estados interactivos para Mockup y Acciones Rápidas
  const [previewTab, setPreviewTab] = useState<'AUTO' | 'INSTAGRAM' | 'WHATSAPP' | 'RAW'>('AUTO');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editCta, setEditCta] = useState('');
  const [editHashtags, setEditHashtags] = useState('');

  const currentCatalog = useMemo(
    () => catalogs.find((c) => c.id === catalogId) ?? catalogs[0],
    [catalogs, catalogId],
  );

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
        setProductSearch('');
      } catch {
        setProducts([]);
      }
    })();
  }, [catalogId]);

  // Sincronizar campos de edición al cambiar el post seleccionado
  useEffect(() => {
    if (selected) {
      setEditTitle(selected.title);
      setEditBody(selected.body);
      setEditCta(selected.cta);
      setEditHashtags(selected.hashtags.join(' '));
      setIsEditing(false);
    }
  }, [selected?.id]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase().trim();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)),
    );
  }, [products, productSearch]);

  const selectedProducts = useMemo(
    () => products.filter((p) => productIds.includes(p.id)),
    [products, productIds],
  );

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
              : ((payload as { message?: string } | null)?.message ??
                  'No pudimos generar la publicación.'),
          );
        }
        const post = payload as SocialPost;
        setPosts((current) => [post, ...current]);
        setSelected(post);
        setNotice('¡Publicación generada! Podés previsualizarla, copiarla o editarla.');
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

  async function generateImage() {
    if (!selected) return;
    setImageBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/ai/social-posts/${selected.id}/image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...(imagePrompt.trim() ? { prompt: imagePrompt.trim() } : {}),
          design: selectedDesign,
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
            ? 'La generación de imágenes no está configurada (IMAGE_PROVIDER/OPENAI_API_KEY).'
            : ((payload as { message?: string } | null)?.message ??
                'No pudimos generar la imagen.'),
        );
      }
      const updated = payload as SocialPost;
      setPosts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelected(updated);
      setNotice('Imagen generada con éxito con estilo ' + selectedDesign + '.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setImageBusy(false);
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

  // Generar texto para el portapapeles o WhatsApp
  function compilePostText(isWa = false) {
    if (!selected) return '';
    if (isWa) {
      return `*${selected.title}*\n\n${selected.body}\n\n👉 *${selected.cta}*\n\n${selected.hashtags.join(' ')}`.trim();
    }
    return `${selected.title}\n\n${selected.body}\n\n${selected.cta}\n\n${selected.hashtags.join(' ')}`.trim();
  }

  async function handleCopy() {
    if (!selected) return;
    const isWa =
      previewTab === 'WHATSAPP' || (previewTab === 'AUTO' && selected.platform === 'WHATSAPP');
    const text = compilePostText(isWa);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('No se pudo copiar automáticamente.');
    }
  }

  function handleOpenWhatsApp() {
    if (!selected) return;
    const text = compilePostText(true);
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  function handleSaveEdit() {
    if (!selected) return;
    const tags = editHashtags
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));

    const updated: SocialPost = {
      ...selected,
      title: editTitle.trim() || selected.title,
      body: editBody.trim() || selected.body,
      cta: editCta.trim() || selected.cta,
      hashtags: tags.length > 0 ? tags : selected.hashtags,
    };

    setSelected(updated);
    setPosts((curr) => curr.map((p) => (p.id === updated.id ? updated : p)));
    setIsEditing(false);
    setNotice('Cambios aplicados localmente a la publicación.');
  }

  // Determinar qué mockup mostrar
  const activeMockup =
    previewTab === 'AUTO'
      ? selected?.platform === 'WHATSAPP'
        ? 'WHATSAPP'
        : 'INSTAGRAM'
      : previewTab;

  return (
    <div className="bo-grid">
      {/* ------------------------------------------------------------- */}
      {/* PANEL IZQUIERDO: Generador de Publicación                      */}
      {/* ------------------------------------------------------------- */}
      <section className="panel">
        <div className="panel__head">
          <div>
            <h2>Generar publicación</h2>
            <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
              La IA adaptará el gancho y el llamado a la acción.
            </p>
          </div>
          <span className="mono faint">IA v3</span>
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
                  {catalog.name} ({catalog.currency})
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

          {/* Selector visual de productos con buscador */}
          <div className="field content-product-picker">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="field__label" style={{ margin: 0 }}>
                Productos a destacar ({productIds.length}/5)
              </span>
              {productIds.length > 0 ? (
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--coral)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => setProductIds([])}
                >
                  Limpiar selección
                </button>
              ) : null}
            </div>

            {/* Chips de productos seleccionados */}
            {selectedProducts.length > 0 ? (
              <div className="content-selected-chips">
                {selectedProducts.map((p) => (
                  <span key={p.id} className="content-chip">
                    {p.name.slice(0, 18)}
                    {p.name.length > 18 ? '…' : ''}
                    <button
                      type="button"
                      className="content-chip__close"
                      onClick={() => toggleProduct(p.id)}
                      aria-label="Desmarcar"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {/* Buscador de productos */}
            <div className="content-product-search">
              <span className="content-product-search__icon">🔍</span>
              <input
                className="input"
                type="text"
                placeholder="Buscar por nombre, SKU o categoría…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
            </div>

            {/* Lista interactiva de productos */}
            <div className="content-product-list">
              {filteredProducts.map((product) => {
                const isChecked = productIds.includes(product.id);
                return (
                  <div
                    key={product.id}
                    className="content-product-row"
                    data-checked={isChecked}
                    onClick={() => toggleProduct(product.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}} // controlado por el onClick del row
                    />
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="content-product-thumb"
                      />
                    ) : (
                      <div className="content-product-thumb content-product-thumb--placeholder">
                        {product.name.trim()[0]?.toUpperCase() ?? '·'}
                      </div>
                    )}
                    <div className="content-product-info">
                      <strong>{product.name}</strong>
                      <span>
                        {product.sku}
                        {product.category ? ` · ${product.category}` : ''}
                      </span>
                    </div>
                    <div className="content-product-price">
                      {formatMoney(product.priceMinor, product.currency)}
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 ? (
                <div
                  style={{
                    padding: '1.2rem',
                    textAlign: 'center',
                    color: 'var(--ink-faint)',
                    fontSize: '0.8rem',
                  }}
                >
                  {products.length === 0
                    ? 'No hay productos en este catálogo.'
                    : 'No se encontraron productos con esa búsqueda.'}
                </div>
              ) : null}
            </div>
          </div>

          <label className="field">
            <span className="field__label">Instrucciones extra (opcional)</span>
            <input
              className="input"
              value={extra}
              maxLength={300}
              onChange={(event) => setExtra(event.target.value)}
              placeholder="Ej: Mencioná que hay 15% de descuento este fin de semana…"
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}

          <button type="submit" className="btn btn--wide" disabled={loading || !catalogId}>
            {loading ? 'Generando contenido con IA…' : 'Generar publicación con IA'}
          </button>
        </form>
      </section>

      {/* ------------------------------------------------------------- */}
      {/* PANEL DERECHO: Mockup y Acciones de Publicación               */}
      {/* ------------------------------------------------------------- */}
      <section className="panel">
        <div className="panel__head" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2>Vista previa</h2>
            <span className="mono faint">
              {selected ? STATUS_LABEL[selected.status] : 'sin seleccionar'}
            </span>
          </div>

          {/* Pestañas para cambiar el estilo del Mockup */}
          {selected ? (
            <div className="mockup-tabs">
              <button
                type="button"
                className="mockup-tab-btn"
                data-active={activeMockup === 'INSTAGRAM'}
                onClick={() => setPreviewTab('INSTAGRAM')}
              >
                📷 Instagram
              </button>
              <button
                type="button"
                className="mockup-tab-btn"
                data-active={activeMockup === 'WHATSAPP'}
                onClick={() => setPreviewTab('WHATSAPP')}
              >
                💬 WhatsApp
              </button>
              <button
                type="button"
                className="mockup-tab-btn"
                data-active={activeMockup === 'RAW'}
                onClick={() => setPreviewTab('RAW')}
              >
                📝 Texto plano
              </button>
            </div>
          ) : null}
        </div>

        {selected ? (
          <div className="panel__body stack" style={{ gap: '0.9rem' }}>
            {/* Barra de Acciones Rápidas */}
            <div className="mockup-actions-bar">
              <button
                type="button"
                className="btn-action-copy"
                data-copied={copied}
                onClick={handleCopy}
              >
                {copied ? '✓ ¡Copiado al portapapeles!' : '📋 Copiar texto'}
              </button>

              <button
                type="button"
                className="btn-action-wa"
                onClick={handleOpenWhatsApp}
                title="Abre WhatsApp Web con el texto precargado"
              >
                💬 Enviar a WhatsApp
              </button>

              {selected.imageUrl ? (
                <a
                  href={selected.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download="publicacion.jpg"
                  className="btn-action-sub"
                  title="Descargar imagen en alta resolución"
                >
                  📥 Descargar foto
                </a>
              ) : null}

              <button
                type="button"
                className="btn-action-sub"
                onClick={() => setIsEditing((prev) => !prev)}
              >
                {isEditing ? '✕ Cancelar edición' : '✏️ Editar copy'}
              </button>
            </div>

            {/* Formulario de Edición In-situ si está activo */}
            {isEditing ? (
              <div className="edit-form-card">
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--forest)' }}>
                  Editar texto de la publicación
                </h4>
                <label className="field">
                  <span className="field__label">Título / Gancho</span>
                  <input
                    className="input"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Cuerpo del mensaje</span>
                  <textarea
                    className="textarea"
                    rows={5}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <label className="field">
                    <span className="field__label">Llamado a la acción (CTA)</span>
                    <input
                      className="input"
                      value={editCta}
                      onChange={(e) => setEditCta(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="field__label">Hashtags</span>
                    <input
                      className="input"
                      value={editHashtags}
                      onChange={(e) => setEditHashtags(e.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={handleSaveEdit}
                  style={{ alignSelf: 'flex-start' }}
                >
                  ✓ Guardar cambios en la vista previa
                </button>
              </div>
            ) : null}

            {/* Selector de Generación de Imagen con Diseños */}
            <div
              style={{
                padding: '0.8rem',
                background: 'var(--paper-2)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="field__label" style={{ margin: 0 }}>
                  Estilo de imagen con IA
                </span>
                <span className="mono faint" style={{ fontSize: '0.65rem' }}>
                  {IMAGE_DESIGNS.find((d) => d.key === selectedDesign)?.desc}
                </span>
              </div>

              <div className="content-design-selector">
                {IMAGE_DESIGNS.map((d) => (
                  <button
                    key={d.key}
                    type="button"
                    className="content-design-btn"
                    data-active={selectedDesign === d.key}
                    onClick={() => setSelectedDesign(d.key)}
                  >
                    <span>
                      {d.icon} {d.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="inline" style={{ gap: '0.4rem', marginTop: '0.5rem' }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: '0.82rem' }}
                  value={imagePrompt}
                  onChange={(event) => setImagePrompt(event.target.value)}
                  placeholder="Detalle extra: fondo de mármol, luz dorada…"
                  maxLength={500}
                />
                <button
                  type="button"
                  className="btn btn--small btn--secondary"
                  disabled={imageBusy}
                  onClick={() => void generateImage()}
                >
                  {imageBusy
                    ? 'Generando…'
                    : selected.imageUrl
                      ? 'Regenerar foto'
                      : 'Generar foto'}
                </button>
              </div>
            </div>

            {/* MOCKUP SEGÚN LA RED SOCIAL ELEGIDA */}
            <div className="mockup-container">
              {activeMockup === 'INSTAGRAM' && (
                <div className="mockup-ig">
                  <div className="mockup-ig__head">
                    <div className="mockup-ig__profile">
                      <div className="mockup-ig__avatar">
                        <div className="mockup-ig__avatar-inner">
                          {currentCatalog?.name?.[0]?.toUpperCase() ?? 'T'}
                        </div>
                      </div>
                      <div className="mockup-ig__name-block">
                        <span className="mockup-ig__username">
                          {currentCatalog?.slug || 'mitienda'}
                        </span>
                        <span className="mockup-ig__sub">Publicidad · Promocionado</span>
                      </div>
                    </div>
                    <span style={{ color: '#8e8e8e', fontSize: '1.1rem', cursor: 'pointer' }}>
                      •••
                    </span>
                  </div>

                  <div className="mockup-ig__media-box">
                    {selected.imageUrl ? (
                      <img
                        src={selected.imageUrl}
                        alt={`Publicación para ${selected.title}`}
                      />
                    ) : (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '2rem',
                          color: '#8e8e8e',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: '2.5rem' }}>📸</span>
                        <span style={{ fontSize: '0.85rem' }}>Sin imagen promocional aún</span>
                        <button
                          type="button"
                          className="btn btn--small"
                          disabled={imageBusy}
                          onClick={() => void generateImage()}
                          style={{ fontSize: '0.72rem', padding: '0.35rem 0.7rem' }}
                        >
                          Generar imagen con IA
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mockup-ig__actions-row">
                    <div className="mockup-ig__actions-left">
                      <span>❤️</span>
                      <span>💬</span>
                      <span>✈️</span>
                    </div>
                    <span>🔖</span>
                  </div>

                  <div className="mockup-ig__likes">Les gusta a 148 personas</div>

                  <div className="mockup-ig__caption">
                    <div>
                      <span className="mockup-ig__caption-user">
                        {currentCatalog?.slug || 'mitienda'}
                      </span>
                      <strong>{selected.title}</strong>
                    </div>

                    <div style={{ whiteSpace: 'pre-wrap' }}>{selected.body}</div>

                    <div className="mockup-ig__cta-badge">👉 {selected.cta}</div>

                    <div className="mockup-ig__hashtags">{selected.hashtags.join(' ')}</div>
                  </div>

                  <div className="mockup-ig__time">HACE 45 MINUTOS</div>
                </div>
              )}

              {activeMockup === 'WHATSAPP' && (
                <div className="mockup-wa">
                  <div className="mockup-wa__head">
                    <div className="mockup-wa__avatar">
                      {currentCatalog?.name?.[0]?.toUpperCase() ?? 'W'}
                    </div>
                    <div className="mockup-wa__name-block">
                      <span className="mockup-wa__name">
                        {currentCatalog?.name || 'Mi Tienda en WhatsApp'}
                      </span>
                      <span className="mockup-wa__status">en línea</span>
                    </div>
                  </div>

                  <div className="mockup-wa__chat-area">
                    <div className="mockup-wa__bubble">
                      {selected.imageUrl ? (
                        <img
                          src={selected.imageUrl}
                          alt={selected.title}
                          className="mockup-wa__media"
                        />
                      ) : null}

                      <h4 className="mockup-wa__title">{selected.title}</h4>

                      <p className="mockup-wa__body">{selected.body}</p>

                      <p className="mockup-wa__cta">👉 {selected.cta}</p>

                      <p className="mockup-wa__tags">{selected.hashtags.join(' ')}</p>

                      <div className="mockup-wa__meta">
                        <span>10:42 a. m.</span>
                        <span className="mockup-wa__checks">✓✓</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeMockup === 'RAW' && (
                <div
                  style={{
                    padding: '1.2rem',
                    background: 'var(--paper-2)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{selected.title}</h3>
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.9rem' }}>
                    {selected.body}
                  </p>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem' }}>
                    CTA: {selected.cta}
                  </p>
                  <p className="mono faint" style={{ margin: 0, fontSize: '0.75rem' }}>
                    {selected.hashtags.join(' ')}
                  </p>
                </div>
              )}
            </div>

            {/* Detalles técnicos y botones de aprobación */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                paddingTop: '0.5rem',
                borderTop: '1px solid var(--line)',
              }}
            >
              <span className="mono faint" style={{ fontSize: '0.68rem' }}>
                {selected.aiProvider} · {selected.aiModel} · {selected.tokensIn + selected.tokensOut}{' '}
                tokens
              </span>

              {selected.status === 'DRAFT' ? (
                <div className="inline" style={{ gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn--small"
                    disabled={loading}
                    onClick={() => void decide(selected, 'APPROVED')}
                  >
                    ✓ Aprobar publicación
                  </button>
                  <button
                    type="button"
                    className="thumb-remove"
                    disabled={loading}
                    onClick={() => void decide(selected, 'REJECTED')}
                  >
                    ✕ Rechazar
                  </button>
                </div>
              ) : (
                <span
                  className={
                    selected.status === 'APPROVED' ? 'badge badge--ok' : 'badge badge--danger'
                  }
                >
                  Estado: {STATUS_LABEL[selected.status] ?? selected.status}
                </span>
              )}
            </div>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Sin publicaciones</h3>
            <p>Elegí productos y hacé clic en «Generar publicación con IA».</p>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      {/* HISTORIAL: Tabla de publicaciones generadas                    */}
      {/* ------------------------------------------------------------- */}
      {posts.length > 0 ? (
        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <div className="panel__head">
            <h2>Historial de publicaciones</h2>
            <span className="mono faint">{posts.length} generadas</span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Imagen</th>
                  <th>Plataforma</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <strong>{post.title}</strong>
                    </td>
                    <td>
                      {post.imageUrl ? (
                        <img className="post-thumb" src={post.imageUrl} alt="" />
                      ) : (
                        <span className="mono faint">—</span>
                      )}
                    </td>
                    <td>
                      <span className="badge">{post.platform}</span>
                    </td>
                    <td>
                      <span
                        className={
                          post.status === 'APPROVED'
                            ? 'badge badge--ok'
                            : post.status === 'REJECTED'
                              ? 'badge badge--danger'
                              : 'badge'
                        }
                      >
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
                        Ver vista previa ↗
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
