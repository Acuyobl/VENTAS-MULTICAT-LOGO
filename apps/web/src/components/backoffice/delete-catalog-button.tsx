'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteCatalogButtonProps {
  catalogId: string;
  catalogName: string;
  canWrite: boolean;
}

export function DeleteCatalogButton({
  catalogId,
  catalogName,
  canWrite,
}: DeleteCatalogButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    const confirmed = window.confirm(
      `¿Eliminar el catálogo "${catalogName}"? Se archiva la versión activa y el catálogo deja de ser público. Esta acción no se puede deshacer desde la interfaz.`,
    );
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          details?: { reason?: string };
        } | null;
        throw new Error(
          payload?.details?.reason === 'catalog_has_open_orders'
            ? 'No se puede eliminar: el catálogo tiene pedidos abiertos (por cobrar o pagados). Cancelalos o entregalos primero.'
            : (payload?.message ?? 'No pudimos eliminar el catálogo.'),
        );
      }
      router.push('/panel/catalogos');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
      setLoading(false);
    }
  }

  if (!canWrite) return null;

  return (
    <span className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
      <button
        type="button"
        className="thumb-remove"
        disabled={loading}
        onClick={() => void remove()}
      >
        {loading ? 'Eliminando…' : 'Eliminar catálogo'}
      </button>
      {error ? (
        <span className="mono faint" style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
