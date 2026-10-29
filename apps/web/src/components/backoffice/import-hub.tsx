'use client';

import { useState } from 'react';
import type { CatalogSummary } from '@/lib/types';
import { ImportPanel } from '@/components/backoffice/import-panel';

interface ImportHubProps {
  catalogs: CatalogSummary[];
  canWrite: boolean;
}

export function ImportHub({ catalogs, canWrite }: ImportHubProps) {
  // Siempre crear un catálogo nuevo por defecto
  const [updateExisting, setUpdateExisting] = useState(false);
  const [name, setName] = useState('');
  const [existingId, setExistingId] = useState(catalogs[0]?.id ?? '');
  const [createdCatalog, setCreatedCatalog] = useState<{ id: string; name: string; slug: string } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mode = updateExisting ? 'EXISTING' : 'NEW';
  const targetId = mode === 'NEW' ? createdCatalog?.id ?? null : existingId;
  const targetCatalog =
    mode === 'NEW'
      ? createdCatalog
      : catalogs.find((catalog) => catalog.id === existingId) ?? null;
  const deleteCandidates = catalogs.filter((catalog) => catalog.id !== targetId);

  // Auto-sugiere un nombre limpio a partir del nombre del archivo si aún no escribió uno
  function handleFileSelected(file: File) {
    if (!updateExisting && !createdCatalog && (!name || name.trim().length === 0)) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '') // quita extensión (.xlsx, .csv, etc)
        .replace(/[_-]+/g, ' ') // guiones y guiones bajos por espacios
        .replace(/\s+/g, ' ')
        .trim();
      if (cleanName.length >= 2) {
        setName(cleanName);
      }
    }
  }

  // Garantiza que exista el catálogo destino antes de analizar o importar
  async function ensureCatalog(): Promise<{ id: string; name: string; slug: string }> {
    if (updateExisting && existingId) {
      const found = catalogs.find((c) => c.id === existingId);
      if (found) return { id: found.id, name: found.name, slug: found.slug };
    }
    if (createdCatalog) return createdCatalog;

    const catalogName = name.trim() || 'Nuevo Catálogo';
    const response = await fetch('/api/v1/catalogs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: catalogName }),
    });
    const payload = (await response.json().catch(() => null)) as
      | { id: string; name: string; slug: string }
      | { message?: string }
      | null;

    if (!response.ok) {
      throw new Error((payload as { message?: string } | null)?.message ?? 'No pudimos crear el catálogo.');
    }
    const created = payload as { id: string; name: string; slug: string };
    setCreatedCatalog(created);
    setNotice(`Catálogo «${created.name}» creado (/c/${created.slug}).`);
    return created;
  }

  async function manualCreateCatalog() {
    if (name.trim().length < 2) {
      setError('Escribí un nombre para el catálogo (mínimo 2 caracteres).');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await ensureCatalog();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al crear el catálogo.');
    } finally {
      setLoading(false);
    }
  }

  async function removeCatalog() {
    if (!deleteTarget) {
      setError('Elegí el catálogo que querés eliminar.');
      return;
    }
    const catalog = catalogs.find((item) => item.id === deleteTarget);
    const confirmed = window.confirm(
      `¿Eliminar definitivamente el catálogo «${catalog?.name ?? deleteTarget}»? ` +
        'Se archiva su versión activa y deja de estar en la tienda. ' +
        'Si tiene pedidos abiertos, la operación se rechaza.',
    );
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${deleteTarget}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
          details?: { reason?: string };
        } | null;
        throw new Error(
          payload?.details?.reason === 'catalog_has_open_orders'
            ? 'No se puede eliminar: tiene pedidos abiertos (por cobrar o pagados).'
            : (payload?.message ?? 'No pudimos eliminar el catálogo.'),
        );
      }
      setNotice(`Catálogo «${catalog?.name ?? deleteTarget}» eliminado.`);
      setDeleteTarget('');
      window.location.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="stack" style={{ gap: '1.2rem' }}>
      <section className="panel">
        <div className="panel__head">
          <h2>1. Nombre del nuevo catálogo</h2>
          <span className="mono faint">creación automática</span>
        </div>
        <div className="panel__body stack" style={{ gap: '0.8rem' }}>
          {!updateExisting ? (
            <div className="stack" style={{ gap: '0.5rem' }}>
              <div
                className="inline"
                style={{ gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
              >
                <label className="field" style={{ minWidth: '22rem', flex: 1 }}>
                  <span className="field__label" style={{ fontSize: '0.92rem', fontWeight: 600 }}>
                    Nombre del catálogo
                  </span>
                  <input
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. Sublimania CR, Camisas Deportivas, Pedidos Colegios…"
                    disabled={!canWrite || loading || Boolean(createdCatalog)}
                  />
                </label>
                {!createdCatalog ? (
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    disabled={!canWrite || loading || name.trim().length < 2}
                    onClick={() => void manualCreateCatalog()}
                  >
                    {loading ? 'Creando…' : 'Crear ahora'}
                  </button>
                ) : (
                  <span className="badge badge--ok" style={{ height: 'fit-content' }}>
                    ✓ Catálogo «{createdCatalog.name}» listo
                  </span>
                )}
              </div>
              <p className="mono faint" style={{ fontSize: '0.78rem', margin: 0 }}>
                💡 Cada archivo que cargás crea un <strong>catálogo nuevo e independiente</strong>. Si dejás el nombre vacío, se tomará automáticamente del nombre del archivo.
              </p>
            </div>
          ) : (
            <div className="stack" style={{ gap: '0.4rem' }}>
              <label className="field" style={{ maxWidth: '28rem' }}>
                <span className="field__label">Catálogo a actualizar</span>
                <select
                  className="select"
                  value={existingId}
                  onChange={(event) => setExistingId(event.target.value)}
                  disabled={!canWrite || loading}
                >
                  {catalogs.map((catalog) => (
                    <option key={catalog.id} value={catalog.id}>
                      {catalog.name} · {catalog.productCount} productos · v
                      {catalog.activeVersionNumber ?? '—'}
                    </option>
                  ))}
                </select>
              </label>
              <p className="mono faint" style={{ fontSize: '0.74rem', margin: 0 }}>
                ⚠️ Se actualizarán los productos de este catálogo existente.
              </p>
            </div>
          )}

          {catalogs.length > 0 ? (
            <div style={{ marginTop: '0.4rem' }}>
              <label className="inline" style={{ gap: '0.4rem', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={updateExisting}
                  onChange={(e) => {
                    setUpdateExisting(e.target.checked);
                    setError(null);
                  }}
                  disabled={!canWrite || loading}
                />
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Actualizar un catálogo existente en lugar de crear uno nuevo
                </span>
              </label>
            </div>
          ) : null}

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}
        </div>
      </section>

      {/* El panel de importación siempre está disponible */}
      <ImportPanel
        catalogId={targetId}
        catalogName={targetCatalog?.name}
        canWrite={canWrite}
        onEnsureCatalog={ensureCatalog}
        onFileSelect={handleFileSelected}
      />

      {catalogs.length > 0 ? (
        <section className="panel">
          <div className="panel__head">
            <h2>3. ¿Querés eliminar algún catálogo anterior?</h2>
            <span className="mono faint">opcional</span>
          </div>
          <div className="panel__body stack" style={{ gap: '0.7rem' }}>
            <p style={{ fontSize: '0.85rem', margin: 0 }}>
              Si cargaste un catálogo nuevo y querés quitar alguno viejo que ya no uses, podés
              eliminarlo acá.
            </p>
            <div
              className="inline"
              style={{ gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}
            >
              <label className="field" style={{ minWidth: '22rem' }}>
                <span className="field__label">Catálogo a eliminar</span>
                <select
                  className="select"
                  value={deleteTarget}
                  onChange={(event) => setDeleteTarget(event.target.value)}
                  disabled={!canWrite || loading || deleteCandidates.length === 0}
                >
                  <option value="">— elegí un catálogo —</option>
                  {deleteCandidates.map((catalog) => (
                    <option key={catalog.id} value={catalog.id}>
                      {catalog.name} · {catalog.productCount} productos
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="thumb-remove"
                disabled={!canWrite || loading || !deleteTarget}
                onClick={() => void removeCatalog()}
              >
                {loading ? 'Eliminando…' : 'Eliminar catálogo'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
