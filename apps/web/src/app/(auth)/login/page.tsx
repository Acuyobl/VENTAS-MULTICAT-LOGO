import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar al backoffice',
};

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<{ email?: string; next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = params.next?.startsWith('/') ? params.next : '/panel';

  return (
    <main className="auth">
      <aside className="auth__aside">
        <a className="wordmark" href="/">
          Ventas<span>Catálogo</span>
        </a>
        <div className="auth__quote">
          <span className="eyebrow">Backoffice · aud=staff</span>
          <h1 className="display">
            La trastienda
            <br />
            también <em>respira</em>.
          </h1>
          <p>
            Catálogos, equipo, sesiones y permisos en un solo lugar. Acá se decide qué se
            publica, quién entra y qué ve cada quién.
          </p>
        </div>
        <div className="auth__meta">
          <span>Argon2id</span>
          <span>Refresh rotation</span>
          <span>TOTP obligatorio para admins</span>
        </div>
      </aside>

      <section className="auth__main">
        <div className="auth__card">
          <div className="spread">
            <span className="eyebrow">Acceso staff</span>
            <Link className="auth__back" href="/">
              ← Inicio
            </Link>
          </div>
          <div className="stack" style={{ gap: '0.4rem' }}>
            <h2 className="auth__title display">
              Buenas,
              <br />
              <em>de vuelta</em>.
            </h2>
            <p className="auth__lead">
              Entrá con tu cuenta de colaborador. Si sos administrador, el primer acceso te va a
              pedir configurar el segundo factor.
            </p>
          </div>
          <LoginForm initialEmail={params.email ?? ''} nextPath={nextPath} />
          <div className="demo-box">
            <span>Cuenta demo</span>
            <strong>admin@ventascatalogo.local</strong>
            <span>Contraseña: Demo1234!</span>
            <span className="faint">El admin debe enrolar TOTP en el primer login.</span>
          </div>
          <div className="auth__hint">
            <span>
              ¿Sos cliente? <Link href="/mi-cuenta/entrar">Entrá al portal</Link>
            </span>
            <span className="mono">v0.1.0 · F0</span>
          </div>
        </div>
      </section>
    </main>
  );
}
