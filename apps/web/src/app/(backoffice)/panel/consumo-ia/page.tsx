import type { Metadata } from 'next';
import type { AiUsage } from '@ventascatalogo/contracts';
import { apiFetch } from '@/lib/api';
import { getSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import {
  AiBudgetForm,
  type AiBudgetPolicyView,
} from '@/components/backoffice/ai-budget-form';

export const metadata: Metadata = {
  title: 'Consumo IA',
};

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  social_post: 'Publicaciones de texto',
  image: 'Imágenes de contenido',
};

const usdFormatter = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const intFormatter = new Intl.NumberFormat('es-CR');

function formatMicroUsd(microUsd: number): string {
  return usdFormatter.format(microUsd / 1_000_000);
}

function formatTokens(tokens: number): string {
  return intFormatter.format(tokens);
}

function monthLabel(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default async function AiUsagePage() {
  const [usage, budget, session] = await Promise.all([
    apiFetch<AiUsage>('/ai/usage').catch(() => null),
    apiFetch<AiBudgetPolicyView>('/ai/budget').catch(() => null),
    getSession(),
  ]);
  const canManage = session?.permissions.includes('ai:budget_manage') ?? false;

  return (
    <div className="stack" style={{ gap: '1.4rem' }}>
      <header className="page-head">
        <div>
          <span className="eyebrow">IA · gobernanza</span>
          <h1 className="display">
            Gastar con <em>reglas</em>.
          </h1>
          <p>
            Consumo real del mes, presupuesto con corte duro y proyección de cierre. Cada llamada a
            un proveedor de IA queda en el libro de uso de la organización.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{usage ? formatMicroUsd(usage.costMicroUsd) : '—'}</strong>
          <span>{usage ? `gasto de ${monthLabel(usage.periodStart)}` : 'sin datos'}</span>
        </div>
      </header>

      {!usage ? (
        <div className="alert">
          No pudimos cargar el consumo de IA. Revisá que la API esté disponible y volvé a
          intentar.
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <span className="stat__label">Gasto del mes</span>
              <span className="stat__value">{formatMicroUsd(usage.costMicroUsd)}</span>
              <span className="stat__meta">
                {usage.percentUsed.toFixed(1)}% del presupuesto · restante{' '}
                {usage.budgetMicroUsd > 0 ? formatMicroUsd(usage.remainingMicroUsd) : 'sin límite'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Presupuesto</span>
              <span className="stat__value">
                {usage.budgetMicroUsd > 0 ? formatMicroUsd(usage.budgetMicroUsd) : 'Sin límite'}
              </span>
              <span className="stat__meta">
                {usage.hardStop ? 'Corte duro activo' : 'Solo avisos, sin corte'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Tokens</span>
              <span className="stat__value">{formatTokens(usage.tokensTotal)}</span>
              <span className="stat__meta">
                {formatTokens(usage.tokensIn)} entrada · {formatTokens(usage.tokensOut)} salida
                {' · '}
                {usage.quotaTokens > 0
                  ? `${formatTokens(usage.remainingTokens)} disponibles`
                  : 'cuota sin definir'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Imágenes generadas</span>
              <span className="stat__value">{formatTokens(usage.imagesGenerated)}</span>
              <span className="stat__meta">
                Proyección de cierre: {formatMicroUsd(usage.forecastMicroUsd)}
              </span>
            </div>
          </div>

          <AiBudgetForm initial={usage} budget={budget} canManage={canManage} />

          <div className="bo-grid">
            <section className="panel">
              <div className="panel__head">
                <h2>Consumo por función</h2>
                <span className="mono faint">
                  {usage.byFeature.length} {usage.byFeature.length === 1 ? 'función' : 'funciones'}
                </span>
              </div>
              <div className="panel__body" style={{ padding: 0 }}>
                {usage.byFeature.length === 0 ? (
                  <p className="mono faint" style={{ padding: '1.2rem', fontSize: '0.75rem' }}>
                    Todavía no hay llamadas de IA registradas en este período.
                  </p>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Función</th>
                          <th>Llamadas</th>
                          <th>Tokens</th>
                          <th>Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usage.byFeature.map((row) => (
                          <tr key={row.feature}>
                            <td className="table__primary">
                              <strong>{FEATURE_LABEL[row.feature] ?? row.feature}</strong>
                              <span className="mono">{row.feature}</span>
                            </td>
                            <td className="table__num">{formatTokens(row.requests)}</td>
                            <td className="table__num">{formatTokens(row.tokensTotal)}</td>
                            <td className="table__num">{formatMicroUsd(row.costMicroUsd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="panel__foot">
                Tokens de entrada y salida del libro de uso (ai_usage_ledger), agrupados por
                feature.
              </div>
            </section>

            <section className="panel">
              <div className="panel__head">
                <h2>Incidentes del período</h2>
                <span className="mono faint">{usage.incidents.length} registrados</span>
              </div>
              <div className="panel__body">
                {usage.incidents.length === 0 ? (
                  <p className="mono faint" style={{ fontSize: '0.75rem' }}>
                    Sin avisos ni cortes: el consumo no cruzó ningún umbral este mes.
                  </p>
                ) : (
                  <div className="stack" style={{ gap: '0.9rem' }}>
                    {usage.incidents.map((incident) => (
                      <div key={incident.id} className="stack" style={{ gap: '0.3rem' }}>
                        <div className="inline" style={{ justifyContent: 'space-between' }}>
                          <span
                            className={
                              incident.kind === 'HARD_STOP'
                                ? 'badge badge--danger'
                                : 'badge badge--warn'
                            }
                          >
                            {incident.kind === 'HARD_STOP' ? 'Corte' : 'Aviso'}
                          </span>
                          <span className="mono faint">{formatDate(incident.createdAt)}</span>
                        </div>
                        <strong style={{ fontSize: '0.9rem' }}>
                          {incident.kind === 'HARD_STOP'
                            ? 'Se alcanzó el presupuesto y se detuvo la generación'
                            : 'Se cruzó el umbral de alerta del presupuesto'}
                        </strong>
                        <span className="mono faint" style={{ fontSize: '0.72rem' }}>
                          {formatMicroUsd(incident.spentMicroUsd)} sobre un límite de{' '}
                          {formatMicroUsd(incident.limitMicroUsd)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="panel__foot">
                Los incidentes son idempotentes por período: un aviso y un corte como máximo por
                mes.
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
