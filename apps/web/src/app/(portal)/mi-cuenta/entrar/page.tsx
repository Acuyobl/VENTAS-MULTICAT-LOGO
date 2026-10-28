import type { Metadata } from 'next';
import Link from 'next/link';
import { EnterForm } from './enter-form';

export const metadata: Metadata = {
  title: 'Entrar a mi cuenta',
};

export const dynamic = 'force-dynamic';

interface EnterPageProps {
  searchParams: Promise<{ token?: string; next?: string }>;
}

export default async function EnterPage({ searchParams }: EnterPageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') ? params.next : '/mi-cuenta';

  return (
    <>
      <section className="stack">
        <span className="eyebrow">Portal de cliente</span>
        <h1 className="portal__title display">
          Volvé a tu
          <br />
          <em>ventana</em>.
        </h1>
        <p className="portal__lead">
          Entrá con un enlace mágico o con tu contraseña. Esta sesión es independiente del
          backoffice: mismo correo, distinta audiencia.
        </p>

        <EnterForm initialToken={params.token ?? ''} nextPath={nextPath} />

        <div className="inline">
          <Link className="btn btn--ghost" href="/tienda">
            ← Seguir mirando
          </Link>
          <Link className="btn btn--ghost" href="/login">
            Soy del equipo
          </Link>
        </div>
      </section>

      <aside className="portal__side">
        <div className="portal__note">
          <strong>Enlace mágico</strong>
          Si tu correo tiene una cuenta de cliente activa, te enviamos un enlace de un solo uso
          que vence en 20 minutos. En desarrollo podés leerlo en Mailpit.
        </div>
        <div className="portal__note">
          <strong>Cuenta demo</strong>
          cliente@ventascatalogo.local
          <br />
          Contraseña: Demo1234!
        </div>
        <a className="btn btn--secondary" href="http://localhost:8025" target="_blank" rel="noreferrer">
          Abrir Mailpit ↗
        </a>
      </aside>
    </>
  );
}
