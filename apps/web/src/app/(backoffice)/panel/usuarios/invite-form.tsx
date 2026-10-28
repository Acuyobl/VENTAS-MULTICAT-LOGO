'use client';

import { useState, type FormEvent } from 'react';
import type { AssignableRole, CatalogSummary } from '@/lib/types';

interface InviteFormProps {
  roles: AssignableRole[];
  catalogs: CatalogSummary[];
}

interface InvitationResult {
  id: string;
  email: string;
  expiresAt: string;
  emailDelivered: boolean;
}

export function InviteForm({ roles, catalogs }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [roleKey, setRoleKey] = useState(roles[0]?.key ?? 'vendedor');
  const [scopeType, setScopeType] = useState<'ORGANIZATION' | 'CATALOG'>('ORGANIZATION');
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvitationResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const response = await fetch('/api/v1/users/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          roleKey,
          scopeType,
          ...(scopeType === 'CATALOG' ? { scopeId: catalogId } : {}),
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | InvitationResult
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ??
            'No pudimos crear la invitación.',
        );
      }
      setResult(payload as InvitationResult);
      setEmail('');
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
          <h2>Invitar</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Un correo, un rol, un alcance.
          </p>
        </div>
        <span className="mono faint">1 uso</span>
      </div>
      <div className="panel__body">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Correo</span>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nueva.persona@equipo.cr"
            />
          </label>

          <label className="field">
            <span className="field__label">Rol</span>
            <select
              className="select"
              value={roleKey}
              onChange={(event) => setRoleKey(event.target.value)}
            >
              {roles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Alcance</span>
            <select
              className="select"
              value={scopeType}
              onChange={(event) =>
                setScopeType(event.target.value as 'ORGANIZATION' | 'CATALOG')
              }
            >
              <option value="ORGANIZATION">Toda la organización</option>
              <option value="CATALOG" disabled={catalogs.length === 0}>
                Un catálogo específico
              </option>
            </select>
          </label>

          {scopeType === 'CATALOG' ? (
            <label className="field">
              <span className="field__label">Catálogo</span>
              <select
                className="select"
                value={catalogId}
                onChange={(event) => setCatalogId(event.target.value)}
              >
                {catalogs.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {catalog.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {error ? <div className="alert">{error}</div> : null}

          {result ? (
            <div className="alert alert--ok">
              Invitación enviada a <strong>{result.email}</strong>.{' '}
              {result.emailDelivered
                ? 'Revisá Mailpit para abrir el enlace.'
                : 'El correo no salió; revisá la configuración SMTP.'}{' '}
              <a className="mono" href="http://localhost:8025" target="_blank" rel="noreferrer">
                Abrir Mailpit ↗
              </a>
            </div>
          ) : null}

          <button className="btn btn--wide" type="submit" disabled={loading || !roleKey}>
            {loading ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </form>
      </div>
      <div className="panel__foot">
        El enlace de aceptación se genera con STAFF_PUBLIC_URL y vence a los 7 días.
      </div>
    </section>
  );
}
