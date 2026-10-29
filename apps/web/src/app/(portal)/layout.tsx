import type { ReactNode } from 'react';
import Link from 'next/link';
import { getPublicAppSettings } from '@/lib/theme';

const NAV_ITEMS = [
  { href: '/tienda', label: 'Tienda' },
  { href: '/mi-cuenta/pedidos', label: 'Mis pedidos' },
  { href: '/mi-cuenta/chat', label: 'Chat' },
  { href: '/mi-cuenta', label: 'Mi cuenta' },
];

function orderedNav(theme: string) {
  if (theme === 'MODERNO') {
    return [NAV_ITEMS[2], NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[3]];
  }
  if (theme === 'COMPACTO') {
    return [NAV_ITEMS[0], NAV_ITEMS[2], NAV_ITEMS[1], NAV_ITEMS[3]];
  }
  return NAV_ITEMS;
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const { appTheme } = await getPublicAppSettings();
  const nav = orderedNav(appTheme);

  return (
    <div className="portal">
      <header className="portal__header">
        <Link className="wordmark" href="/tienda">
          Ventas<span>Catálogo</span>
        </Link>
        <nav className="store__nav">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="portal__main">{children}</main>
      <footer className="store-footer">
        <div>
          <strong>Portal de cliente</strong>
          <span>Sesión separada de la del backoffice, con su propio refresh token.</span>
        </div>
        <div className="mono">
          <Link href="/tienda">Seguir comprando ↗</Link>
        </div>
        <div className="mono faint">aud=customer</div>
      </footer>
    </div>
  );
}
