'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ApprovalListResponse,
  ApprovalRequest,
  ApprovalStatus,
} from '@ventascatalogo/contracts';
import { formatDate } from '@/lib/format';

interface ApprovalsPanelProps {
  initial: ApprovalListResponse;
  currentUserId: string;
  canDecide: boolean;
  allowSelfApproval: boolean;
}

type Decision = 'APPROVED' | 'REJECTED';

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  REQUESTED: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
};

const STATUS_BADGE: Record<ApprovalStatus, string> = {
  REQUESTED: 'badge badge--warn',
  APPROVED: 'badge badge--ok',
  REJECTED: 'badge badge--danger',
  CANCELLED: 'badge',
};

interface ApiErrorPayload {
  code?: string;
  message?: string;
  details?: { status?: string; reason?: string } | null;
}

function describeError(payload: ApiErrorPayload | null): string {
  switch (payload?.code) {
    case 'CONFLICT':
      return payload.details?.status
        ? `La solicitud ya fue decidida (estado ${STATUS_LABEL[payload.details.status as ApprovalStatus] ?? payload.details.status}).`
        : 'La solicitud ya fue decidida.';
    case 'FORBIDDEN':
      if (payload.details?.reason === 'self_approval') {
        return 'No podés aprobar tu propia solicitud: la autoaprobación está desactivada en Ajustes.';
      }
      if (payload.details?.reason === 'not_requester') {
        return 'Solo quien creó la solicitud puede cancelarla.';
      }
      return 'Tu rol no tiene permiso para esta acción.';
    case 'NOT_FOUND':
      return 'La solicitud ya no existe.';
    default:
      return payload?.message && payload.message !== 'Error'
        ? payload.message
        : 'No pudimos completar la acción.';
  }
}

function describeEntity(approval: ApprovalRequest): string {
  const payload =
    approval.payload && typeof approval.payload === 'object'
      ? JSON.stringify(approval.payload)
      : '';
  return payload ? `${approval.entityType} · ${approval.entityId} — ${payload}` : `${approval.entityType} · ${approval.entityId}`;
}

export function ApprovalsPanel({
  initial,
  currentUserId,
  canDecide,
  allowSelfApproval,
}: ApprovalsPanelProps) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<ApprovalRequest[]>(initial.items);
  const [filter, setFilter] = useState<'ALL' | ApprovalStatus>('ALL');
  const [pending, setPending] = useState<{ approval: ApprovalRequest; decision: Decision } | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setItems(initial.items);
  }, [initial.items]);

  const pendingCount = items.filter((approval) => approval.status === 'REQUESTED').length;
  const visible =
    filter === 'ALL' ? items : items.filter((approval) => approval.status === filter);

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { accept: 'application/json', 'content-type': 'application/json' },
    });
    const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
    if (!response.ok) throw new Error(describeError(payload));
    return payload as T;
  }

  function openDecision(approval: ApprovalRequest, decision: Decision) {
    setPending({ approval, decision });
    setNote('');
    setError(null);
    dialog.current?.showModal();
  }

  function closeDialog() {
    dialog.current?.close();
    setPending(null);
    setNote('');
  }

  async function submitDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    const { approval, decision } = pending;
    setBusy(`decide-${approval.id}`);
    setError(null);
    setNotice(null);
    try {
      const trimmed = note.trim();
      const updated = await api<ApprovalRequest>(`/approvals/${approval.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, ...(trimmed ? { note: trimmed } : {}) }),
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      dialog.current?.close();
      setPending(null);
      setNote('');
      setNotice(decision === 'APPROVED' ? 'Solicitud aprobada.' : 'Solicitud rechazada.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos registrar la decisión.');
    } finally {
      setBusy(null);
    }
  }

  async function cancel(approval: ApprovalRequest) {
    if (!window.confirm('¿Cancelar esta solicitud de aprobación?')) return;
    setBusy(`cancel-${approval.id}`);
    setError(null);
    setNotice(null);
    try {
      const updated = await api<ApprovalRequest>(`/approvals/${approval.id}/cancel`, {
        method: 'POST',
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setNotice('Solicitud cancelada.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cancelar la solicitud.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <div aria-live="polite">
        {error ? <div className="alert">{error}</div> : null}
        {notice ? <div className="alert alert--ok">{notice}</div> : null}
      </div>

      <section className="panel">
        <div className="panel__head">
          <h2>Solicitudes</h2>
          <span className="mono faint">
            {pendingCount} pendientes · {items.length} en total
          </span>
        </div>

        <div className="panel__body">
          <div className="filter-row">
            <label className="field" style={{ maxWidth: '14rem' }}>
              <span className="field__label">Estado</span>
              <select
                className="select"
                value={filter}
                onChange={(event) => setFilter(event.target.value as 'ALL' | ApprovalStatus)}
              >
                <option value="ALL">Todas ({items.length})</option>
                <option value="REQUESTED">Pendientes ({pendingCount})</option>
                <option value="APPROVED">
                  Aprobadas ({items.filter((item) => item.status === 'APPROVED').length})
                </option>
                <option value="REJECTED">
                  Rechazadas ({items.filter((item) => item.status === 'REJECTED').length})
                </option>
                <option value="CANCELLED">
                  Canceladas ({items.filter((item) => item.status === 'CANCELLED').length})
                </option>
              </select>
            </label>
          </div>
        </div>

        {visible.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Recurso</th>
                  <th>Acción</th>
                  <th>Estado</th>
                  <th>Nota de decisión</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((approval) => {
                  const selfBlocked =
                    approval.status === 'REQUESTED' &&
                    approval.requestedByUserId === currentUserId &&
                    !allowSelfApproval;
                  const canDecideThis = canDecide && approval.status === 'REQUESTED' && !selfBlocked;
                  const isRequester = approval.requestedByUserId === currentUserId;
                  return (
                    <tr key={approval.id}>
                      <td className="mono faint">{formatDate(approval.createdAt)}</td>
                      <td>
                        <span className="table__primary">
                          <strong>{approval.entityType}</strong>
                          <span className="mono">{approval.entityId}</span>
                        </span>
                      </td>
                      <td className="mono">{approval.action}</td>
                      <td>
                        <span className={STATUS_BADGE[approval.status]}>
                          {STATUS_LABEL[approval.status]}
                        </span>
                      </td>
                      <td className="faint">{approval.decisionNote ?? '—'}</td>
                      <td title={describeEntity(approval)}>
                        {approval.status === 'REQUESTED' ? (
                          selfBlocked ? (
                            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
                              Solicitado por vos · falta que otra persona lo decida (o activá la
                              autoaprobación en Ajustes)
                            </span>
                          ) : (
                            <span className="inline" style={{ gap: '0.35rem' }}>
                              {canDecideThis ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn--small"
                                    disabled={busy !== null}
                                    onClick={() => openDecision(approval, 'APPROVED')}
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    type="button"
                                    className="thumb-remove"
                                    disabled={busy !== null}
                                    onClick={() => openDecision(approval, 'REJECTED')}
                                  >
                                    Rechazar
                                  </button>
                                </>
                              ) : null}
                              {isRequester ? (
                                <button
                                  type="button"
                                  className="btn btn--small btn--ghost"
                                  disabled={busy !== null}
                                  onClick={() => void cancel(approval)}
                                >
                                  {busy === `cancel-${approval.id}` ? 'Cancelando…' : 'Cancelar'}
                                </button>
                              ) : null}
                            </span>
                          )
                        ) : (
                          <span className="mono faint" style={{ fontSize: '0.72rem' }}>
                            {approval.decidedAt ? formatDate(approval.decidedAt) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Sin solicitudes{filter === 'ALL' ? '' : ' en este estado'}</h3>
            <p>
              Las acciones que requieren aprobación aparecen acá en cuanto se solicitan.
            </p>
          </div>
        )}

        <div className="panel__foot">
          Segregación de funciones: quien solicita no puede decidir su propia solicitud, salvo que la
          organización habilite la autoaprobación. Cada decisión queda auditada.
        </div>
      </section>

      <dialog ref={dialog} className="pay-dialog" aria-label="Decidir solicitud de aprobación">
        <form className="form-grid" onSubmit={submitDecision}>
          <div className="stack" style={{ gap: '0.2rem' }}>
            <span className="eyebrow">Aprobaciones</span>
            <h3>{pending?.decision === 'APPROVED' ? 'Aprobar solicitud' : 'Rechazar solicitud'}</h3>
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              {pending
                ? `${pending.approval.entityType} · ${pending.approval.entityId} · ${pending.approval.action}`
                : ''}
            </p>
          </div>

          <label className="field">
            <span className="field__label">Nota (opcional)</span>
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Motivo o contexto de la decisión"
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}

          <div className="inline" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={closeDialog}
              disabled={busy !== null}
            >
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={busy !== null}>
              {busy !== null
                ? 'Guardando…'
                : pending?.decision === 'APPROVED'
                  ? 'Aprobar'
                  : 'Rechazar'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
