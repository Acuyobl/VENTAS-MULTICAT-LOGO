'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RenameCatalogButtonProps {
  catalogId: string;
  catalogName: string;
  currentSlug: string;
  canWrite: boolean;
}

export function RenameCatalogButton({
  catalogId,
  catalogName,
  currentSlug,
  canWrite,
}: RenameCatalogButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(catalogName);
  const [slug, setSlug] = useState(currentSlug);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          ...(slug.trim() && slug.trim() !== currentSlug ? { slug: slug.trim() } : {}),
        }),
      });
      const data = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(data?.message ?? 'No se pudo renombrar el catálogo.');
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={() => {
          setName(catalogName);
          setSlug(currentSlug);
          setError(null);
          setOpen(true);
        }}
        title="Cambiar el nombre o enlace de este catálogo"
      >
        Renombrar
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) setOpen(false);
          }}
        >
          <div
            className="panel"
            style={{
              maxWidth: '26rem',
              width: '100%',
              backgroundColor: 'var(--color-bg, #fff)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div className="panel__head">
              <h2>Renombrar catálogo</h2>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={loading}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="panel__body stack" style={{ gap: '0.8rem' }}>
              <label className="field">
                <span className="field__label">Nombre del catálogo</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    // auto-suggest slug if not custom
                    const autoSlug = e.target.value
                      .toLowerCase()
                      .normalize('NFD')
                      .replace(/[\u0300-\u036f]/g, '')
                      .replace(/[^a-z0-9]+/g, '-')
                      .replace(/^-+|-+$/g, '');
                    setSlug(autoSlug);
                  }}
                  disabled={loading}
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Slug (enlace en tienda: /c/{slug})</span>
                <input
                  className="input"
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, '')
                    )
                  }
                  disabled={loading}
                  required
                />
              </label>

              {error ? <div className="alert">{error}</div> : null}

              <div className="inline" style={{ justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={loading}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn--small btn--primary" disabled={loading}>
                  {loading ? 'Guardando…' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
