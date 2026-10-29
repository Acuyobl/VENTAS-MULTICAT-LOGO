'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  ImportPreview,
  ImportResult,
  MappingProposal,
} from '@ventascatalogo/contracts';

interface ImportPanelProps {
  catalogId: string;
  canWrite: boolean;
}

type MappingKey =
  | 'sku'
  | 'name'
  | 'description'
  | 'category'
  | 'brand'
  | 'price'
  | 'cost'
  | 'stock'
  | 'image';

const MAPPING_FIELDS: Array<{ key: MappingKey; label: string }> = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Nombre' },
  { key: 'description', label: 'Descripción' },
  { key: 'category', label: 'Categoría' },
  { key: 'brand', label: 'Marca' },
  { key: 'price', label: 'Precio' },
  { key: 'cost', label: 'Costo' },
  { key: 'stock', label: 'Stock' },
  { key: 'image', label: 'Imagen' },
];

interface ExtraFieldRow {
  column: string;
  key: string;
  label: string;
  type: string;
  include: boolean;
}

type ImportResultWithMeta = ImportResult & { mode?: string; carriedOver?: number };

function downloadIssues(result: ImportResult) {
  const header = 'fila,severidad,codigo,mensaje\n';
  const rows = result.issues
    .map((issue) =>
      [issue.rowNumber, issue.severity, issue.code, `"${issue.message.replace(/"/g, '""')}"`].join(
        ',',
      ),
    )
    .join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `cuarentena-v${result.versionNumber}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportPanel({ catalogId, canWrite }: ImportPanelProps) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<MappingKey, string>>({
    sku: '',
    name: '',
    description: '',
    category: '',
    brand: '',
    price: '',
    cost: '',
    stock: '',
    image: '',
  });
  const [extraFields, setExtraFields] = useState<ExtraFieldRow[]>([]);
  const [mode, setMode] = useState<'REPLACE' | 'MERGE'>('REPLACE');
  const [activateVersion, setActivateVersion] = useState(true);
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [taxRateBp, setTaxRateBp] = useState('1300');
  const [taxIncluded, setTaxIncluded] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResultWithMeta | null>(null);

  function proposalFrom(previewResponse: ImportPreview): MappingProposal {
    return previewResponse.proposal;
  }

  async function analyze() {
    if (!file) {
      setError('Elegí un archivo CSV o XLSX.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('useAgent', 'true');
      const response = await fetch(`/api/v1/catalogs/${catalogId}/imports/preview`, {
        method: 'POST',
        body: form,
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as
        | ImportPreview
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ??
            'No pudimos analizar el archivo. Podés importar directo.',
        );
      }
      const data = payload as ImportPreview;
      setPreview(data);
      const proposal = proposalFrom(data);
      setMapping({
        sku: proposal.mapping.sku ?? '',
        name: proposal.mapping.name ?? '',
        description: proposal.mapping.description ?? '',
        category: proposal.mapping.category ?? '',
        brand: proposal.mapping.brand ?? '',
        price: proposal.mapping.price ?? '',
        cost: proposal.mapping.cost ?? '',
        stock: proposal.mapping.stock ?? '',
        image: proposal.mapping.image ?? '',
      });
      setExtraFields(
        proposal.extraFields.map((field) => ({
          column: field.column,
          key: field.key,
          label: field.label,
          type: field.type,
          include: true,
        })),
      );
      if (data.preset) {
        setSaveTemplate(false);
        setTemplateName('');
      }
    } catch (caught) {
      setPreview(null);
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function importCatalog(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!file) {
      setError('Elegí un archivo CSV o XLSX.');
      return;
    }
    if (mode === 'REPLACE') {
      const confirmed = window.confirm(
        'Modo Reemplazar: el catálogo quedará SOLO con los productos del archivo. ' +
          'Los productos que no vengan en el archivo dejarán de estar activos cuando actives esta versión ' +
          '(la versión anterior se archiva, no se borra). ¿Continuar?',
      );
      if (!confirmed) return;
    }
    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('currency', currency);
      form.append('taxRateBp', taxRateBp);
      form.append('taxIncluded', String(taxIncluded));
      form.append('mode', mode);
      form.append('saveTemplate', String(saveTemplate));
      if (saveTemplate && templateName.trim()) form.append('templateName', templateName.trim());

      const explicitMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, value]) => value.trim().length > 0),
      );
      if (Object.keys(explicitMapping).length > 0) {
        form.append('mapping', JSON.stringify(explicitMapping));
      }
      const selectedExtras = extraFields
        .filter((field) => field.include)
        .map((field) => ({
          column: field.column,
          key: field.key,
          label: field.label,
          type: field.type,
        }));
      if (selectedExtras.length > 0) {
        form.append('extraFields', JSON.stringify(selectedExtras));
      }

      const response = await fetch(`/api/v1/catalogs/${catalogId}/imports`, {
        method: 'POST',
        body: form,
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as
        | ImportResultWithMeta
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos importar el archivo.',
        );
      }
      setResult(payload as ImportResultWithMeta);
      const imported = payload as ImportResultWithMeta;
      if (activateVersion) {
        const activateResponse = await fetch(
          `/api/v1/catalogs/${catalogId}/versions/${imported.catalogVersionId}/activate`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        );
        if (!activateResponse.ok) {
          const activatePayload = (await activateResponse.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(
            activatePayload?.message ??
              'La versión se importó pero no pudimos activarla; activala desde Versiones.',
          );
        }
      }
      setFile(null);
      setPreview(null);
      if (fileInput.current) fileInput.current.value = '';
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Error inesperado.');
    } finally {
      setImporting(false);
    }
  }

  const headers = preview?.headers ?? [];

  return (
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2>Importar catálogo</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            CSV o XLSX · el analizador propone el mapeo; vos confirmás antes de importar.
          </p>
        </div>
        <span className="mono faint">IA + heurística</span>
      </div>

      <div className="panel__body">
        <div className="form-grid">
          <label className="field">
            <span className="field__label">Archivo</span>
            <input
              ref={fileInput}
              className="input"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canWrite || importing || analyzing}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
                setError(null);
              }}
            />
          </label>

          <div className="inline" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--small btn--secondary"
              disabled={!canWrite || !file || analyzing}
              onClick={() => void analyze()}
            >
              {analyzing ? 'Analizando…' : 'Analizar con IA'}
            </button>
            <span className="mono faint" style={{ fontSize: '0.7rem' }}>
              Propone mapeo, campos extra e ignora columnas de totales. Después podés editarlo.
            </span>
          </div>
        </div>

        {preview ? (
          <div style={{ marginTop: '1.2rem' }} className="stack">
            <div className="alert alert--ok">
              <strong>Propuesta del analizador</strong> · confianza{' '}
              {(proposalFrom(preview).confidence * 100).toFixed(0)} % ·{' '}
              {proposalFrom(preview).agent
                ? `IA ${proposalFrom(preview).agent?.provider} (${proposalFrom(preview).agent?.model})`
                : 'heurística determinista'}
              {preview.preset ? ` · plantilla «${preview.preset.name}» aplicada` : ''}
              <p style={{ marginTop: '0.4rem' }}>{proposalFrom(preview).explanation}</p>
            </div>

            {proposalFrom(preview).warnings.length > 0 ? (
              <div className="alert">
                <strong>Avisos:</strong>
                <ul className="check-list" style={{ marginTop: '0.3rem' }}>
                  {proposalFrom(preview).warnings.map((warning) => (
                    <li key={warning}>
                      <span className="check-list__dot">!</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Columna</th>
                    <th>Tipo detectado</th>
                    <th>Confianza</th>
                    <th>Ejemplos</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.columns.map((column) => (
                    <tr key={column.header}>
                      <td>{column.header}</td>
                      <td>
                        <span className="badge">{column.type}</span>
                      </td>
                      <td className="table__num">{(column.confidence * 100).toFixed(0)} %</td>
                      <td className="mono faint">{column.samples.join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details open>
              <summary className="mono faint" style={{ cursor: 'pointer' }}>
                Mapeo propuesto (editable)
              </summary>
              <div className="form-grid" style={{ marginTop: '0.6rem' }}>
                {MAPPING_FIELDS.map((field) => (
                  <label className="field" key={field.key}>
                    <span className="field__label">{field.label}</span>
                    <select
                      className="select"
                      value={mapping[field.key]}
                      disabled={!canWrite || importing}
                      onChange={(event) =>
                        setMapping((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    >
                      <option value="">— no mapear —</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                      {mapping[field.key] && !headers.includes(mapping[field.key]) ? (
                        <option value={mapping[field.key]}>{mapping[field.key]}</option>
                      ) : null}
                    </select>
                  </label>
                ))}
              </div>
            </details>

            {extraFields.length > 0 ? (
              <div>
                <h3 style={{ fontSize: '1rem', marginBottom: '0.4rem' }}>
                  Campos extra (se guardan como atributos del producto)
                </h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Incluir</th>
                        <th>Columna</th>
                        <th>Campo</th>
                        <th>Etiqueta</th>
                        <th>Tipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraFields.map((field, index) => (
                        <tr key={`${field.column}-${index}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={field.include}
                              disabled={!canWrite || importing}
                              onChange={(event) =>
                                setExtraFields((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, include: event.target.checked }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>{field.column}</td>
                          <td>
                            <input
                              className="input"
                              value={field.key}
                              disabled={!canWrite || importing}
                              onChange={(event) =>
                                setExtraFields((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          key: event.target.value
                                            .toLowerCase()
                                            .replace(/[^a-z0-9_]/g, '_'),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="input"
                              value={field.label}
                              disabled={!canWrite || importing}
                              onChange={(event) =>
                                setExtraFields((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="mono faint">{field.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {proposalFrom(preview).ignoredColumns.length > 0 ? (
              <p className="mono faint" style={{ fontSize: '0.72rem' }}>
                Se ignoran:{' '}
                {proposalFrom(preview)
                  .ignoredColumns.map((item) => `${item.column} (${item.reason})`)
                  .join(' · ')}
              </p>
            ) : null}

            <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="field">
                <span className="field__label">Modo de carga</span>
                <select
                  className="select"
                  value={mode}
                  disabled={!canWrite || importing}
                  onChange={(event) => setMode(event.target.value as 'REPLACE' | 'MERGE')}
                >
                  <option value="REPLACE">Reemplazar (borra los que no vengan en el archivo)</option>
                  <option value="MERGE">Fusionar (conserva los productos que no vienen)</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">Moneda</span>
                <select
                  className="select"
                  value={currency}
                  disabled={!canWrite || importing}
                  onChange={(event) => setCurrency(event.target.value as 'CRC' | 'USD')}
                >
                  <option value="CRC">CRC (colones)</option>
                  <option value="USD">USD (dólares)</option>
                </select>
              </label>
              <label className="field">
                <span className="field__label">IVA (puntos base)</span>
                <input
                  className="input"
                  inputMode="numeric"
                  value={taxRateBp}
                  disabled={!canWrite || importing}
                  onChange={(event) => setTaxRateBp(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </label>
              <label className="field field--check">
                <input
                  type="checkbox"
                  checked={taxIncluded}
                  disabled={!canWrite || importing}
                  onChange={(event) => setTaxIncluded(event.target.checked)}
                />
                <span className="field__label">Los precios incluyen IVA</span>
              </label>
            </div>

            <div className="inline" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
              <label className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={activateVersion}
                  disabled={!canWrite || importing}
                  onChange={(event) => setActivateVersion(event.target.checked)}
                />
                <span style={{ fontSize: '0.82rem' }}>
                  Activar esta versión al importar (reemplaza la que ve la tienda)
                </span>
              </label>
              <label className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={saveTemplate}
                  disabled={!canWrite || importing}
                  onChange={(event) => setSaveTemplate(event.target.checked)}
                />
                <span style={{ fontSize: '0.82rem' }}>Guardar plantilla para próximas cargas</span>
              </label>
              {saveTemplate ? (
                <input
                  className="input"
                  style={{ maxWidth: '16rem' }}
                  placeholder="Nombre de la plantilla (proveedor)"
                  value={templateName}
                  disabled={!canWrite || importing}
                  onChange={(event) => setTemplateName(event.target.value)}
                />
              ) : null}
            </div>

            {error ? <div className="alert">{error}</div> : null}

            <div className="inline">
              <button
                type="button"
                className="btn"
                disabled={!canWrite || importing || !file}
                onClick={() => void importCatalog()}
              >
                {importing ? 'Importando y validando…' : 'Importar con este plan'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={!canWrite || importing || !file}
                onClick={() => {
                  setPreview(null);
                  void importCatalog();
                }}
              >
                Importar directo (sin plan)
              </button>
            </div>
          </div>
        ) : (
          <div className="form-grid" style={{ marginTop: '1rem' }}>
            {error ? <div className="alert">{error}</div> : null}
            {!canWrite ? (
              <div className="alert">
                Tu rol no tiene <code>catalog:write</code> para importar.
              </div>
            ) : null}
            <div className="inline">
              <button
                type="button"
                className="btn btn--secondary"
                disabled={!canWrite || importing || !file}
                onClick={() => void importCatalog()}
              >
                {importing ? 'Importando…' : 'Importar sin analizar'}
              </button>
              <label className="inline" style={{ gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={activateVersion}
                  disabled={!canWrite || importing}
                  onChange={(event) => setActivateVersion(event.target.checked)}
                />
                <span style={{ fontSize: '0.8rem' }}>Activar al importar</span>
              </label>
              <span className="mono faint" style={{ fontSize: '0.7rem' }}>
                Sin análisis se intenta mapear por sinónimos de encabezado.
              </span>
            </div>
          </div>
        )}

        {result ? (
          <div style={{ marginTop: '1.2rem' }} aria-live="polite">
            <div className={result.quarantineRows > 0 ? 'alert' : 'alert alert--ok'}>
              Versión <strong>v{result.versionNumber}</strong> creada · {result.totalRows} filas
              leídas · <strong>{result.importedRows}</strong> productos ·{' '}
              <strong>{result.quarantineRows}</strong> en cuarentena
              {result.mode ? ` · modo ${result.mode}` : ''}
              {typeof result.carriedOver === 'number'
                ? ` · ${result.carriedOver} conservados`
                : ''}
              .
              {result.idempotent ? (
                <span> El archivo ya se había importado: se reutilizó la misma versión.</span>
              ) : null}
            </div>

            {result.issues.length > 0 ? (
              <>
                <div className="panel__head" style={{ paddingInline: 0 }}>
                  <h3>Filas en cuarentena</h3>
                  <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => downloadIssues(result)}
                  >
                    Descargar CSV
                  </button>
                </div>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fila</th>
                        <th>Código</th>
                        <th>Mensaje</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.issues.map((issue) => (
                        <tr key={`${issue.rowNumber}-${issue.code}`}>
                          <td className="table__num">{issue.rowNumber}</td>
                          <td>
                            <span className="badge badge--danger">{issue.code}</span>
                          </td>
                          <td>{issue.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="panel__foot">
        Las filas con error no crean producto: quedan en cuarentena con el motivo y la fila original.
      </div>
    </section>
  );
}
