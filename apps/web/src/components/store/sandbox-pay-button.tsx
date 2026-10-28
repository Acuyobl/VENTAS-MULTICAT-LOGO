'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SandboxConfirmResponse } from '@ventascatalogo/contracts';

interface SandboxPayButtonProps {
  token: string;
  amountLabel: string;
}

export function SandboxPayButton({ token, amountLabel }: SandboxPayButtonProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SandboxConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/payments/sandbox/${encodeURIComponent(token)}/confirm`,
        { method: 'POST', headers: { accept: 'application/json' } },
      );
      const payload = (await response.json().catch(() => null)) as
        | SandboxConfirmResponse
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos confirmar el pago.',
        );
      }
      setResult(payload as SandboxConfirmResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="stack" style={{ gap: '0.6rem' }}>
        <div className="alert alert--ok" role="status">
          Pago registrado. {result.alreadyProcessed ? 'Ya estaba procesado.' : 'Pedido actualizado.'}{' '}
          Estado del pedido: <strong>{result.orderStatus}</strong>.
        </div>
        <Link className="btn btn--secondary" href="/mi-cuenta/pedidos">
          Ver mis pedidos
        </Link>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <button type="button" className="btn btn--wide" onClick={() => void pay()} disabled={loading}>
        {loading ? 'Procesando…' : `Pagar ${amountLabel} (sandbox)`}
      </button>
      <span className="mono faint" style={{ fontSize: '0.7rem' }}>
        Modo de prueba: simula la confirmación de la pasarela sin mover dinero real.
      </span>
      {error ? <div className="alert">{error}</div> : null}
    </div>
  );
}
