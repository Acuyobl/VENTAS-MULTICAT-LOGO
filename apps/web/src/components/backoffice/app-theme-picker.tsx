'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AppThemeKey } from '@ventascatalogo/contracts';
import { APP_THEME_KEYS, APP_THEME_META } from '@/lib/theme-meta';

interface AppThemePickerProps {
  initialTheme: AppThemeKey;
  canManage: boolean;
}

export function AppThemePicker({ initialTheme, canManage }: AppThemePickerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<AppThemeKey>(initialTheme);
  const [saved, setSaved] = useState<AppThemeKey>(initialTheme);
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
        body: JSON.stringify({ appTheme: selected }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { appTheme?: AppThemeKey; message?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos guardar el tema.');
      }
      setSaved(selected);
      setNotice(
        `Tema «${APP_THEME_META[selected].label}» aplicado. Recargando la interfaz…`,
      );
      router.refresh();
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
          <h2>Tema visual de la app</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Cambia tipografía, tamaños, densidad y la forma/orden de los menús en toda la aplicación.
          </p>
        </div>
        <span className="mono faint">3 propuestas</span>
      </div>

      <div className="panel__body">
        <div className="theme-grid">
          {APP_THEME_KEYS.map((key) => {
            const meta = APP_THEME_META[key];
            const active = selected === key;
            return (
              <button
                key={key}
                type="button"
                className="theme-card"
                data-active={active}
                disabled={!canManage || loading}
                onClick={() => {
                  setSelected(key);
                  setNotice(null);
                }}
              >
                <span className="theme-card__preview" data-preview={key}>
                  <span className="theme-preview__rail" />
                  <span className="theme-preview__bar" />
                  <span className="theme-preview__title">Aa</span>
                  <span className="theme-preview__lines">
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <span className="theme-card__body">
                  <strong>{meta.label}</strong>
                  {saved === key ? (
                    <span className="badge badge--ok">Activo</span>
                  ) : (
                    <span className="badge">Disponible</span>
                  )}
                  <span className="mono faint" style={{ fontSize: '0.68rem' }}>
                    {meta.tagline} · {meta.layout}
                  </span>
                  <span style={{ fontSize: '0.76rem' }}>{meta.description}</span>
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
            {loading ? 'Guardando…' : 'Usar este tema'}
          </button>
          {!canManage ? (
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              Solo un administrador puede cambiar el tema.
            </span>
          ) : (
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              El cambio aplica a toda la app (backoffice, tienda y portal).
            </span>
          )}
        </div>
      </div>
      <div className="panel__foot">
        Es una preferencia de la organización: el administrador puede volver a cambiarla cuando quiera.
      </div>
    </section>
  );
}
