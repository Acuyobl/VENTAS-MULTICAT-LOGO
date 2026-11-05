'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';

interface EnterFormProps {
  initialToken: string;
  nextPath: string;
}

type Mode = 'magic' | 'password';

export function EnterForm({ initialToken, nextPath }: EnterFormProps) {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('cliente@ventascatalogo.local');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const consumed = useRef(false);

  async function post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; code?: string }
      | null;
    if (!response.ok) {
      throw new Error(payload?.message ?? `No pudimos completar la solicitud (${response.status}).`);
    }
    return payload as T;
  }

  useEffect(() => {
    if (!initialToken || consumed.current) return;
    consumed.current = true;
    setLoading(true);
    setError(null);
    post('/auth/magic-link/consume', { token: initialToken })
      .then(() => {
        window.location.assign(nextPath);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'El enlace no es válido.');
        setToken('');
      })
      .finally(() => setLoading(false));
  }, [initialToken, nextPath]);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await post('/auth/magic-link', { email: email.trim() });
      setNotice(
        'Si el correo tiene una cuenta activa, el enlace ya salió. Revisá Mailpit en localhost:8025.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const result = await post<{ status: string }>('/auth/login', {
        email: email.trim(),
        password,
        audience: 'customer',
        deviceName: 'Navegador web',
      });
      if (result.status === 'authenticated') {
        window.location.assign(nextPath);
        return;
      }
      throw new Error('Esta cuenta requiere un paso adicional. Usá el enlace mágico.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="enter-card">
      <div className="enter-tabs" role="tablist" aria-label="Método de acceso">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'magic'}
          data-active={mode === 'magic'}
          onClick={() => {
            setMode('magic');
            setError(null);
            setNotice(null);
          }}
        >
          Enlace mágico
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          data-active={mode === 'password'}
          onClick={() => {
            setMode('password');
            setError(null);
            setNotice(null);
          }}
        >
          Contraseña
        </button>
      </div>

      {token ? (
        <div className="alert alert--ok">
          Estamos validando tu enlace mágico… <span className="mono">{token.slice(0, 8)}…</span>
        </div>
      ) : null}

      {mode === 'magic' ? (
        <form className="enter-form" onSubmit={requestMagicLink}>
          <label className="field">
            <span className="field__label">Tu correo</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vos@correo.cr"
            />
          </label>
          <button className="btn btn--wide" type="submit" disabled={loading}>
            {loading ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
          <p className="enter-note">
            El enlace vence en 20 minutos y sólo funciona una vez. En local, abrí{' '}
            <a className="mono" href="http://localhost:8025" target="_blank" rel="noreferrer">
              Mailpit ↗
            </a>
            .
          </p>
        </form>
      ) : (
        <form className="enter-form" onSubmit={loginWithPassword}>
          <label className="field">
            <span className="field__label">Correo</span>
            <input
              className="input"
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Contraseña</span>
            <input
              className="input"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Demo1234!"
            />
          </label>
          <button className="btn btn--wide" type="submit" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar a mi cuenta'}
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              setEmail('cliente@ventascatalogo.local');
              setPassword('Demo1234!');
            }}
          >
            Usar credenciales demo
          </button>
        </form>
      )}

      {notice ? <div className="alert alert--ok">{notice}</div> : null}
      {error ? <div className="alert">{error}</div> : null}
    </div>
  );
}
