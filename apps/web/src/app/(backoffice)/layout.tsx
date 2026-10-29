import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { initials } from '@/lib/format';
import { BackofficeNav } from '@/components/backoffice-nav';
import { LogoutButton } from '@/components/logout-button';
import { getPublicAppSettings } from '@/lib/theme';

export const dynamic = 'force-dynamic';

export default async function BackofficeLayout({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect('/login');
  const { appTheme } = await getPublicAppSettings();

  const today = new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="bo">
      <aside className="bo__rail">
        <div className="bo__brand">
          <a className="wordmark" href="/panel">
            Ventas<span>Catálogo</span>
          </a>
          <small>Backoffice · {user.organizationSlug}</small>
        </div>

        <BackofficeNav theme={appTheme} />

        <div className="bo__rail-foot">
          <div className="bo__user">
            <span className="avatar" aria-hidden>
              {initials(user.fullName)}
            </span>
            <span className="bo__user-meta">
              <strong>{user.fullName}</strong>
              <span>{user.email}</span>
            </span>
          </div>
          <LogoutButton audience="staff" redirectTo="/login" />
        </div>
      </aside>

      <div className="bo__main">
        <header className="bo__topbar">
          <div className="bo__crumbs">
            <span>Backoffice</span>
            <span>/</span>
            <strong>{user.organizationName}</strong>
          </div>
          <div className="inline">
            <span className={`badge ${user.mfaEnabled ? 'badge--ok' : 'badge--warn'}`}>
              {user.mfaEnabled ? 'MFA activo' : 'MFA pendiente'}
            </span>
            <span className="mono faint">{today}</span>
          </div>
        </header>
        <div className="bo__content">{children}</div>
      </div>
    </div>
  );
}
