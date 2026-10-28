'use client';

import { useState } from 'react';
import type { ImageDesign } from '@ventascatalogo/contracts';

interface ImageDesignPickerProps {
  designs: ImageDesign[];
  initialDesign: string;
  canManage: boolean;
}

export function ImageDesignPicker({ designs, initialDesign, canManage }: ImageDesignPickerProps) {
  const [selected, setSelected] = useState(initialDesign);
  const [saved, setSaved] = useState<string | null>(initialDesign);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/v1/organizations/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageDesign: selected }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { imageDesign?: string; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos guardar el diseño.');
      }
      setSaved(selected);
      const label = designs.find((design) => design.key === selected)?.label ?? selected;
      setNotice(`Diseño activo: ${label}. Las imágenes nuevas y las que regeneres lo usarán.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Diseño de imágenes de contenido</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            El estilo que usa la IA al componer la foto del producto con los datos. Podés cambiarlo
            cuando quieras.
          </p>
        </div>
        <span className="mono faint">3 estilos</span>
      </div>

      <div className="panel__body">
        <div className="design-grid">
          {designs.map((design) => {
            const active = selected === design.key;
            return (
              <button
                key={design.key}
                type="button"
                className="design-card"
                data-active={active}
                disabled={!canManage || loading}
                onClick={() => {
                  setSelected(design.key);
                  setNotice(null);
                }}
              >
                <img
                  className="design-card__preview"
                  src={design.previewDataUri}
                  alt={`Vista previa del diseño ${design.label}`}
                />
                <span className="design-card__body">
                  <strong>{design.label}</strong>
                  {saved === design.key ? (
                    <span className="badge badge--ok">Activo</span>
                  ) : (
                    <span className="badge">Disponible</span>
                  )}
                  <span className="mono faint" style={{ fontSize: '0.7rem' }}>
                    {design.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {error ? <div className="alert" style={{ marginTop: '0.8rem' }}>{error}</div> : null}
        {notice ? (
          <div className="alert alert--ok" style={{ marginTop: '0.8rem' }}>
            {notice}
          </div>
        ) : null}

        <div className="inline" style={{ marginTop: '0.9rem' }}>
          <button
            type="button"
            className="btn"
            disabled={!canManage || loading || selected === saved}
            onClick={() => void save()}
          >
            {loading ? 'Guardando…' : 'Usar este diseño'}
          </button>
          {!canManage ? (
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              Solo un administrador puede cambiar el diseño.
            </span>
          ) : (
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              Las publicaciones existentes conservan su imagen hasta que las regeneres.
            </span>
          )}
        </div>
      </div>
      <div className="panel__foot">
        Cada diseño embebe la foto real del producto y varía la composición; con `IMAGE_PROVIDER=openai`
        el estilo se usa como guía del prompt.
      </div>
    </section>
  );
}
