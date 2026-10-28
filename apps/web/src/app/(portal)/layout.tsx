import type { ReactNode } from 'react';
import Link from 'next/link';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="portal">
      <header className="portal__header">
        <Link className="wordmark" href="/tienda">
          Ventas<span>Catálogo</span>
        </Link>
        <nav className="store__nav">
          <Link href="/tienda">Tienda</Link>
          <Link href="/mi-cuenta/pedidos">Mis pedidos</Link>
          <Link href="/mi-cuenta/chat">Chat</Link>
          <Link href="/mi-cuenta">Mi cuenta</Link>
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
