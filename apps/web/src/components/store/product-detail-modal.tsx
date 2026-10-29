'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney, taxLabel } from '@/lib/format';
import type { ProductSummary } from '@/lib/types';
import { useCart } from './cart-provider';

interface ProductDetailModalProps {
  product: ProductSummary;
  catalog: {
    slug: string;
    name: string;
    currency: 'CRC' | 'USD';
    taxRateBp: number;
    taxIncluded: boolean;
  };
  onClose: () => void;
}

function formatAttributeKey(key: string): string {
  const map: Record<string, string> = {
    talla: 'Talla',
    tela: 'Tela',
    cuello: 'Cuello',
    genero: 'Género',
    manga: 'Manga',
    urgencia: 'Urgencia',
    cliente: 'Cliente',
    detalle: 'Detalle',
    color: 'Color',
    material: 'Material',
    medida: 'Medida',
    peso: 'Peso',
    marca: 'Marca',
    vencimiento: 'Vencimiento',
  };
  const normalized = key.trim().toLowerCase();
  if (map[normalized]) return map[normalized];
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

export function ProductDetailModal({ product, catalog, onClose }: ProductDetailModalProps) {
  const { add, setQuantity, cart } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const isAvailable = product.stock === null || product.stock > 0;
  const maxStock = product.stock !== null ? Math.max(1, product.stock) : 99;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  function handleAddToCart() {
    if (!isAvailable) return;
    const prevQty = cart.items.find((item) => item.productId === product.id)?.quantity ?? 0;
    add(
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        priceMinor: product.priceMinor,
        currency: product.currency,
        imageUrl: product.imageUrl ?? null,
      },
      catalog,
    );
    if (qty > 1) {
      setQuantity(product.id, prevQty + qty);
    }
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
  }

  // Filtrar atributos vacíos o internos
  const attributes = Object.entries(product.attributes ?? {}).filter(([key, val]) => {
    if (key.startsWith('_')) return false;
    return val !== null && val !== undefined && String(val).trim().length > 0;
  });

  return (
    <div
      className="product-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-modal-title"
    >
      <div className="product-modal-card">
        <button
          type="button"
          className="product-modal__close"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          ✕
        </button>

        <div className="product-modal__media">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="product-modal__img"
            />
          ) : (
            <span className="product-modal__placeholder" aria-hidden>
              {(product.name.trim()[0] ?? '·').toUpperCase()}
            </span>
          )}
        </div>

        <div className="product-modal__body">
          <div className="product-modal__meta">
            <span className="product-modal__cat">{product.category ?? 'General'}</span>
            {product.brand ? <span className="product-modal__brand">· {product.brand}</span> : null}
            <span className="product-modal__sku">SKU: {product.sku}</span>
          </div>

          <h2 id="product-modal-title" className="product-modal__title">
            {product.name}
          </h2>

          <div className="product-modal__pricing">
            <div className="product-modal__price-row">
              <span className="product-modal__price">
                {formatMoney(product.priceMinor, product.currency)}
              </span>
              <span className="product-modal__tax">
                {taxLabel(catalog.taxRateBp, catalog.taxIncluded)}
              </span>
            </div>

            <div
              className="product-modal__stock-badge"
              data-state={
                isAvailable
                  ? product.stock !== null && product.stock <= 5
                    ? 'low-stock'
                    : 'in-stock'
                  : 'out-of-stock'
              }
            >
              {product.stock === null
                ? 'Disponible para pedido'
                : product.stock > 0
                  ? product.stock <= 5
                    ? `¡Últimas ${product.stock} unidades!`
                    : `${product.stock} unidades disponibles`
                  : 'Agotado temporalmente'}
            </div>
          </div>

          {product.description ? (
            <div className="product-modal__desc">
              <p>{product.description}</p>
            </div>
          ) : null}

          {attributes.length > 0 ? (
            <div className="product-modal__specs">
              <span className="product-modal__specs-label">Detalles y Especificaciones</span>
              <div className="product-modal__specs-grid">
                {attributes.map(([key, val]) => (
                  <div key={key} className="product-modal__spec-item">
                    <span className="product-modal__spec-key">{formatAttributeKey(key)}</span>
                    <strong className="product-modal__spec-val">{String(val)}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="product-modal__actions">
            {isAvailable ? (
              <>
                <div className="product-modal__qty-selector">
                  <button
                    type="button"
                    className="product-modal__qty-btn"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Disminuir cantidad"
                  >
                    −
                  </button>
                  <span className="product-modal__qty-val">{qty}</span>
                  <button
                    type="button"
                    className="product-modal__qty-btn"
                    onClick={() => setQty((q) => Math.min(maxStock, q + 1))}
                    disabled={qty >= maxStock}
                    aria-label="Aumentar cantidad"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn--primary product-modal__add-btn"
                  onClick={handleAddToCart}
                >
                  {added ? '✓ Agregado al carrito' : qty > 1 ? `Agregar ${qty} al carrito` : 'Agregar al carrito'}
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--ghost" disabled>
                Producto agotado
              </button>
            )}

            <Link href="/carrito" className="btn btn--ghost product-modal__cart-link">
              Ver carrito ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
