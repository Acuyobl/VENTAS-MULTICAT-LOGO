'use client';

import { useState } from 'react';
import type { CatalogSummary } from '@/lib/types';
import { ImportPanel } from '@/components/backoffice/import-panel';

interface ImportHubProps {
  catalogs: CatalogSummary[];
  canWrite: boolean;
}

export function ImportHub({ catalogs, canWrite }: ImportHubProps) {
  const [mode, setMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [name, setName] = useState('');
  const [existingId, setExistingId] = useState(catalogs[0]?.id ?? '');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const targetId = mode === 'NEW' ? createdId : existingId;
  const targetCatalog = catalogs.find((catalog) => catalog.id === targetId) ?? null;
  const deleteCandidates = catalogs.filter((catalog) => catalog.id !== targetId);

  async function createCatalog() {
    if (name.trim().length < 2) {
      setError('Ponele un nombre al catálogo (mínimo 2 caracteres).');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/v1/catalogs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { id: string; name: string; slug: string }
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error((payload as { message?: string } | null)?.message ?? 'No pudimos crearlo.');
      }
      const created = payload as { id: string; name: string; slug: string };
      setCreatedId(created.id);
      setNotice(`Catálogo «${created.name}» creado (/${created.slug}). Ya podés importar el archivo.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
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
        'Se archiva su versión activa, deja de estar en la tienda y no aparece más en la lista. ' +
        'Si tiene pedidos abiertos, la operación se rechaza. Esta acción no se puede deshacer desde la interfaz.',
    );
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${deleteTarget}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string; details?: { reason?: string } }
          | null;
        throw new Error(
          payload?.details?.reason === 'catalog_has_open_orders'
            ? 'No se puede eliminar: tiene pedidos abiertos (por cobrar o pagados). Cancelalos o entregalos primero.'
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
          <h2>1. ¿Dónde cargamos el catálogo?</h2>
          <span className="mono faint">reemplazar o fusionar</span>
        </div>
        <div className="panel__body stack" style={{ gap: '0.8rem' }}>
          <div className="inline" style={{ gap: '1rem', flexWrap: 'wrap' }}>
            <label className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="radio"
                checked={mode === 'NEW'}
                onChange={() => setMode('NEW')}
                disabled={!canWrite || loading}
              />
              <span style={{ fontSize: '0.86rem' }}>
                <strong>Catálogo nuevo</strong> (se crea vacío y se llena con el archivo)
              </span>
            </label>
            <label className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="radio"
                checked={mode === 'EXISTING'}
                onChange={() => setMode('EXISTING')}
                disabled={!canWrite || loading || catalogs.length === 0}
              />
              <span style={{ fontSize: '0.86rem' }}>
                <strong>Catálogo existente</strong> (reemplazar o fusionar su contenido)
              </span>
            </label>
          </div>

          {mode === 'NEW' ? (
            <div className="inline" style={{ gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="field" style={{ minWidth: '20rem' }}>
                <span className="field__label">Nombre del catálogo</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Boutique Mar, Ferretería Central…"
                  disabled={!canWrite || loading || Boolean(createdId)}
                />
              </label>
              <button
                type="button"
                className="btn btn--small"
                disabled={!canWrite || loading || Boolean(createdId)}
                onClick={() => void createCatalog()}
              >
                {loading ? 'Creando…' : createdId ? 'Catálogo creado' : 'Crear catálogo'}
              </button>
            </div>
          ) : (
            <label className="field" style={{ maxWidth: '28rem' }}>
              <span className="field__label">Catálogo existente</span>
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
          )}

          <p className="mono faint" style={{ fontSize: '0.72rem' }}>
            Al importar podés elegir <strong>Reemplazar</strong> (el catálogo queda solo con lo del
            archivo, la versión previa se archiva) o <strong>Fusionar</strong> (conserva los productos
            que no vengan). La tienda muestra el catálogo cuando activás la versión.
          </p>

          {error ? <div className="alert">{error}</div> : null}
          {notice ? <div className="alert alert--ok">{notice}</div> : null}
        </div>
      </section>

      {targetId ? (
        <ImportPanel catalogId={targetId} canWrite={canWrite} />
      ) : (
        <div className="alert">
          Creá el catálogo nuevo (o elegí uno existente) para habilitar la importación.
        </div>
      )}

      <section className="panel">
        <div className="panel__head">
          <h2>2. ¿Querés eliminar el catálogo anterior?</h2>
          <span className="mono faint">opcional</span>
        </div>
        <div className="panel__body stack" style={{ gap: '0.7rem' }}>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            Si cargaste un catálogo nuevo y querés reemplazar al anterior por completo, podés
            eliminarlo acá. Se pide confirmación y se rechaza si tiene pedidos abiertos.
          </p>
          <div className="inline" style={{ gap: '0.6rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
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
          {targetCatalog ? (
            <p className="mono faint" style={{ fontSize: '0.7rem' }}>
              El catálogo que estás cargando ahora es «{targetCatalog.name}».
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
