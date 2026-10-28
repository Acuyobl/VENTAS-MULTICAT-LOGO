'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentSummary, RefundSummary } from '@ventascatalogo/contracts';
import { formatMoney } from '@/lib/format';

interface OrderRefundsPanelProps {
  orderNumber: string;
  currency: 'CRC' | 'USD';
  payments: PaymentSummary[];
  refunds: RefundSummary[];
  canRequest: boolean;
  canApprove: boolean;
}

const REFUND_BADGE: Record<RefundSummary['status'], string> = {
  REQUESTED: 'badge badge--warn',
  PROCESSED: 'badge badge--ok',
  REJECTED: 'badge badge--danger',
};

const REFUND_LABEL: Record<RefundSummary['status'], string> = {
  REQUESTED: 'Solicitado',
  PROCESSED: 'Procesado',
  REJECTED: 'Rechazado',
};

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: 'Pendiente',
  SUCCEEDED: 'Confirmado',
  FAILED: 'Fallido',
  PARTIALLY_REFUNDED: 'Reembolso parcial',
  REFUNDED: 'Reembolsado',
};

export function OrderRefundsPanel({
  orderNumber,
  currency,
  payments,
  refunds,
  canRequest,
  canApprove,
}: OrderRefundsPanelProps) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<PaymentSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const factor = currency === 'USD' ? 100 : 1;

  function availableFor(payment: PaymentSummary): bigint {
    const processed = refunds
      .filter((refund) => refund.paymentId === payment.id && refund.status === 'PROCESSED')
      .reduce((sum, refund) => sum + BigInt(refund.amountMinor), 0n);
    return BigInt(payment.amountMinor) - processed;
  }

  function openDialog(payment: PaymentSummary) {
    setSelected(payment);
    setAmount(String(Number(availableFor(payment)) / factor));
    setReason('');
    setError(null);
    dialog.current?.showModal();
  }

  function closeDialog() {
    dialog.current?.close();
  }

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
    });
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    if (!response.ok) throw new Error(payload?.message ?? `Error HTTP ${response.status}`);
    return payload as T;
  }

  async function requestRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }
    setBusy('request');
    setError(null);
    try {
      await api(`/payments/${selected.id}/refunds`, {
        method: 'POST',
        body: JSON.stringify({
          amountMinor: String(Math.round(numeric * factor)),
          reason: reason.trim(),
        }),
      });
      closeDialog();
      setNotice(`Reembolso solicitado sobre ${orderNumber}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos solicitar el reembolso.');
    } finally {
      setBusy(null);
    }
  }

  async function approve(refund: RefundSummary) {
    setBusy(`approve-${refund.id}`);
    setError(null);
    try {
      await api(`/refunds/${refund.id}/approve`, { method: 'POST', body: JSON.stringify({}) });
      setNotice(`Reembolso aprobado por ${formatMoney(refund.amountMinor, currency)}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos aprobar el reembolso.');
    } finally {
      setBusy(null);
    }
  }

  async function reject(refund: RefundSummary) {
    const note = window.prompt('Motivo del rechazo (opcional):') ?? '';
    setBusy(`reject-${refund.id}`);
    setError(null);
    try {
      await api(`/refunds/${refund.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ ...(note.trim() ? { note: note.trim() } : {}) }),
      });
      setNotice('Reembolso rechazado.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos rechazar el reembolso.');
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
          <h2>Pagos</h2>
          <span className="mono faint">{payments.length} registrados</span>
        </div>
        {payments.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th>Referencia</th>
                  <th>Estado</th>
                  <th>Monto</th>
                  <th>Disponible</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const refundable =
                    payment.status === 'SUCCEEDED' || payment.status === 'PARTIALLY_REFUNDED';
                  return (
                    <tr key={payment.id}>
                      <td className="mono faint">{payment.createdAt.slice(0, 10)}</td>
                      <td>{payment.method ?? payment.provider}</td>
                      <td className="mono faint">{payment.reference ?? '—'}</td>
                      <td>
                        <span className="badge">{PAYMENT_LABEL[payment.status] ?? payment.status}</span>
                      </td>
                      <td className="table__num">{formatMoney(payment.amountMinor, currency)}</td>
                      <td className="table__num">
                        {formatMoney(availableFor(payment), currency)}
                      </td>
                      <td>
                        {canRequest && refundable ? (
                          <button
                            type="button"
                            className="btn btn--small btn--secondary"
                            onClick={() => openDialog(payment)}
                          >
                            Reembolsar
                          </button>
                        ) : null}
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
            <h3>Sin pagos</h3>
            <p>Registrá un pago o generá un link desde la lista de pedidos.</p>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Reembolsos</h2>
          <span className="mono faint">{refunds.length} registrados</span>
        </div>
        {refunds.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Motivo</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td className="mono faint">{refund.createdAt.slice(0, 10)}</td>
                    <td className="table__num">{formatMoney(refund.amountMinor, currency)}</td>
                    <td>{refund.reason}</td>
                    <td>
                      <span className={REFUND_BADGE[refund.status]}>
                        {REFUND_LABEL[refund.status]}
                      </span>
                    </td>
                    <td>
                      {canApprove && refund.status === 'REQUESTED' ? (
                        <span className="inline" style={{ gap: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn btn--small"
                            disabled={busy !== null}
                            onClick={() => void approve(refund)}
                          >
                            {busy === `approve-${refund.id}` ? 'Aprobando…' : 'Aprobar'}
                          </button>
                          <button
                            type="button"
                            className="thumb-remove"
                            disabled={busy !== null}
                            onClick={() => void reject(refund)}
                          >
                            Rechazar
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <span className="empty__mark">∅</span>
            <h3>Sin reembolsos</h3>
            <p>Los reembolsos requieren solicitud y aprobación de otra persona.</p>
          </div>
        )}
        <div className="panel__foot">
          Segregación de funciones: quien solicita no puede aprobar. El saldo nunca baja de cero.
        </div>
      </section>

      <dialog ref={dialog} className="pay-dialog" aria-label={`Solicitar reembolso de ${orderNumber}`}>
        <form className="form-grid" onSubmit={requestRefund}>
          <div className="stack" style={{ gap: '0.2rem' }}>
            <span className="eyebrow">Reembolso</span>
            <h3>Solicitar reembolso</h3>
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              Pedido {orderNumber} · disponible {selected ? formatMoney(availableFor(selected), currency) : ''}
            </p>
          </div>

          <label className="field">
            <span className="field__label">Monto ({currency})</span>
            <input
              className="input"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field__label">Motivo</span>
            <input
              className="input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Producto defectuoso, cancelación, etc."
              required
              minLength={3}
              maxLength={300}
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}

          <div className="inline" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost" onClick={closeDialog} disabled={busy !== null}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={busy !== null}>
              {busy === 'request' ? 'Solicitando…' : 'Solicitar reembolso'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
