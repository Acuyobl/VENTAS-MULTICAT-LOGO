import type { ReactNode } from 'react';
import Link from 'next/link';
import { CartProvider } from '@/components/store/cart-provider';
import { CartLink } from '@/components/store/cart-link';
import { PwaRegister } from '@/components/store/pwa-register';

const staffUrl = process.env.NEXT_PUBLIC_STAFF_URL ?? 'http://app.localhost:3000';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <CartProvider>
      <PwaRegister />
      <div className="store">
        <div className="store__promo">
          Catálogo demo · precios en colones · hecho en Costa Rica
        </div>
        <header className="store__header">
          <Link className="wordmark" href="/tienda">
            Ventas<span>Catálogo</span>
          </Link>
          <nav className="store__nav" aria-label="Navegación de la tienda">
            <Link href="/tienda">Catálogo</Link>
            <Link href="/c/catalogo-demo">Edición demo</Link>
            <Link href="/mi-cuenta">Mi cuenta</Link>
          </nav>
          <CartLink />
        </header>
        <main className="store__main">{children}</main>
        <footer className="store-footer">
          <div>
            <strong>VentasCatálogo</strong>
            <span>Una tienda para cada catálogo, una sesión para cada cliente.</span>
          </div>
          <div className="mono">
            <a href={staffUrl}>Backoffice ↗</a>
          </div>
          <div className="mono faint">v0.1.0 · F1</div>
        </footer>
      </div>
    </CartProvider>
  );
}
