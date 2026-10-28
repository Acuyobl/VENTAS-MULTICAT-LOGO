import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="invite">
      <div className="invite__card">
        <div className="invite__brand">
          <span className="wordmark">
            Ventas<span>Catálogo</span>
          </span>
          <span className="mono faint">404</span>
        </div>
        <span className="eyebrow">Página perdida</span>
        <h1 className="invite__title display">
          Esta puerta no <em>existe</em>.
        </h1>
        <p className="muted">
          El enlace cambió de lugar o el catálogo todavía no está publicado. Volvé al inicio y
          elegí una cara.
        </p>
        <Link className="btn" href="/">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
