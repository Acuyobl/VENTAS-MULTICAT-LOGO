import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Sin conexión',
};

export default function OfflinePage() {
  return (
    <section className="catalog-section">
      <div className="empty">
        <span className="empty__mark">∅</span>
        <h3>Estás sin conexión</h3>
        <p>
          Guardamos la tienda para que puedas volver a abrirla. Cuando recuperes la señal, el catálogo
          se actualiza solo.
        </p>
        <div className="inline" style={{ justifyContent: 'center' }}>
          <Link className="btn" href="/tienda">
            Reintentar
          </Link>
          <Link className="btn btn--ghost" href="/mi-cuenta/pedidos">
            Mis pedidos
          </Link>
        </div>
      </div>
    </section>
  );
}
