import type { ReactNode } from 'react';
import Link from 'next/link';
import { CartProvider } from '@/components/store/cart-provider';
import { CartLink } from '@/components/store/cart-link';
import { PwaRegister } from '@/components/store/pwa-register';
import { getPublicAppSettings } from '@/lib/theme';

const staffUrl = process.env.NEXT_PUBLIC_STAFF_URL ?? 'http://app.localhost:3000';

const NAV_ITEMS = [
  { href: '/tienda', label: 'Catálogo' },
  { href: '/c/catalogo-demo', label: 'Edición demo' },
  { href: '/mi-cuenta', label: 'Mi cuenta' },
];

function orderedNav(theme: string) {
  if (theme === 'MODERNO') {
    return [NAV_ITEMS[0], NAV_ITEMS[2], NAV_ITEMS[1]];
  }
  if (theme === 'COMPACTO') {
    return [NAV_ITEMS[1], NAV_ITEMS[0], NAV_ITEMS[2]];
  }
  return NAV_ITEMS;
}

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const { appTheme } = await getPublicAppSettings();
  const nav = orderedNav(appTheme);

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
            {nav.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
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
          <div className="mono faint">v0.2.0 · F1</div>
        </footer>
      </div>
    </CartProvider>
  );
}
