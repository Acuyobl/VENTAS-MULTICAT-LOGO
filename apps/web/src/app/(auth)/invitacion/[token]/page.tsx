import type { Metadata } from 'next';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import type { InvitationPreview } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { AcceptInvitationForm } from './accept-form';

export const metadata: Metadata = {
  title: 'Aceptar invitación',
};

export const dynamic = 'force-dynamic';

interface InvitationPageProps {
  params: Promise<{ token: string }>;
}

export default async function InvitationPage({ params }: InvitationPageProps) {
  const { token } = await params;

  let preview: InvitationPreview | null = null;
  let error: string | null = null;
  try {
    preview = await apiFetch<InvitationPreview>(
      `/auth/invitation?token=${encodeURIComponent(token)}`,
      { authenticated: false },
    );
  } catch (caught) {
    error =
      caught instanceof ApiError
        ? caught.message
        : 'No pudimos validar la invitación. Probá de nuevo.';
  }

  if (!preview || error) {
    return (
      <main className="invite">
        <div className="invite__card">
          <div className="invite__brand">
            <span className="wordmark">
              Ventas<span>Catálogo</span>
            </span>
            <span className="mono faint">Invitación</span>
          </div>
          <span className="eyebrow">Enlace vencido</span>
          <h1 className="invite__title display">
            Esta silla ya no está <em>libre</em>.
          </h1>
          <p className="muted">
            {error ?? 'La invitación expiró o ya fue utilizada.'} Pedile a un administrador que te
            envíe una nueva.
          </p>
          <Link className="btn" href="/login">
            Ir al login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="invite">
      <div className="invite__card">
        <div className="invite__brand">
          <span className="wordmark">
            Ventas<span>Catálogo</span>
          </span>
          <span className="mono faint">Invitación · {formatDate(preview.expiresAt)}</span>
        </div>

        <span className="eyebrow">Tenés una silla en la mesa</span>
        <h1 className="invite__title display">
          Bienvenido a <em>{preview.organizationName}</em>.
        </h1>
        <p className="muted">
          Te invitaron como <strong>{preview.roleName}</strong> con el correo{' '}
          <strong>{preview.email}</strong>. Elegí tu contraseña para activar la cuenta.
        </p>

        <div className="invite__meta">
          <span className="mono faint">Organización</span>
          <strong>{preview.organizationName}</strong>
          <span className="mono faint">Rol asignado</span>
          <span>{preview.roleName}</span>
        </div>

        <AcceptInvitationForm token={token} email={preview.email} />
      </div>
    </main>
  );
}
