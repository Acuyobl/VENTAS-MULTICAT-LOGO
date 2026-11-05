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

  const priceFormatted = formatMoney(product.priceMinor, product.currency);
  const waConsultMessage = encodeURIComponent(
    `¡Hola! Quisiera consultar sobre este producto de ${catalog.name}:\n\n` +
    `*${product.name}*\n` +
    `• SKU: ${product.sku}\n` +
    `• Precio: ${priceFormatted}\n` +
    (product.brand ? `• Marca: ${product.brand}\n` : '') +
    (product.category ? `• Categoría: ${product.category}\n` : '') +
    (product.stock !== null ? `• Disponibilidad: ${product.stock > 0 ? `${product.stock} unidades en stock` : 'Agotado'}\n` : '') +
    `\n¿Tienen disponible para coordinar la entrega o compra? ¡Muchas gracias!`
  );
  const waConsultUrl = `https://wa.me/?text=${waConsultMessage}`;

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

            <a
              href={waConsultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--whatsapp product-modal__wa-btn"
              title="Consultar por WhatsApp"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.17 8.17 0 0 1-1.25-4.47c0-4.54 3.7-8.23 8.24-8.23m4.52 11.63c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.01-1.24-.74-.66-1.25-1.48-1.39-1.73-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.47-.3" />
              </svg>
              Consultar por WhatsApp
            </a>

            <Link href="/carrito" className="btn btn--ghost product-modal__cart-link">
              Ver carrito ↗
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
