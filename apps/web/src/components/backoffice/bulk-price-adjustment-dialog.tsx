'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type {
  BulkPriceDirection,
  BulkPricePreviewResponse,
  BulkPriceScope,
  BulkPriceType,
} from '@ventascatalogo/contracts';

interface BulkPriceAdjustmentDialogProps {
  catalogId: string;
  catalogName: string;
  currency: 'CRC' | 'USD';
  canWrite: boolean;
}

export function BulkPriceAdjustmentDialog({
  catalogId,
  catalogName,
  currency,
  canWrite,
}: BulkPriceAdjustmentDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [scope, setScope] = useState<BulkPriceScope>('ALL');
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const [type, setType] = useState<BulkPriceType>('PERCENTAGE');
  const [direction, setDirection] = useState<BulkPriceDirection>('INCREASE');
  const [value, setValue] = useState<string>('10');

  const [simulating, setSimulating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<BulkPricePreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}/categories`);
      if (response.ok) {
        const data = (await response.json()) as { categories: string[] };
        setCategories(data.categories ?? []);
        if (data.categories?.length && !category) {
          setCategory(data.categories[0] ?? '');
        }
      }
    } catch {
      // best-effort
    } finally {
      setLoadingCategories(false);
    }
  }, [catalogId, category]);

  useEffect(() => {
    if (open && categories.length === 0) {
      void fetchCategories();
    }
  }, [open, categories.length, fetchCategories]);

  if (!canWrite) return null;

  function handleOpen() {
    setError(null);
    setSuccess(null);
    setPreview(null);
    setOpen(true);
  }

  const numValue = parseFloat(value);

  async function handleSimulate() {
    if (Number.isNaN(numValue) || numValue <= 0) {
      setError('Ingresá un valor numérico positivo mayor a 0.');
      return;
    }
    if (scope === 'CATEGORY' && !category.trim()) {
      setError('Seleccioná una categoría para el alcance.');
      return;
    }

    setSimulating(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}/bulk-price/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scope,
          ...(scope === 'CATEGORY' ? { category: category.trim() } : {}),
          type,
          direction,
          value: numValue,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | BulkPricePreviewResponse
        | { message?: string }
        | null;

      if (!response.ok || !data || !('sampleItems' in data)) {
        throw new Error(
          (data && 'message' in data ? data.message : null) ?? 'Error al simular el ajuste.',
        );
      }

      setPreview(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al obtener vista previa.');
    } finally {
      setSimulating(false);
    }
  }

  async function handleApply() {
    if (Number.isNaN(numValue) || numValue <= 0) {
      setError('Ingresá un valor válido.');
      return;
    }

    setApplying(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/catalogs/${catalogId}/bulk-price/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scope,
          ...(scope === 'CATEGORY' ? { category: category.trim() } : {}),
          type,
          direction,
          value: numValue,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        updatedCount?: number;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.message ?? 'No se pudo aplicar el ajuste.');
      }

      setSuccess(data?.message ?? 'Ajuste de precios aplicado correctamente.');
      setTimeout(() => {
        setOpen(false);
        router.refresh();
      }, 1200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error al aplicar el ajuste.');
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn--small btn--ghost"
        onClick={handleOpen}
        title="Modificar los precios en bloque de todo el catálogo o una categoría"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginRight: '0.35rem', verticalAlign: '-2px' }}
        >
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        Ajuste masivo de precios
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !applying && !simulating) setOpen(false);
          }}
        >
          <div
            className="panel"
            style={{
              maxWidth: '38rem',
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: 'var(--color-bg, #fff)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
            }}
          >
            <div className="panel__head">
              <div>
                <h2>Ajuste masivo de precios</h2>
                <span className="faint" style={{ fontSize: '0.8rem' }}>
                  {catalogName} ({currency})
                </span>
              </div>
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={applying || simulating}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            <div
              className="panel__body stack"
              style={{
                gap: '1rem',
                overflowY: 'auto',
                padding: '1.2rem',
              }}
            >
              {/* Alcance */}
              <div className="stack" style={{ gap: '0.4rem' }}>
                <span className="field__label"><strong>1. Alcance del ajuste:</strong></span>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scope"
                      value="ALL"
                      checked={scope === 'ALL'}
                      onChange={() => {
                        setScope('ALL');
                        setPreview(null);
                      }}
                      disabled={applying || simulating}
                    />
                    <span>Todo el catálogo</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="scope"
                      value="CATEGORY"
                      checked={scope === 'CATEGORY'}
                      onChange={() => {
                        setScope('CATEGORY');
                        setPreview(null);
                      }}
                      disabled={applying || simulating}
                    />
                    <span>Categoría específica</span>
                  </label>
                </div>

                {scope === 'CATEGORY' ? (
                  <div style={{ marginTop: '0.4rem' }}>
                    {loadingCategories ? (
                      <span className="mono faint" style={{ fontSize: '0.8rem' }}>
                        Cargando categorías...
                      </span>
                    ) : categories.length > 0 ? (
                      <select
                        className="input"
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="input"
                        placeholder="Escribí el nombre de la categoría"
                        value={category}
                        onChange={(e) => {
                          setCategory(e.target.value);
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      />
                    )}
                  </div>
                ) : null}
              </div>

              {/* Tipo y Dirección */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
                  gap: '1rem',
                }}
              >
                <div className="stack" style={{ gap: '0.4rem' }}>
                  <span className="field__label"><strong>2. Tipo de cambio:</strong></span>
                  <div style={{ display: 'flex', gap: '0.8rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="type"
                        value="PERCENTAGE"
                        checked={type === 'PERCENTAGE'}
                        onChange={() => {
                          setType('PERCENTAGE');
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      />
                      <span>Porcentaje (%)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="type"
                        value="FIXED"
                        checked={type === 'FIXED'}
                        onChange={() => {
                          setType('FIXED');
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      />
                      <span>Monto fijo ({currency === 'USD' ? '$' : '₡'})</span>
                    </label>
                  </div>
                </div>

                <div className="stack" style={{ gap: '0.4rem' }}>
                  <span className="field__label"><strong>3. Dirección:</strong></span>
                  <div style={{ display: 'flex', gap: '0.8rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="direction"
                        value="INCREASE"
                        checked={direction === 'INCREASE'}
                        onChange={() => {
                          setDirection('INCREASE');
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      />
                      <span style={{ color: '#059669', fontWeight: 600 }}>+ Aumentar</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="direction"
                        value="DECREASE"
                        checked={direction === 'DECREASE'}
                        onChange={() => {
                          setDirection('DECREASE');
                          setPreview(null);
                        }}
                        disabled={applying || simulating}
                      />
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>- Rebajar</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Valor */}
              <label className="field">
                <span className="field__label">
                  <strong>4. Valor del ajuste</strong>{' '}
                  <span className="faint">
                    {type === 'PERCENTAGE'
                      ? '(ej. 10 para 10% o 15.5 para 15.5%)'
                      : `(ej. ${currency === 'USD' ? '5.00' : '1000'} en ${currency})`}
                  </span>
                </span>
                <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="number"
                      step={type === 'PERCENTAGE' ? '0.1' : currency === 'USD' ? '0.01' : '1'}
                      min="0.01"
                      className="input"
                      value={value}
                      onChange={(e) => {
                        setValue(e.target.value);
                        setPreview(null);
                      }}
                      disabled={applying || simulating}
                      placeholder={type === 'PERCENTAGE' ? '10' : '500'}
                      required
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '0.8rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-faint, #888)',
                        fontWeight: 600,
                      }}
                    >
                      {type === 'PERCENTAGE' ? '%' : currency}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--small btn--secondary"
                    onClick={() => void handleSimulate()}
                    disabled={simulating || applying}
                  >
                    {simulating ? 'Simulando...' : 'Previsualizar impacto'}
                  </button>
                </div>
              </label>

              {error ? (
                <div className="alert" style={{ fontSize: '0.84rem' }}>
                  {error}
                </div>
              ) : null}

              {success ? (
                <div
                  className="alert"
                  style={{
                    fontSize: '0.84rem',
                    backgroundColor: '#ecfdf5',
                    color: '#065f46',
                    borderColor: '#a7f3d0',
                  }}
                >
                  ✓ {success}
                </div>
              ) : null}

              {/* Vista previa simulada */}
              {preview ? (
                <div
                  className="stack"
                  style={{
                    gap: '0.6rem',
                    padding: '0.8rem',
                    backgroundColor: 'var(--color-bg-subtle, #f9f9f9)',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border, #e5e5e5)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong>Vista previa del impacto</strong>
                    <span
                      className="mono"
                      style={{
                        fontSize: '0.78rem',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        backgroundColor: '#dbeafe',
                        color: '#1e40af',
                        fontWeight: 600,
                      }}
                    >
                      {preview.totalProducts} producto{preview.totalProducts === 1 ? '' : 's'} a modificar
                    </span>
                  </div>

                  {preview.totalProducts === 0 ? (
                    <p className="mono faint" style={{ fontSize: '0.82rem' }}>
                      No se encontraron productos en la categoría o alcance seleccionado.
                    </p>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          fontSize: '0.82rem',
                          borderCollapse: 'collapse',
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--color-border, #e5e5e5)', textAlign: 'left' }}>
                            <th style={{ padding: '0.4rem 0.3rem' }}>SKU</th>
                            <th style={{ padding: '0.4rem 0.3rem' }}>Nombre</th>
                            <th style={{ padding: '0.4rem 0.3rem', textAlign: 'right' }}>Actual</th>
                            <th style={{ padding: '0.4rem 0.3rem', textAlign: 'right' }}>Nuevo</th>
                            <th style={{ padding: '0.4rem 0.3rem', textAlign: 'right' }}>Dif.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sampleItems.map((item) => {
                            const isIncrease = BigInt(item.differenceMinor) > 0n;
                            const isDecrease = BigInt(item.differenceMinor) < 0n;
                            return (
                              <tr
                                key={item.id}
                                style={{
                                  borderBottom: '1px solid var(--color-border-subtle, #f0f0f0)',
                                }}
                              >
                                <td className="mono" style={{ padding: '0.4rem 0.3rem' }}>
                                  {item.sku}
                                </td>
                                <td style={{ padding: '0.4rem 0.3rem', maxWidth: '10rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.name}
                                </td>
                                <td
                                  className="mono"
                                  style={{ padding: '0.4rem 0.3rem', textAlign: 'right' }}
                                >
                                  {item.currentPriceFormatted}
                                </td>
                                <td
                                  className="mono"
                                  style={{
                                    padding: '0.4rem 0.3rem',
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: isIncrease ? '#059669' : isDecrease ? '#dc2626' : 'inherit',
                                  }}
                                >
                                  {item.newPriceFormatted}
                                </td>
                                <td
                                  className="mono"
                                  style={{
                                    padding: '0.4rem 0.3rem',
                                    textAlign: 'right',
                                    fontSize: '0.78rem',
                                    color: isIncrease ? '#059669' : isDecrease ? '#dc2626' : 'inherit',
                                  }}
                                >
                                  {isIncrease ? '+' : ''}
                                  {item.differenceMinor} {currency === 'USD' ? '¢' : '₡'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {preview.totalProducts > preview.sampleItems.length ? (
                        <p className="mono faint" style={{ fontSize: '0.75rem', marginTop: '0.4rem' }}>
                          Mostrando {preview.sampleItems.length} de {preview.totalProducts} productos impactados.
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className="panel__foot"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.8rem 1.2rem',
                borderTop: '1px solid var(--color-border, #e5e5e5)',
              }}
            >
              <button
                type="button"
                className="btn btn--small btn--ghost"
                disabled={applying || simulating}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>

              <button
                type="button"
                className="btn btn--small btn--primary"
                disabled={
                  applying ||
                  simulating ||
                  !preview ||
                  preview.totalProducts === 0
                }
                onClick={() => void handleApply()}
              >
                {applying
                  ? 'Aplicando ajuste...'
                  : preview
                  ? `Confirmar y aplicar a ${preview.totalProducts} productos`
                  : 'Simulá antes de aplicar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
