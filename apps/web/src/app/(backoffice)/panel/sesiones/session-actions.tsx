'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/auth/sessions/${sessionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos revocar la sesión.');
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="stack" style={{ gap: '0.3rem', justifyItems: 'end' }}>
      <button className="btn btn--small btn--danger" type="button" onClick={revoke} disabled={loading}>
        {loading ? 'Cortando…' : 'Revocar'}
      </button>
      {error ? <span className="field__error">{error}</span> : null}
    </span>
  );
}
