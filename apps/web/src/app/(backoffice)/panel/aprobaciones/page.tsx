import type { Metadata } from 'next';
import type {
  ApprovalListResponse,
  ApprovalRequest,
  OrgSettings,
} from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { ApprovalsPanel } from '@/components/backoffice/approvals-panel';

export const metadata: Metadata = {
  title: 'Aprobaciones',
};

export const dynamic = 'force-dynamic';

/** Pendientes primero; dentro de cada estado, las más recientes arriba. */
function sortApprovals(items: ApprovalRequest[]): ApprovalRequest[] {
  const rank = (approval: ApprovalRequest): number => (approval.status === 'REQUESTED' ? 0 : 1);
  return [...items].sort((left, right) => {
    const byStatus = rank(left) - rank(right);
    if (byStatus !== 0) return byStatus;
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export default async function ApprovalsPage() {
  const [session, approvals, settings] = await Promise.all([
    getSession(),
    tryApiFetch<ApprovalListResponse>('/approvals'),
    tryApiFetch<OrgSettings>('/organizations/settings'),
  ]);

  const items = sortApprovals(approvals?.items ?? []);
  const pendingCount = items.filter((approval) => approval.status === 'REQUESTED').length;
  const canDecide = session?.permissions.includes('approval:decide') ?? false;

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Gobierno · aprobaciones</span>
          <h1 className="display">
            Acciones con <em>firma</em>.
          </h1>
          <p>
            Cada acción sensible del negocio queda a la espera de una decisión. Quien solicita no
            puede aprobar su propia solicitud salvo que la organización habilite la autoaprobación
            en Ajustes.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{pendingCount}</strong>
          <span>pendientes de decisión</span>
        </div>
      </header>

      <ApprovalsPanel
        initial={{ items, total: approvals?.total ?? items.length }}
        currentUserId={session?.id ?? ''}
        canDecide={canDecide}
        allowSelfApproval={settings?.allowSelfApproval ?? false}
      />
    </div>
  );
}
