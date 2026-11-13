'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AiUsage } from '@ventascatalogo/contracts';

/** Presupuesto devuelto por `GET/PATCH /ai/budget`. */
export interface AiBudgetPolicyView {
  monthlyBudgetMicroUsd: number;
  alertPercent: number;
  hardStop: boolean;
  updatedAt: string | null;
}

interface AiBudgetFormProps {
  initial: AiUsage;
  budget: AiBudgetPolicyView | null;
  canManage: boolean;
}

const usdFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

function formatMicroUsd(microUsd: number): string {
  return usdFormatter.format(microUsd / 1_000_000);
}

export function AiBudgetForm({ initial, budget, canManage }: AiBudgetFormProps) {
  const router = useRouter();
  const [budgetUsd, setBudgetUsd] = useState(
    budget
      ? String(budget.monthlyBudgetMicroUsd / 1_000_000)
      : String(initial.budgetMicroUsd / 1_000_000),
  );
  const [alertPercent, setAlertPercent] = useState(String(budget?.alertPercent ?? 80));
  const [hardStop, setHardStop] = useState(budget?.hardStop ?? initial.hardStop);
  const [savedMicroUsd, setSavedMicroUsd] = useState(initial.budgetMicroUsd);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const percentUsed =
    savedMicroUsd > 0
      ? Math.round((initial.costMicroUsd / savedMicroUsd) * 1000) / 10
      : 0;
  const remainingMicroUsd =
    savedMicroUsd > 0 ? Math.max(0, savedMicroUsd - initial.costMicroUsd) : 0;
  const barColor =
    percentUsed >= 100
      ? 'var(--danger)'
      : percentUsed >= (Number(alertPercent) || 80)
        ? 'var(--orange)'
        : 'var(--forest)';

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);

    const parsedUsd = Number(budgetUsd.replace(',', '.'));
    const parsedAlert = Number(alertPercent);
    if (!Number.isFinite(parsedUsd) || parsedUsd < 0) {
      setError('El presupuesto debe ser un número mayor o igual a 0 (0 = sin límite).');
      return;
    }
    if (!Number.isInteger(parsedAlert) || parsedAlert < 1 || parsedAlert > 100) {
      setError('El umbral de alerta debe ser un entero entre 1 y 100.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/v1/ai/budget', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          monthlyBudgetMicroUsd: Math.round(parsedUsd * 1_000_000),
          alertPercent: parsedAlert,
          hardStop,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (AiBudgetPolicyView & { message?: string; code?: string })
        | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? 'No pudimos guardar el presupuesto.');
      }
      const saved = payload as AiBudgetPolicyView;
      setBudgetUsd(String(saved.monthlyBudgetMicroUsd / 1_000_000));
      setAlertPercent(String(saved.alertPercent));
      setHardStop(saved.hardStop);
      setSavedMicroUsd(saved.monthlyBudgetMicroUsd);
      setNotice(
        saved.monthlyBudgetMicroUsd > 0
          ? 'Presupuesto guardado. El corte duro aplica desde la próxima generación.'
          : 'Presupuesto guardado: sin límite de dinero; rige la cuota de tokens del plan.',
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
          <h2>Presupuesto mensual de IA</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Tope de gasto del mes en dólares. Con «corte duro» activo, al llegar al límite la IA
            deja de generar y queda un incidente registrado.
          </p>
        </div>
        <span className="mono faint">ai:budget_manage</span>
      </div>

      <div className="panel__body">
        <div
          className="inline"
          style={{ justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <div className="inline" style={{ gap: '0.6rem', alignItems: 'baseline' }}>
            <strong
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.8rem',
                lineHeight: 1,
              }}
            >
              {savedMicroUsd > 0 ? `${percentUsed.toFixed(1)}%` : 'Sin límite'}
            </strong>
            <span className="mono faint">del presupuesto usado</span>
          </div>
          <span className="mono faint">
            {formatMicroUsd(initial.costMicroUsd)} de{' '}
            {savedMicroUsd > 0 ? formatMicroUsd(savedMicroUsd) : '—'}
          </span>
        </div>

        <div
          style={{
            marginTop: '0.6rem',
            height: '0.55rem',
            borderRadius: '999px',
            background: 'rgba(19, 46, 43, 0.1)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, percentUsed))}%`,
              height: '100%',
              background: barColor,
              transition: 'width 240ms ease',
            }}
          />
        </div>

        <div className="inline" style={{ marginTop: '0.7rem', justifyContent: 'space-between' }}>
          <span className="mono faint">
            Restante antes del corte:{' '}
            {savedMicroUsd > 0 ? formatMicroUsd(remainingMicroUsd) : 'sin límite'}
          </span>
          <span className="mono faint">
            Proyección de cierre: {formatMicroUsd(initial.forecastMicroUsd)}
          </span>
        </div>

        <form className="form-grid" style={{ marginTop: '1.1rem' }} onSubmit={save}>
          <div className="form-row">
            <label className="field">
              <span className="field__label">Presupuesto mensual (USD)</span>
              <input
                className="input"
                inputMode="decimal"
                value={budgetUsd}
                disabled={!canManage || loading}
                onChange={(event) => {
                  setBudgetUsd(event.target.value);
                  setNotice(null);
                }}
                placeholder="0 = sin límite"
              />
              <span className="field__hint">
                Se guarda en micro-dólares. 0 desactiva el corte por dinero.
              </span>
            </label>
            <label className="field">
              <span className="field__label">Umbral de alerta (%)</span>
              <input
                className="input"
                type="number"
                min={1}
                max={100}
                value={alertPercent}
                disabled={!canManage || loading}
                onChange={(event) => {
                  setAlertPercent(event.target.value);
                  setNotice(null);
                }}
              />
              <span className="field__hint">
                Al cruzarlo se registra un incidente de aviso, sin cortar.
              </span>
            </label>
          </div>

          <label className="inline" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
            <input
              type="checkbox"
              checked={hardStop}
              disabled={!canManage || loading}
              onChange={(event) => {
                setHardStop(event.target.checked);
                setNotice(null);
              }}
              style={{ accentColor: 'var(--coral)', marginTop: '0.2rem' }}
            />
            <span className="stack" style={{ gap: '0.2rem' }}>
              <strong>Corte duro al alcanzar el límite</strong>
              <span className="mono faint" style={{ fontSize: '0.72rem' }}>
                Apagado: solo se registran avisos y la generación continúa.
              </span>
            </span>
          </label>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}

          <div className="inline">
            <button type="submit" className="btn" disabled={!canManage || loading}>
              {loading ? 'Guardando…' : 'Guardar presupuesto'}
            </button>
            {!canManage ? (
              <span className="mono faint" style={{ fontSize: '0.72rem' }}>
                Solo quien tenga el permiso ai:budget_manage puede cambiarlo.
              </span>
            ) : null}
          </div>
        </form>
      </div>

      <div className="panel__foot">
        El gasto se calcula con el libro de uso del mes en curso (UTC) y se compara contra el
        presupuesto al momento de cada llamada.
      </div>
    </section>
  );
}
