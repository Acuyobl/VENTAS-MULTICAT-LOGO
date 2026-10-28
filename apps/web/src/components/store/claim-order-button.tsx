'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ClaimOrderButtonProps {
  token: string;
}

export function ClaimOrderButton({ token }: ClaimOrderButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/storefront/orders/${encodeURIComponent(token)}/claim`, {
        method: 'POST',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const payload = (await response.json().catch(() => null)) as
        | { claimed?: boolean; message?: string; code?: string }
        | null;
      if (response.status === 401 || response.status === 403) {
        window.location.assign(`/mi-cuenta/entrar?next=${encodeURIComponent('/mi-cuenta/pedidos')}`);
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos vincular el pedido a tu cuenta.');
      }
      setMessage('Pedido vinculado a tu cuenta.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <button type="button" className="btn btn--secondary" onClick={() => void claim()} disabled={loading}>
        {loading ? 'Vinculando…' : 'Vincular este pedido a mi cuenta'}
      </button>
      <span aria-live="polite" className="mono faint" style={{ fontSize: '0.72rem' }}>
        {message ?? error ?? 'Necesitás sesión de cliente con el mismo correo del pedido.'}
      </span>
    </div>
  );
}
