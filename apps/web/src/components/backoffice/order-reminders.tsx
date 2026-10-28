'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReminderSummary } from '@ventascatalogo/contracts';
import { formatMoney } from '@/lib/format';

interface OrderRemindersProps {
  orderId: string;
  orderNumber: string;
  balanceMinor: string;
  currency: 'CRC' | 'USD';
  reminders: ReminderSummary[];
  canSend: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  EMAIL: 'Correo',
  WHATSAPP: 'WhatsApp',
};

function describeError(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case 'INTEGRATION_NOT_CONFIGURED':
      return 'WhatsApp no está configurado en este entorno (faltan credenciales).';
    case 'VALIDATION_FAILED':
      return message ?? 'No se pudo enviar el recordatorio.';
    default:
      return message && message !== 'Error' ? message : 'No pudimos enviar el recordatorio.';
  }
}

export function OrderReminders({
  orderId,
  orderNumber,
  balanceMinor,
  currency,
  reminders,
  canSend,
}: OrderRemindersProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function send(channel: 'EMAIL' | 'WHATSAPP') {
    setBusy(channel);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/orders/${orderId}/reminders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { code?: string; message?: string; details?: { reason?: string } }
        | null;
      if (!response.ok) {
        throw new Error(describeError(payload?.code, payload?.message));
      }
      setNotice(
        channel === 'EMAIL'
          ? `Recordatorio enviado por correo por ${formatMoney(balanceMinor, currency)}.`
          : `Recordatorio enviado por WhatsApp por ${formatMoney(balanceMinor, currency)}.`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Recordatorios de cobro</h2>
        <span className="mono faint">saldo {formatMoney(balanceMinor, currency)}</span>
      </div>
      <div className="panel__body">
        <div aria-live="polite">
          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}
        </div>

        {canSend ? (
          <div className="inline" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn--small btn--secondary"
              disabled={busy !== null}
              onClick={() => void send('EMAIL')}
            >
              {busy === 'EMAIL' ? 'Enviando…' : 'Recordar por correo'}
            </button>
            <button
              type="button"
              className="btn btn--small btn--ghost"
              disabled={busy !== null}
              onClick={() => void send('WHATSAPP')}
            >
              {busy === 'WHATSAPP' ? 'Enviando…' : 'Recordar por WhatsApp'}
            </button>
            <span className="mono faint" style={{ fontSize: '0.7rem' }}>
              Envía el saldo y el link de pago {orderNumber}.
            </span>
          </div>
        ) : (
          <p className="mono faint" style={{ fontSize: '0.72rem' }}>
            Tu rol no puede enviar recordatorios (requiere `payment:write`).
          </p>
        )}
      </div>

      {reminders.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Destino</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((reminder) => (
                <tr key={reminder.id}>
                  <td className="mono faint">
                    {(reminder.sentAt ?? reminder.createdAt).slice(0, 16).replace('T', ' ')}
                  </td>
                  <td>{CHANNEL_LABEL[reminder.channel] ?? reminder.channel}</td>
                  <td className="mono faint">{reminder.to}</td>
                  <td>
                    <span className={reminder.status === 'SENT' ? 'badge badge--ok' : 'badge badge--danger'}>
                      {reminder.status === 'SENT' ? 'Enviado' : 'Falló'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="panel__foot">
        Cada envío queda registrado con canal, destino y estado; si falla, se conserva el error.
      </div>
    </section>
  );
}
