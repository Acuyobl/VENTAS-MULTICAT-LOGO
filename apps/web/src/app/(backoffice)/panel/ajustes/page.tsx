import type { Metadata } from 'next';
import type { OrgSettings } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { SettingsForm } from '@/components/backoffice/settings-form';

export const metadata: Metadata = {
  title: 'Ajustes',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [session, settings] = await Promise.all([
    getSession(),
    tryApiFetch<OrgSettings>('/organizations/settings'),
  ]);
  const canManage = session?.permissions.includes('settings:manage') ?? false;

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Organización · ajustes</span>
          <h1 className="display">
            Las reglas del <em>negocio</em>.
          </h1>
          <p>
            Configuraciones que cambian cómo se comporta la operación. Cada cambio queda auditado con
            su valor anterior y nuevo.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>1</strong>
          <span>política configurable</span>
        </div>
      </header>

      <SettingsForm initial={settings} canManage={canManage} />
    </div>
  );
}
