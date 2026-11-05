import type { Metadata } from 'next';
import type {
  GatewayConfigListResponse,
  ImageDesignListResponse,
  OrgSettings,
} from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { SettingsForm } from '@/components/backoffice/settings-form';
import { GatewayConfigPanel } from '@/components/backoffice/gateway-config';
import { ImageDesignPicker } from '@/components/backoffice/image-design-picker';
import { AppThemePicker } from '@/components/backoffice/app-theme-picker';

export const metadata: Metadata = {
  title: 'Ajustes',
};

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [session, settings, gateways, designs] = await Promise.all([
    getSession(),
    tryApiFetch<OrgSettings>('/organizations/settings'),
    tryApiFetch<GatewayConfigListResponse>('/organizations/payment-gateways'),
    tryApiFetch<ImageDesignListResponse>('/ai/image-designs'),
  ]);
  const canManage = session?.permissions.includes('settings:manage') ?? false;

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
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
          <strong>4</strong>
          <span>políticas configurables</span>
        </div>
      </header>

      <SettingsForm initial={settings} canManage={canManage} />
      <AppThemePicker initialTheme={settings?.appTheme ?? 'CLASICO'} canManage={canManage} />
      <ImageDesignPicker
        designs={designs?.items ?? []}
        initialDesign={settings?.imageDesign ?? 'CLASICA'}
        canManage={canManage}
      />
      <GatewayConfigPanel initial={gateways?.items ?? []} canManage={canManage} />
    </div>
  );
}
