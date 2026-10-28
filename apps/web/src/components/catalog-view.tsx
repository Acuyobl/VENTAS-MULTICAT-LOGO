import Link from 'next/link';
import type { CSSProperties } from 'react';
import { formatMoney, taxLabel } from '@/lib/format';
import type { PublicCatalog } from '@/lib/types';
import { AddToCartButton } from '@/components/store/add-to-cart-button';

interface CatalogViewProps {
  catalog: PublicCatalog;
  category?: string;
  basePath: string;
}

export function CatalogView({ catalog, category, basePath }: CatalogViewProps) {
  const categories = [...new Set(catalog.products.map((product) => product.category ?? 'General'))];
  const visible = category
    ? catalog.products.filter((product) => (product.category ?? 'General') === category)
    : catalog.products;

  const words = catalog.name.trim().split(/\s+/);
  const lastWord = words.length > 1 ? words.pop() : null;
  const firstPart = words.join(' ');

  return (
    <>
      <section className="store-hero">
        <div className="stack rise" style={{ '--i': 0 } as CSSProperties}>
          <span className="eyebrow">{catalog.organizationName} · catálogo publicado</span>
          <h1 className="store-hero__title display">
            {firstPart ? (
              <>
                {firstPart}
                <br />
                <em>{lastWord}</em>
              </>
            ) : (
              <em>{catalog.name}</em>
            )}
          </h1>
        </div>
        <aside className="store-hero__aside rise" style={{ '--i': 1 } as CSSProperties}>
          <p>
            {catalog.description ??
              'Una selección curada de productos, contada con calma y precio claro.'}
          </p>
          <div className="store-hero__stamp drift">
            <span>Versión activa</span>
            <strong>v{catalog.versionNumber}</strong>
            <span>{catalog.products.length} piezas</span>
          </div>
        </aside>
      </section>

      <div className="store-strip">
        <span>Precios en {catalog.currency}</span>
        <span>{taxLabel(catalog.taxRateBp, catalog.taxIncluded)}</span>
        <span>Stock actualizado</span>
        <span>Pedidos y pagos llegan en F1–F2</span>
      </div>

      <section className="catalog-section">
        <div className="catalog-section__head">
          <div className="stack" style={{ gap: '0.35rem' }}>
            <span className="eyebrow">La colección</span>
            <h2>
              {category ? category : 'Todo lo que hay'} <em>/</em> {visible.length}
            </h2>
          </div>
          <div className="stack" style={{ gap: '0.7rem', justifyItems: 'end' }}>
            <p>
              Cada producto pertenece a esta versión del catálogo. El precio es el que ve el
              cliente, sin sorpresas al final.
            </p>
            {categories.length > 1 ? (
              <div className="filter-row">
                <Link className="filter-chip" data-active={!category} href={basePath}>
                  Todos
                </Link>
                {categories.map((item) => (
                  <Link
                    className="filter-chip"
                    data-active={category === item}
                    href={`${basePath}?categoria=${encodeURIComponent(item)}`}
                    key={item}
                  >
                    {item}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="product-grid">
            {visible.map((product, index) => (
              <article
                className="product-card rise"
                key={product.id}
                style={{ '--i': Math.min(index, 8) } as CSSProperties}
              >
                <div className="product-card__media">
                  {product.imageUrl ? (
                    <img
                      className="product-card__img"
                      src={product.imageUrl}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="product-card__placeholder" aria-hidden>
                      {(product.name.trim()[0] ?? '·').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="product-card__top">
                  <span className="product-card__index">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="product-card__cat">{product.category ?? 'General'}</span>
                </div>
                <div className="product-card__body">
                  <h3 className="product-card__name">{product.name}</h3>
                  <p className="product-card__desc">{product.description ?? 'Selección de la casa.'}</p>
                </div>
                <div className="product-card__foot">
                  <span className="product-card__price">
                    {formatMoney(product.priceMinor, product.currency)}
                  </span>
                  <span className="product-card__stock">
                    {product.stock === null
                      ? 'Disponible'
                      : product.stock > 0
                        ? `${product.stock} en stock`
                        : 'Agotado'}
                  </span>
                </div>
                <div className="product-card__actions">
                  <AddToCartButton
                    product={{
                      id: product.id,
                      sku: product.sku,
                      name: product.name,
                      priceMinor: product.priceMinor,
                      currency: product.currency,
                      imageUrl: product.imageUrl ?? null,
                    }}
                    catalog={{ slug: catalog.slug, name: catalog.name }}
                    disabled={product.stock !== null && product.stock <= 0}
                  />
                </div>
                <span className="product-card__sku">{product.sku}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>No hay piezas en esta categoría</h3>
            <p>Probá con otra categoría o volvé al catálogo completo.</p>
            <Link className="btn btn--secondary" href={basePath}>
              Ver todo
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
