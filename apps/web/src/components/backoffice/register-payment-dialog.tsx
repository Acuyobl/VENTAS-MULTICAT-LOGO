'use client';

import { useRef, useState, type FormEvent } from 'react';

interface RegisterPaymentDialogProps {
  orderId: string;
  orderNumber: string;
  currency: 'CRC' | 'USD';
  balanceMinor: string;
  onRegistered: () => void;
}

const METHODS = [
  { value: 'SINPE', label: 'SINPE Móvil' },
  { value: 'TRANSFER', label: 'Transferencia' },
  { value: 'CASH', label: 'Efectivo' },
] as const;

type Method = (typeof METHODS)[number]['value'];

export function RegisterPaymentDialog({
  orderId,
  orderNumber,
  currency,
  balanceMinor,
  onRegistered,
}: RegisterPaymentDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const factor = currency === 'USD' ? 100 : 1;
  const [amount, setAmount] = useState(String(Number(balanceMinor) / factor));
  const [method, setMethod] = useState<Method>('SINPE');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    setAmount(String(Number(balanceMinor) / factor));
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const numeric = Number(amount.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }
    const amountMinor = String(Math.round(numeric * factor));
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/payments/manual`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          amountMinor,
          method,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos registrar el pago.');
      }
      onRegistered();
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--small btn--ghost" onClick={open}>
        Registrar pago
      </button>
      <dialog ref={dialog} className="pay-dialog" aria-label={`Registrar pago de ${orderNumber}`}>
        <form className="form-grid" onSubmit={submit}>
          <div className="stack" style={{ gap: '0.2rem' }}>
            <span className="eyebrow">Pago manual</span>
            <h3>Registrar pago de {orderNumber}</h3>
            <p className="mono faint" style={{ fontSize: '0.72rem' }}>
              Saldo pendiente: {formatBalance(balanceMinor, currency)}
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
            <span className="field__label">Método</span>
            <select
              className="select"
              value={method}
              onChange={(event) => setMethod(event.target.value as Method)}
            >
              {METHODS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Referencia (opcional)</span>
            <input
              className="input"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="N.º de comprobante o últimos dígitos"
            />
          </label>

          {error ? <div className="alert">{error}</div> : null}

          <div className="inline" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost" onClick={close} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Registrando…' : 'Registrar pago'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

function formatBalance(amountMinor: string, currency: 'CRC' | 'USD'): string {
  const minor = Number(amountMinor);
  const amount = currency === 'USD' ? minor / 100 : minor;
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency }).format(amount);
}
