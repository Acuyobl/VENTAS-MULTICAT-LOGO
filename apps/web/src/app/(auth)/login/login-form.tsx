'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { LoginResponse, MfaEnrollment } from '@/lib/types';
import { generateTotp, secondsRemaining } from '@/lib/totp';

type Step = 'credentials' | 'enroll' | 'challenge';

interface LoginFormProps {
  initialEmail: string;
  nextPath: string;
}

const DEV_HELPERS = process.env.NEXT_PUBLIC_DEV_AUTH_HELPERS === 'true';

export function LoginForm({ initialEmail, nextPath }: LoginFormProps) {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoFilled, setAutoFilled] = useState(false);
  const [manual, setManual] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Enrolamiento: el cliente ya tiene el secreto (el QR), así que puede generar el TOTP
  // y autocompletar el código. Solo en desarrollo: en producción se exige la app real.
  useEffect(() => {
    if (!DEV_HELPERS || step !== 'enroll' || !enrollment?.secret || manual) return;
    let cancelled = false;

    async function refresh() {
      try {
        const value = await generateTotp(enrollment!.secret);
        if (cancelled) return;
        setCode(value);
        setAutoFilled(true);
        setCountdown(secondsRemaining());
      } catch {
        if (!cancelled) setAutoFilled(false);
      }
    }

    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, enrollment, manual]);

  // Segundo factor de un login posterior: la web no tiene el secreto, así que en desarrollo
  // pide el código al helper de la API (flag DEV_AUTH_HELPERS). En producción no se llama.
  useEffect(() => {
    if (!DEV_HELPERS || step !== 'challenge' || !mfaToken || manual) return;
    let cancelled = false;

    async function fillFromHelper() {
      try {
        const response = await fetch('/api/v1/auth/dev/totp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mfaToken }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { code?: string; expiresInSeconds?: number };
        if (cancelled || !payload.code) return;
        setCode(payload.code);
        setAutoFilled(true);
        setCountdown(payload.expiresInSeconds ?? 30);
      } catch {
        // Sin helper disponible: el usuario escribe el código de su app.
      }
    }

    void fillFromHelper();
    const timer = setInterval(() => void fillFromHelper(), 25_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, mfaToken, manual]);

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
      throw new Error(payload?.message ?? `No se pudo completar la solicitud (${response.status}).`);
    }
    return payload as T;
  }

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    setManual(false);
    setAutoFilled(false);
    try {
      const result = await post<LoginResponse>('/auth/login', {
        email: email.trim(),
        password,
        audience: 'staff',
        deviceName: 'Navegador web',
      });

      if (result.status === 'authenticated') {
        window.location.assign(nextPath);
        return;
      }

      if (!result.mfaToken) {
        throw new Error('La API no devolvió el token de MFA.');
      }

      setMfaToken(result.mfaToken);

      if (result.status === 'mfa_enrollment_required') {
        const data = await post<MfaEnrollment>('/auth/mfa/enroll', {
          mfaToken: result.mfaToken,
        });
        setEnrollment(data);
        setStep('enroll');
        return;
      }

      setStep('challenge');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await post<LoginResponse>('/auth/mfa/verify', { mfaToken, code });
      window.location.assign(nextPath);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Código inválido.');
      setCode('');
    } finally {
      setLoading(false);
    }
  }

  function useDemo() {
    setEmail('admin@ventascatalogo.local');
    setPassword('Demo1234!');
    setError(null);
  }

  function handleCodeChange(value: string) {
    setCode(value);
    setManual(true);
    setAutoFilled(false);
  }

  function autoCodeHint() {
    if (!autoFilled) return null;
    return (
      <span className="field__hint" aria-live="polite">
        Código completado automáticamente (modo desarrollo)
        {countdown > 0 ? ` · caduca en ${countdown} s` : null}
      </span>
    );
  }

  if (step === 'enroll') {
    return (
      <form className="auth__form" onSubmit={handleVerify}>
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow">Paso 1 de 2 · Enrolamiento</span>
          <h3 className="display" style={{ fontSize: '2rem' }}>
            Guardá la llave.
          </h3>
          <p className="muted" style={{ fontSize: '0.86rem' }}>
            Escaneá el código con Google Authenticator, 1Password o Authy. Después ingresá los 6
            dígitos para confirmar que la app quedó vinculada.
          </p>
        </div>

        {enrollment ? (
          <div className="mfa-box">
            <div className="mfa-box__qr">
              <QRCodeSVG
                value={enrollment.otpauthUrl}
                size={176}
                bgColor="#fffdf7"
                fgColor="#0f3b2b"
                level="M"
              />
            </div>
            <div className="stack" style={{ gap: '0.3rem' }}>
              <span className="mono faint">Clave manual</span>
              <code className="mfa-box__secret">{enrollment.secret}</code>
            </div>
          </div>
        ) : null}

        {error ? <div className="alert">{error}</div> : null}

        <label className="field">
          <span className="field__label">Código de 6 dígitos</span>
          <input
            className="input input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            value={code}
            onChange={(event) => handleCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
          {autoCodeHint()}
        </label>

        <button className="btn btn--wide" type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Verificando…' : 'Activar MFA y entrar'}
        </button>
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            setStep('credentials');
            setCode('');
            setError(null);
            setManual(false);
            setAutoFilled(false);
          }}
        >
          ← Volver
        </button>
      </form>
    );
  }

  if (step === 'challenge') {
    return (
      <form className="auth__form" onSubmit={handleVerify}>
        <div className="stack" style={{ gap: '0.35rem' }}>
          <span className="eyebrow">Paso 2 de 2 · Segundo factor</span>
          <h3 className="display" style={{ fontSize: '2rem' }}>
            Un código más.
          </h3>
          <p className="muted" style={{ fontSize: '0.86rem' }}>
            Abrí tu app de autenticación y escribí el código vigente de 6 dígitos.
          </p>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <label className="field">
          <span className="field__label">Código TOTP</span>
          <input
            className="input input--code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            autoFocus
            value={code}
            onChange={(event) => handleCodeChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
          {autoCodeHint()}
        </label>

        <button className="btn btn--wide" type="submit" disabled={loading || code.length !== 6}>
          {loading ? 'Verificando…' : 'Entrar al backoffice'}
        </button>
        {DEV_HELPERS && !autoFilled ? (
          <button className="btn btn--ghost" type="button" onClick={() => setManual(false)}>
            Completar código automáticamente
          </button>
        ) : null}
        <button
          className="btn btn--ghost"
          type="button"
          onClick={() => {
            setStep('credentials');
            setCode('');
            setError(null);
            setManual(false);
            setAutoFilled(false);
          }}
        >
          ← Usar otra cuenta
        </button>
      </form>
    );
  }

  return (
    <form className="auth__form" onSubmit={handleCredentials}>
      <label className="field">
        <span className="field__label">Correo electrónico</span>
        <input
          className="input"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="vos@tuorganizacion.cr"
        />
      </label>

      <label className="field">
        <span className="field__label">Contraseña</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Mínimo 10 caracteres"
        />
      </label>

      {error ? <div className="alert">{error}</div> : null}

      <button className="btn btn--wide" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar al backoffice'}
      </button>

      <button className="btn btn--ghost" type="button" onClick={useDemo}>
        Usar credenciales demo
      </button>
    </form>
  );
}
