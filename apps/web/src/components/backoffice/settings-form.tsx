'use client';

import { useState } from 'react';
import type { OrgSettings } from '@ventascatalogo/contracts';

interface SettingsFormProps {
  initial: OrgSettings | null;
  canManage: boolean;
}

export function SettingsForm({ initial, canManage }: SettingsFormProps) {
  const [allowSelfApproval, setAllowSelfApproval] = useState(initial?.allowSelfApproval ?? false);
  const [saved, setSaved] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    setSaved(null);
    try {
      const response = await fetch('/api/v1/organizations/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ allowSelfApproval }),
      });
      const payload = (await response.json().catch(() => null)) as
        | OrgSettings
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos guardar los ajustes.',
        );
      }
      setAllowSelfApproval((payload as OrgSettings).allowSelfApproval);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel__head">
        <h2>Seguridad y aprobaciones</h2>
        <span className="mono faint">settings:manage</span>
      </div>
      <div className="panel__body">
        <label className="inline" style={{ alignItems: 'flex-start', gap: '0.7rem' }}>
          <input
            type="checkbox"
            checked={allowSelfApproval}
            disabled={!canManage || loading}
            onChange={(event) => {
              setAllowSelfApproval(event.target.checked);
              setSaved(null);
            }}
            style={{ accentColor: 'var(--coral)', marginTop: '0.2rem' }}
          />
          <span className="stack" style={{ gap: '0.2rem' }}>
            <strong>Permitir que la misma persona solicite y apruebe un reembolso</strong>
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              Apagado (recomendado): quien solicita no puede aprobar. Encendido: el mismo usuario puede
              aprobar su solicitud, pero debe confirmarlo de forma explícita y queda auditado como
              «autoaprobación».
            </span>
          </span>
        </label>

        {error ? <div className="alert" style={{ marginTop: '0.8rem' }}>{error}</div> : null}
        {saved ? (
          <div className="alert alert--ok" style={{ marginTop: '0.8rem' }}>
            Ajustes guardados.
          </div>
        ) : null}

        <div className="inline" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() => void save()}
            disabled={!canManage || loading}
          >
            {loading ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {!canManage ? (
            <span className="mono faint" style={{ fontSize: '0.72rem' }}>
              Solo un administrador de la organización puede cambiar esto.
            </span>
          ) : null}
        </div>
      </div>
      <div className="panel__foot">
        La auditoría registra `organization.settings_updated` con el valor anterior y el nuevo.
      </div>
    </div>
  );
}
