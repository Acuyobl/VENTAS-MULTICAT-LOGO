'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CatalogVersionSummary } from '@ventascatalogo/contracts';
import { formatDate, taxLabel } from '@/lib/format';

const STATUS_LABEL: Record<CatalogVersionSummary['status'], string> = {
  DRAFT: 'Borrador',
  VALIDATED: 'Validada',
  ACTIVE: 'Activa',
  ARCHIVED: 'Archivada',
};

const STATUS_CLASS: Record<CatalogVersionSummary['status'], string> = {
  DRAFT: 'badge badge--warn',
  VALIDATED: 'badge badge--ink',
  ACTIVE: 'badge badge--ok',
  ARCHIVED: 'badge',
};

interface VersionsPanelProps {
  catalogId: string;
  versions: CatalogVersionSummary[];
  canWrite: boolean;
}

export function VersionsPanel({ catalogId, versions, canWrite }: VersionsPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: 'activate' | 'validate', version: CatalogVersionSummary) {
    const key = `${action}:${version.id}`;
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/v1/catalogs/${catalogId}/versions/${version.id}/${action}`,
        { method: 'POST', headers: { accept: 'application/json' } },
      );
      const payload = (await response.json().catch(() => null)) as
        | CatalogVersionSummary
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos completar la acción.',
        );
      }
      setNotice(
        action === 'activate'
          ? `Versión v${version.versionNumber} activa. La tienda y los nuevos pedidos ya la usan.`
          : `Versión v${version.versionNumber} validada. Ya se puede activar.`,
      );
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Versiones</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            Inmutables: activar una nueva no toca el histórico.
          </p>
        </div>
        <span className="mono faint">{versions.length} en total</span>
      </div>

      <div aria-live="polite">
        {error ? <div className="alert">{error}</div> : null}
        {notice ? <div className="alert alert--ok">{notice}</div> : null}
      </div>

      {versions.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Estado</th>
                <th>Productos</th>
                <th>Impuestos</th>
                <th>Importada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((version) => {
                const busy = pending?.endsWith(version.id) ?? false;
                const canActivate = version.status === 'VALIDATED' || version.status === 'ARCHIVED';
                return (
                  <tr key={version.id}>
                    <td className="table__num">
                      <strong>v{version.versionNumber}</strong>
                      {version.isActive ? <span className="mono faint"> · publicada</span> : null}
                    </td>
                    <td>
                      <span className={STATUS_CLASS[version.status]}>
                        {STATUS_LABEL[version.status]}
                      </span>
                    </td>
                    <td className="table__num">{version.productCount}</td>
                    <td>
                      <span className="mono faint">
                        {taxLabel(version.taxRateBp, version.taxIncluded)} · {version.currency}
                      </span>
                    </td>
                    <td>
                      <span className="mono faint">
                        {formatDate(version.importedAt ?? version.createdAt)}
                      </span>
                    </td>
                    <td>
                      <span className="inline">
                        {canWrite && version.status === 'DRAFT' ? (
                          <button
                            type="button"
                            className="btn btn--small btn--secondary"
                            disabled={busy}
                            onClick={() => void run('validate', version)}
                          >
                            {busy ? 'Validando…' : 'Validar'}
                          </button>
                        ) : null}
                        {canWrite && canActivate ? (
                          <button
                            type="button"
                            className="btn btn--small"
                            disabled={busy || version.productCount === 0}
                            onClick={() => void run('activate', version)}
                            title={
                              version.productCount === 0
                                ? 'No se puede activar una versión vacía'
                                : undefined
                            }
                          >
                            {busy ? 'Activando…' : 'Activar'}
                          </button>
                        ) : null}
                        {canWrite && version.status === 'ACTIVE' ? (
                          <span className="mono faint">en uso</span>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <span className="empty__mark">∅</span>
          <h3>Todavía no hay versiones</h3>
          <p>Importá un CSV o XLSX para crear la primera versión validada del catálogo.</p>
        </div>
      )}

      <div className="panel__foot">
        Activar cambia solo el puntero del catálogo: pedidos y cotizaciones anteriores conservan su
        versión y sus precios.
      </div>
    </section>
  );
}
