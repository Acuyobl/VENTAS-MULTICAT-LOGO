import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'Dos caras, una casa',
};

const staffUrl = process.env.NEXT_PUBLIC_STAFF_URL ?? 'http://app.localhost:3000';
const tiendaUrl = process.env.NEXT_PUBLIC_TIENDA_URL ?? 'http://tienda.localhost:3000';

export default function HubPage() {
  return (
    <main className="hub">
      <header className="hub__top shell">
        <a className="wordmark" href="/">
          Ventas<span>Catálogo</span>
        </a>
        <span className="eyebrow">San José · Costa Rica</span>
      </header>

      <div className="hub__main shell">
        <div className="hub__intro">
          <div className="stack">
            <span className="eyebrow rise" style={{ '--i': 0 } as CSSProperties}>
              F0 · Fundaciones
            </span>
            <h1 className="hub__title display rise" style={{ '--i': 1 } as CSSProperties}>
              Dos caras.
              <br />
              Una misma <em>casa</em>.
            </h1>
          </div>
          <aside className="hub__aside rise" style={{ '--i': 2 } as CSSProperties}>
            <p>
              El backoffice administra catálogos, equipo y sesiones. La tienda y el portal
              atienden al cliente con su propia sesión, su propio tono y sus propias reglas.
            </p>
            <p className="mono faint">Elegí una puerta para recorrer el sistema.</p>
          </aside>
        </div>

        <div className="hub__doors rise" style={{ '--i': 3 } as CSSProperties}>
          <a className="door" href={staffUrl}>
            <span className="door__number">01 / STAFF</span>
            <span className="door__title">
              Backoffice
              <br />
              de operación
            </span>
            <span className="door__arrow" aria-hidden>
              ↗
            </span>
          </a>
          <a className="door" href={tiendaUrl}>
            <span className="door__number">02 / CUSTOMER</span>
            <span className="door__title">
              Tienda
              <br />
              y portal
            </span>
            <span className="door__arrow" aria-hidden>
              ↗
            </span>
          </a>
        </div>
      </div>

      <footer className="hub__footer shell">
        <span>VentasCatálogo · monorepo NestJS + Next.js</span>
        <span className="mono">app.localhost:3000 · tienda.localhost:3000</span>
      </footer>
    </main>
  );
}
