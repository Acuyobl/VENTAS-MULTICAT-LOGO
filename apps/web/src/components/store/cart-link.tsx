'use client';

import Link from 'next/link';
import { useCart } from './cart-provider';

export function CartLink() {
  const { count, hydrated } = useCart();
  return (
    <Link className="store__cart" href="/carrito">
      Carrito
      <span className="cart-badge" aria-live="polite">
        {hydrated ? count : 0}
      </span>
    </Link>
  );
}
