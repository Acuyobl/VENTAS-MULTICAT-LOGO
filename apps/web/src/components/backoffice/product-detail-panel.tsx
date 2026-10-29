'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductDetail } from '@ventascatalogo/contracts';
import { formatMoney } from '@/lib/format';

interface ProductDetailPanelProps {
  product: ProductDetail;
  canWrite: boolean;
}

const ATTRIBUTE_LABEL: Record<string, string> = {
  medida: 'Medida',
  material: 'Material',
  color: 'Color',
  talla: 'Talla',
  peso: 'Peso',
  vencimiento: 'Vencimiento',
};

export function ProductDetailPanel({ product, canWrite }: ProductDetailPanelProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(product.imageUrl);
  const factor = product.currency === 'USD' ? 100 : 1;
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description ?? '');
  const [category, setCategory] = useState(product.category ?? '');
  const [brand, setBrand] = useState(product.brand ?? '');
  const [price, setPrice] = useState(String(Number(product.priceMinor) / factor));
  const [stock, setStock] = useState(product.stock != null ? String(product.stock) : '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const numeric = Number(price.replace(',', '.'));
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error('El precio debe ser mayor que cero.');
      }
      const response = await fetch(`/api/v1/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          brand: brand.trim() || null,
          priceMinor: String(Math.round(numeric * factor)),
          stock: stock.trim() === '' ? null : Number(stock),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        ProductDetail | { message?: string } | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos guardar los cambios.',
        );
      }
      setNotice('Producto actualizado.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/v1/products/${product.id}/image`, {
        method: 'POST',
        body: form,
      });
      const payload = (await response.json().catch(() => null)) as {
        imageUrl?: string | null;
        message?: string;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos subir la imagen.');
      }
      setImageUrl(payload?.imageUrl ?? null);
      setNotice('Imagen actualizada.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setUploading(false);
    }
  }

  async function removeImage() {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/products/${product.id}/image`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos quitar la imagen.');
      }
      setImageUrl(null);
      setNotice('Imagen quitada.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setUploading(false);
    }
  }

  const attributes = (product.attributes ?? {}) as Record<string, unknown>;

  return (
    <div className="bo-product-detail">
      <section className="bo-product-detail__media">
        <div className="bo-product-detail__image">
          {imageUrl ? (
            <img src={imageUrl} alt={`Imagen de ${product.name}`} />
          ) : (
            <span className="mono faint">Sin imagen</span>
          )}
        </div>
        {canWrite ? (
          <div className="inline" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              ref={fileInput}
              type="file"
              className="thumb-input"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadImage(file);
                event.target.value = '';
              }}
            />
            {imageUrl ? (
              <button
                type="button"
                className="thumb-remove"
                disabled={uploading}
                onClick={() => void removeImage()}
              >
                Quitar imagen
              </button>
            ) : null}
            {uploading ? <span className="mono faint">Subiendo…</span> : null}
          </div>
        ) : null}
      </section>

      <section className="stack" style={{ gap: '1rem' }}>
        <div className="stack" style={{ gap: '0.3rem' }}>
          <span className="eyebrow">
            {product.catalogName} · v{product.versionNumber} ({product.versionStatus})
          </span>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 520 }}>
            {product.name}
          </h2>
          <p className="mono faint" style={{ fontSize: '0.75rem' }}>
            SKU {product.sku} · {product.category ?? 'General'} · {product.brand ?? 'Sin marca'} ·
            actualizado {product.updatedAt.slice(0, 10)}
          </p>
        </div>

        <div className="metrics">
          <article className="metric">
            <span className="metric__label">Precio</span>
            <strong className="metric__value">
              {formatMoney(product.priceMinor, product.currency)}
            </strong>
          </article>
          <article className="metric">
            <span className="metric__label">Costo</span>
            <strong className="metric__value">
              {product.costMinor ? formatMoney(product.costMinor, product.currency) : '—'}
            </strong>
          </article>
          <article className="metric">
            <span className="metric__label">Stock</span>
            <strong className="metric__value">{product.stock ?? '∞'}</strong>
          </article>
        </div>

        {Object.keys(attributes).length > 0 ? (
          <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>Campos del catálogo</h3>
            <dl className="kv">
              {Object.entries(attributes).map(([key, value]) => (
                <div key={key} style={{ display: 'contents' }}>
                  <dt>{ATTRIBUTE_LABEL[key] ?? key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {product.description ? (
          <p style={{ fontSize: '0.9rem', maxWidth: '60ch' }}>{product.description}</p>
        ) : null}

        <div aria-live="polite">
          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}
        </div>

        {canWrite ? (
          <form className="panel" onSubmit={save}>
            <div className="panel__head">
              <h2>Editar producto</h2>
              <span className="mono faint">product:write</span>
            </div>
            <div className="panel__body form-grid">
              <label className="field">
                <span className="field__label">Nombre</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field">
                  <span className="field__label">Categoría</span>
                  <input
                    className="input"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field__label">Marca</span>
                  <input
                    className="input"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                  />
                </label>
              </div>
              <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field">
                  <span className="field__label">Precio ({product.currency})</span>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span className="field__label">Stock</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                  />
                </label>
              </div>
              <label className="field">
                <span className="field__label">Descripción</span>
                <textarea
                  className="input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
            <div className="panel__foot">
              Editar un producto de una versión archivada está bloqueado para conservar el
              histórico.
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
