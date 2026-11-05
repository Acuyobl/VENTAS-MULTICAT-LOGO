'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { WhatsappSessionInfo } from '@ventascatalogo/contracts';

interface WhatsappConnectPanelProps {
  canManage?: boolean;
  compact?: boolean;
}

export function WhatsappConnectPanel({
  canManage = true,
  compact = false,
}: WhatsappConnectPanelProps) {
  const [session, setSession] = useState<WhatsappSessionInfo>({
    status: 'DISCONNECTED',
    qr: null,
    phone: null,
    name: null,
    connectedAt: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/whatsapp/session/status');
      if (res.ok) {
        const data = (await res.json()) as WhatsappSessionInfo;
        setSession(data);
        return data;
      }
    } catch {
      // Ignorar fallo transitorio
    }
    return null;
  }, []);

  // Cargar estado inicial al montar
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Sondeo continuo cuando está escaneando o conectando
  useEffect(() => {
    if (session.status !== 'SCAN_QR' && session.status !== 'CONNECTING') return;

    const interval = setInterval(async () => {
      const updated = await fetchStatus();
      if (updated?.status === 'CONNECTED') {
        clearInterval(interval);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [session.status, fetchStatus]);

  async function handleStartConnect() {
    if (!canManage) return;
    setLoading(true);
    setError(null);
    setShowModal(true);

    try {
      const res = await fetch('/api/v1/whatsapp/session/connect', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as WhatsappSessionInfo;
        setSession(data);
      } else {
        setError('No pudimos iniciar el enlace de WhatsApp.');
      }
    } catch {
      setError('Fallo de conexión al servidor.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!canManage) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/whatsapp/session/disconnect', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as WhatsappSessionInfo;
        setSession(data);
        setShowModal(false);
      }
    } catch {
      setError('No pudimos desconectar la sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSimulate() {
    if (!canManage) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/v1/whatsapp/session/simulate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+506 8888-8888' }),
      });
      if (res.ok) {
        const data = (await res.json()) as WhatsappSessionInfo;
        setSession(data);
      }
    } catch {
      setError('Error al simular conexión.');
    } finally {
      setLoading(false);
    }
  }

  const isConnected = session.status === 'CONNECTED';
  const isScanning = session.status === 'SCAN_QR' && Boolean(session.qr);
  const isConnecting = session.status === 'CONNECTING';

  return (
    <section className="panel" aria-label="Conexión de WhatsApp">
      <header className="panel__head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '2.4rem',
              height: '2.4rem',
              borderRadius: '50%',
              background: isConnected ? '#25d366' : '#1f2937',
              color: '#ffffff',
              display: 'grid',
              placeItems: 'center',
              boxShadow: isConnected ? '0 0 12px rgba(37, 211, 102, 0.4)' : 'none',
              transition: 'all 200ms ease',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '1.25rem', height: '1.25rem' }}>
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: '1.05rem', margin: 0, fontWeight: 600 }}>WhatsApp Web (Vinculación QR)</h2>
            <p className="faint" style={{ margin: 0, fontSize: '0.78rem' }}>
              {isConnected
                ? `Vinculado como ${session.phone ?? 'Dispositivo'}`
                : 'Escaneá el código QR con tu celular para conectar WhatsApp al instante.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {isConnected && (
            <span className="badge badge--ok" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
              Conectado
            </span>
          )}
          {isScanning && <span className="badge badge--warn">Escaneando QR</span>}
          {isConnecting && <span className="badge">Conectando…</span>}
          {!isConnected && !isScanning && !isConnecting && (
            <span className="badge">Desconectado</span>
          )}

          {!isConnected ? (
            <button
              type="button"
              className="btn btn--small btn--primary"
              onClick={handleStartConnect}
              disabled={loading || !canManage}
              style={{ background: '#25d366', borderColor: '#22c55e', color: '#052e16', fontWeight: 600 }}
            >
              {loading ? 'Generando QR…' : 'Vincular WhatsApp'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--small btn--secondary"
              onClick={() => setShowModal(!showModal)}
            >
              {showModal ? 'Ocultar detalles' : 'Ver sesión'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Vista conectada */}
      {isConnected && (
        <div className="panel__body" style={{ display: 'grid', gap: '0.75rem' }}>
          <div
            style={{
              padding: '1rem',
              borderRadius: '8px',
              background: 'rgba(37, 211, 102, 0.08)',
              border: '1px solid rgba(37, 211, 102, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--ink)' }}>
                {session.name ?? 'WhatsApp'} · <span className="mono">{session.phone}</span>
              </strong>
              <small className="faint" style={{ fontSize: '0.78rem' }}>
                Conectado desde {session.connectedAt ? new Date(session.connectedAt).toLocaleString('es-CR') : 'recientemente'}.
                Los mensajes entrantes de clientes ingresan a la bandeja de Chat y tus respuestas saldrán directamente desde este número.
              </small>
            </div>
            {canManage && (
              <button
                type="button"
                className="btn btn--small btn--danger"
                onClick={handleDisconnect}
                disabled={loading}
              >
                {loading ? 'Desconectando…' : 'Desconectar WhatsApp'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal / Área de Escaneo de QR */}
      {(showModal || isScanning || isConnecting) && !isConnected && (
        <div
          className="panel__body"
          style={{
            borderTop: '1px solid var(--line)',
            padding: '1.25rem',
            background: 'var(--paper-1)',
            display: 'grid',
            placeItems: 'center',
            gap: '1rem',
          }}
        >
          {isScanning && session.qr ? (
            <div style={{ textAlign: 'center', maxWidth: '380px' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '1rem',
                  background: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
                  border: '1px solid #e5e7eb',
                }}
              >
                <QRCodeSVG value={session.qr} size={220} level="M" />
              </div>

              <div style={{ marginTop: '1rem', textAlign: 'left', fontSize: '0.82rem', lineHeight: 1.5 }}>
                <strong style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--ink)' }}>
                  Pasos para vincular tu teléfono:
                </strong>
                <ol style={{ paddingLeft: '1.2rem', margin: 0, color: 'var(--ink-soft)' }}>
                  <li>Abre <strong>WhatsApp</strong> en tu celular.</li>
                  <li>Toca <strong>Menú (⋮)</strong> o <strong>Ajustes (⚙️)</strong>.</li>
                  <li>Selecciona <strong>Dispositivos vinculados</strong>.</li>
                  <li>Toca <strong>Vincular un dispositivo</strong> y apunta tu cámara a este código.</li>
                </ol>
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn--small btn--secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  className="btn btn--small btn--secondary"
                  onClick={handleStartConnect}
                  disabled={loading}
                >
                  Regenerar QR
                </button>
                <button
                  type="button"
                  className="btn btn--small"
                  onClick={handleSimulate}
                  title="Simula un teléfono para probar sin dispositivo físico"
                  style={{ opacity: 0.75, fontSize: '0.72rem' }}
                >
                  Modo Demo
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.5rem' }}>
              <div
                style={{
                  display: 'inline-block',
                  width: '2.5rem',
                  height: '2.5rem',
                  border: '3px solid rgba(37, 211, 102, 0.25)',
                  borderTopColor: '#25d366',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '0.75rem',
                }}
              />
              <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 500 }}>
                Generando sesión y código QR de WhatsApp…
              </p>
              <small className="faint" style={{ display: 'block', marginTop: '0.25rem' }}>
                Conectando con el protocolo Web de WhatsApp.
              </small>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
