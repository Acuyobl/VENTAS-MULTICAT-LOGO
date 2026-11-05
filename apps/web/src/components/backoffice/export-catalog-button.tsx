'use client';

import { useState } from 'react';

interface ExportCatalogButtonProps {
  catalogId: string;
  catalogSlug: string;
  hasActiveVersion: boolean;
  productCount: number;
}

export function ExportCatalogButton({
  catalogId,
  catalogSlug,
  hasActiveVersion,
  productCount,
}: ExportCatalogButtonProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    if (!hasActiveVersion) {
      setError('El catálogo no tiene una versión activa para exportar.');
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}/export?format=${format}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? `Error al exportar (${response.status})`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${catalogSlug}-productos.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al descargar la exportación.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        title="Exportar catálogo en Excel (.xlsx) o CSV"
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Exportar catálogo
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
            if (e.target === e.currentTarget && !downloading) setOpen(false);
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
              <h2>Exportar catálogo</h2>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={downloading}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="panel__body stack" style={{ gap: '1rem' }}>
              <p style={{ fontSize: '0.88rem' }}>
                Descargá todos los productos de la versión activa ({productCount} productos) con sus
                precios, imágenes y atributos.
              </p>

              {!hasActiveVersion ? (
                <div className="alert" style={{ fontSize: '0.84rem' }}>
                  Este catálogo no cuenta con una versión activa para exportar.
                </div>
              ) : null}

              <div className="stack" style={{ gap: '0.5rem' }}>
                <span className="field__label">Formato de descarga:</span>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid var(--color-border, #e5e5e5)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: format === 'xlsx' ? 'var(--color-bg-subtle, #f9f9f9)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value="xlsx"
                    checked={format === 'xlsx'}
                    onChange={() => setFormat('xlsx')}
                    disabled={downloading}
                  />
                  <div>
                    <strong>Microsoft Excel (.xlsx)</strong>
                    <div className="faint" style={{ fontSize: '0.78rem' }}>
                      Recomendado para editar en Excel o Google Sheets con formato nativo.
                    </div>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.6rem 0.8rem',
                    border: '1px solid var(--color-border, #e5e5e5)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: format === 'csv' ? 'var(--color-bg-subtle, #f9f9f9)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value="csv"
                    checked={format === 'csv'}
                    onChange={() => setFormat('csv')}
                    disabled={downloading}
                  />
                  <div>
                    <strong>Texto delimitado (.csv)</strong>
                    <div className="faint" style={{ fontSize: '0.78rem' }}>
                      Formato ligero con codificación UTF-8 BOM para cualquier sistema.
                    </div>
                  </div>
                </label>
              </div>

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
                  disabled={downloading}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--primary"
                  disabled={downloading || !hasActiveVersion}
                  onClick={() => void handleDownload()}
                >
                  {downloading ? 'Generando descarga...' : `Descargar .${format}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
