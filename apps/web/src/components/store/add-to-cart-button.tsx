'use client';

import { useState } from 'react';
import { useCart } from './cart-provider';
import type { CartCurrency } from '@/lib/cart';

interface AddToCartButtonProps {
  product: {
    id: string;
    sku: string;
    name: string;
    priceMinor: string;
    currency: CartCurrency;
    imageUrl?: string | null;
  };
  catalog: { slug: string; name: string };
  disabled?: boolean;
}

export function AddToCartButton({ product, catalog, disabled = false }: AddToCartButtonProps) {
  const { add, cart } = useCart();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    if (cart.items.length > 0 && cart.catalogSlug !== catalog.slug) {
      const confirmed = window.confirm(
        `Tu carrito es de "${cart.catalogName}". Para agregar productos de "${catalog.name}" se vaciará. ¿Seguir?`,
      );
      if (!confirmed) return;
    }
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
    setAdded(true);
    setError(null);
    window.setTimeout(() => setAdded(false), 1600);
  }

  return (
    <button
      type="button"
      className="btn btn--small product-card__add"
      onClick={handleAdd}
      disabled={disabled}
      aria-label={`Agregar ${product.name} al carrito`}
    >
      {added ? 'Agregado ✓' : 'Agregar'}
      {error ? <span className="visually-hidden">{error}</span> : null}
    </button>
  );
}
