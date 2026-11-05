'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DuplicateCatalogButtonProps {
  catalogId: string;
  catalogName: string;
  currentSlug: string;
  productCount: number;
  canWrite: boolean;
}

export function DuplicateCatalogButton({
  catalogId,
  catalogName,
  currentSlug,
  productCount,
  canWrite,
}: DuplicateCatalogButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canWrite) return null;

  function handleOpen() {
    setName(`Copia de ${catalogName}`);
    setSlug(`${currentSlug}-copia`);
    setDescription('');
    setError(null);
    setOpen(true);
  }

  async function handleDuplicate(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError('El nombre debe tener al menos 2 caracteres.');
      return;
    }
    if (slug.trim().length < 2) {
      setError('El slug debe tener al menos 2 caracteres.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}/duplicate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim().toLowerCase(),
          ...(description.trim() ? { description: description.trim() } : {}),
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        id?: string;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.message ?? 'No se pudo duplicar el catálogo.');
      }

      setOpen(false);
      if (data?.id) {
        router.push(`/panel/catalogos/${data.id}`);
      } else {
        router.refresh();
      }
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
        onClick={handleOpen}
        title="Crear una copia exacta de este catálogo y sus productos"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginRight: '0.35rem', verticalAlign: '-2px' }}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Duplicar catálogo
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
              maxWidth: '28rem',
              width: '100%',
              backgroundColor: 'var(--color-bg, #fff)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div className="panel__head">
              <h2>Duplicar catálogo</h2>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={loading}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <form
              onSubmit={(e) => void handleDuplicate(e)}
              className="panel__body stack"
              style={{ gap: '0.9rem' }}
            >
              <p style={{ fontSize: '0.88rem' }}>
                Se creará un nuevo catálogo independiente clonando la versión activa y sus{' '}
                <strong>{productCount} productos</strong> (precios, imágenes y atributos).
              </p>

              <label className="field">
                <span className="field__label">Nombre del nuevo catálogo</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                  disabled={loading}
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Slug (identificador URL: /c/{slug})</span>
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

              <label className="field">
                <span className="field__label">Descripción (opcional)</span>
                <input
                  className="input"
                  value={description}
                  placeholder="Descripción para el nuevo catálogo..."
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                />
              </label>

              {error ? (
                <div className="alert" style={{ fontSize: '0.84rem' }}>
                  {error}
                </div>
              ) : null}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.6rem',
                  marginTop: '0.5rem',
                }}
              >
                <button
                  type="button"
                  className="btn btn--small btn--ghost"
                  disabled={loading}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn--small btn--primary"
                  disabled={loading}
                >
                  {loading ? 'Clonando catálogo...' : 'Confirmar duplicación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
