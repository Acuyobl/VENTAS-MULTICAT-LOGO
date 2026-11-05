'use client';

import { useState, type FormEvent } from 'react';

interface AcceptInvitationFormProps {
  token: string;
  email: string;
}

export function AcceptInvitationForm({ token, email }: AcceptInvitationFormProps) {
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/invitation/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, fullName: fullName.trim(), password }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { message?: string; code?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos aceptar la invitación.');
      }
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="stack">
        <div className="alert alert--ok">
          Listo. La cuenta de <strong>{email}</strong> quedó activa.
        </div>
        <a className="btn btn--wide" href={`/login?email=${encodeURIComponent(email)}`}>
          Entrar al backoffice
        </a>
      </div>
    );
  }

  return (
    <form className="invite__form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Nombre completo</span>
        <input
          className="input"
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Cómo querés que te llamemos"
        />
      </label>

      <div className="form-row">
        <label className="field">
          <span className="field__label">Contraseña</span>
          <input
            className="input"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="10+ caracteres"
          />
        </label>
        <label className="field">
          <span className="field__label">Repetir contraseña</span>
          <input
            className="input"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Otra vez"
          />
        </label>
      </div>

      <p className="field__hint">
        Al menos 10 caracteres, con una mayúscula, una minúscula y un número.
      </p>

      {error ? <div className="alert">{error}</div> : null}

      <button className="btn btn--wide" type="submit" disabled={loading}>
        {loading ? 'Activando cuenta…' : 'Aceptar invitación'}
      </button>
    </form>
  );
}
