'use client';

import { useState, type FormEvent } from 'react';
import type { GatewayConfig, GatewayConfigListResponse } from '@ventascatalogo/contracts';

interface GatewayConfigPanelProps {
  initial: GatewayConfigListResponse['items'];
  canManage: boolean;
}

const PROVIDERS = ['STRIPE', 'MERCADOPAGO', 'PAYPAL', 'SANDBOX'] as const;

const PROVIDER_LABEL: Record<string, string> = {
  STRIPE: 'Stripe',
  MERCADOPAGO: 'Mercado Pago',
  PAYPAL: 'PayPal',
  SANDBOX: 'Sandbox (pruebas)',
};

export function GatewayConfigPanel({ initial, canManage }: GatewayConfigPanelProps) {
  const [items, setItems] = useState<GatewayConfig[]>(initial);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('STRIPE');
  const [mode, setMode] = useState<'TEST' | 'LIVE'>('TEST');
  const [enabled, setEnabled] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch('/api/v1/organizations/payment-gateways', {
      headers: { accept: 'application/json' },
    });
    if (response.ok) {
      const payload = (await response.json()) as GatewayConfigListResponse;
      setItems(payload.items);
    }
  }

  function describe(code: string | undefined, message: string | undefined): string {
    if (code === 'INTEGRATION_NOT_CONFIGURED') {
      return 'La pasarela no está configurada para esta organización.';
    }
    return message && message !== 'Error' ? message : 'No pudimos guardar la pasarela.';
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/organizations/payment-gateways/${encodeURIComponent(provider)}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode,
            enabled,
            ...(publicKey.trim() ? { publicKey: publicKey.trim() } : {}),
            ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
            ...(webhookSecret.trim() ? { webhookSecret: webhookSecret.trim() } : {}),
          }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        GatewayConfig | { code?: string; message?: string } | null;
      if (!response.ok) {
        throw new Error(
          describe(
            (payload as { code?: string } | null)?.code,
            (payload as { message?: string } | null)?.message,
          ),
        );
      }
      setSecretKey('');
      setWebhookSecret('');
      setNotice('Pasarela guardada; los secretos quedan cifrados.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(item: GatewayConfig) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/organizations/payment-gateways/${encodeURIComponent(item.provider)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ enabled: !item.enabled }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'No pudimos cambiar el estado.');
      }
      setNotice(item.enabled ? 'Pasarela deshabilitada.' : 'Pasarela habilitada.');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Pasarelas de pago</h2>
        <span className="mono faint">secretos cifrados AES-256-GCM</span>
      </div>
      <div className="panel__body stack" style={{ gap: '1rem' }}>
        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pasarela</th>
                  <th>Modo</th>
                  <th>Clave</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.provider}>
                    <td>{PROVIDER_LABEL[item.provider] ?? item.provider}</td>
                    <td className="mono faint">{item.mode}</td>
                    <td className="mono faint">
                      {item.maskedKey ?? (item.hasSecret ? '••••' : '—')}
                    </td>
                    <td>
                      <span className={item.enabled ? 'badge badge--ok' : 'badge'}>
                        {item.enabled ? 'Habilitada' : 'Deshabilitada'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        disabled={!canManage || loading}
                        onClick={() => void toggle(item)}
                      >
                        {item.enabled ? 'Deshabilitar' : 'Habilitar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mono faint" style={{ fontSize: '0.75rem' }}>
            Aún no hay pasarelas configuradas. La pasarela de pruebas (sandbox) funciona sin
            credenciales.
          </p>
        )}

        <form className="form-grid" onSubmit={save}>
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 6rem' }}>
            <label className="field">
              <span className="field__label">Pasarela</span>
              <select
                className="select"
                value={provider}
                onChange={(event) => setProvider(event.target.value as (typeof PROVIDERS)[number])}
              >
                {PROVIDERS.map((item) => (
                  <option key={item} value={item}>
                    {PROVIDER_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Modo</span>
              <select
                className="select"
                value={mode}
                onChange={(event) => setMode(event.target.value as 'TEST' | 'LIVE')}
              >
                <option value="TEST">TEST</option>
                <option value="LIVE">LIVE</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span className="field__label">Clave pública (opcional)</span>
            <input
              className="input"
              value={publicKey}
              onChange={(event) => setPublicKey(event.target.value)}
              placeholder="pk_test_…"
            />
          </label>
          <label className="field">
            <span className="field__label">Clave secreta</span>
            <input
              className="input"
              type="password"
              value={secretKey}
              onChange={(event) => setSecretKey(event.target.value)}
              placeholder="sk_test_… (se guarda cifrada)"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span className="field__label">Secreto de webhook (opcional)</span>
            <input
              className="input"
              type="password"
              value={webhookSecret}
              onChange={(event) => setWebhookSecret(event.target.value)}
              placeholder="whsec_…"
              autoComplete="off"
            />
          </label>
          <label className="inline" style={{ gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              style={{ accentColor: 'var(--coral)' }}
            />
            <span style={{ fontSize: '0.85rem' }}>Habilitar esta pasarela al guardar</span>
          </label>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}

          <button type="submit" className="btn" disabled={!canManage || loading}>
            {loading ? 'Guardando…' : 'Guardar pasarela'}
          </button>
        </form>
      </div>
      <div className="panel__foot">
        Habilitar una pasarela real exige su clave secreta; el listado nunca devuelve secretos.
      </div>
    </section>
  );
}
