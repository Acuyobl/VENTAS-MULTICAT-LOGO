import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatRole, initials } from '@/lib/format';
import type { SessionSummary } from '@/lib/types';
import { LogoutButton } from '@/components/logout-button';

export const metadata: Metadata = {
  title: 'Mi cuenta',
};

export const dynamic = 'force-dynamic';

const permissionLabels: Record<string, string> = {
  'self:order:read': 'Ver tus pedidos',
  'self:quote:read': 'Ver tus cotizaciones',
  'self:payment:read': 'Ver tus pagos',
  'self:profile:write': 'Editar tu perfil',
  'self:chat:write': 'Escribir al negocio',
};

export default async function AccountPage() {
  const user = await getSession();
  if (!user || user.audience !== 'customer') redirect('/mi-cuenta/entrar');

  const sessions = await tryApiFetch<{ items: SessionSummary[] }>('/auth/sessions');
  const activeSessions = sessions?.items.length ?? 0;

  return (
    <>
      <section className="stack">
        <span className="eyebrow">Portal de cliente · aud=customer</span>
        <h1 className="portal__title display">
          Tu cuenta,
          <br />
          tu <em>ventana</em>.
        </h1>
        <p className="portal__lead">
          Acá vas a encontrar tus pedidos, cotizaciones y conversaciones. Por ahora la fundación
          ya está firme: sesión propia, organización propia y permisos de cliente.
        </p>

        <div className="account-card">
          <div className="account-card__head">
            <span className="account-card__avatar" aria-hidden>
              {initials(user.fullName)}
            </span>
            <div>
              <h2>{user.fullName}</h2>
              <span className="account-card__email">{user.email}</span>
            </div>
          </div>

          <dl className="kv">
            <dt>Organización</dt>
            <dd>{user.organizationName}</dd>
            <dt>Rol</dt>
            <dd>{user.roleKeys.map(formatRole).join(', ') || 'Cliente'}</dd>
            <dt>Sesiones activas</dt>
            <dd>{activeSessions}</dd>
            <dt>Segundo factor</dt>
            <dd>{user.mfaEnabled ? 'Activo' : 'No requerido para clientes'}</dd>
          </dl>

          <div className="inline">
            <Link className="btn" href="/tienda">
              Seguir mirando el catálogo
            </Link>
            <Link className="btn btn--secondary" href="/mi-cuenta/chat">
              Escribir al negocio
            </Link>
            <LogoutButton
              audience="customer"
              redirectTo="/mi-cuenta/entrar"
              className="btn btn--secondary"
            >
              Cerrar sesión
            </LogoutButton>
          </div>
        </div>
      </section>

      <aside className="portal__side">
        <section className="panel">
          <div className="panel__head">
            <h2>Lo que ya podés hacer</h2>
            <span className="badge badge--ok">Activo</span>
          </div>
          <div className="panel__body">
            <ul className="check-list">
              {(user.permissions.length > 0
                ? user.permissions
                : ['self:order:read', 'self:profile:write', 'self:chat:write']
              ).map((permission) => (
                <li key={permission}>
                  <span className="check-list__dot">✓</span>
                  <span>{permissionLabels[permission] ?? permission}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel__foot">Los pedidos, pagos y chat llegan en las próximas fases.</div>
        </section>

        <div className="portal__note">
          <strong>Sesión separada</strong>
          Tu cookie de cliente es distinta de la del backoffice. Aunque uses el mismo correo para
          trabajar y comprar, cada cara tiene su propia audiencia y su propio refresh.
        </div>

        <Link className="btn btn--secondary" href="/">
          ← Volver al inicio
        </Link>
      </aside>
    </>
  );
}
