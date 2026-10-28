'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportResult } from '@ventascatalogo/contracts';

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

const MAPPING_FIELDS: Array<{ key: MappingKey; label: string; placeholder: string }> = [
  { key: 'sku', label: 'SKU', placeholder: 'SKU' },
  { key: 'name', label: 'Nombre', placeholder: 'Nombre' },
  { key: 'description', label: 'Descripción', placeholder: 'Descripción' },
  { key: 'category', label: 'Categoría', placeholder: 'Categoría' },
  { key: 'brand', label: 'Marca', placeholder: 'Marca' },
  { key: 'price', label: 'Precio', placeholder: 'Precio' },
  { key: 'cost', label: 'Costo', placeholder: 'Costo' },
  { key: 'stock', label: 'Stock', placeholder: 'Stock' },
  { key: 'image', label: 'Imagen', placeholder: 'Imagen' },
];

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
  const [currency, setCurrency] = useState<'CRC' | 'USD'>('CRC');
  const [taxRateBp, setTaxRateBp] = useState('1300');
  const [taxIncluded, setTaxIncluded] = useState(true);
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
  const [advanced, setAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Elegí un archivo CSV o XLSX.');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('currency', currency);
      form.append('taxRateBp', taxRateBp);
      form.append('taxIncluded', String(taxIncluded));
      const explicitMapping = Object.fromEntries(
        Object.entries(mapping).filter(([, value]) => value.trim().length > 0),
      );
      if (Object.keys(explicitMapping).length > 0) {
        form.append('mapping', JSON.stringify(explicitMapping));
      }

      const response = await fetch(`/api/v1/catalogs/${catalogId}/imports`, {
        method: 'POST',
        body: form,
        headers: { accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as
        | ImportResult
        | { message?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          (payload as { message?: string } | null)?.message ?? 'No pudimos importar el archivo.',
        );
      }
      setResult(payload as ImportResult);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
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
          <h2>Importar catálogo</h2>
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            CSV o XLSX · validación con cuarentena por fila.
          </p>
        </div>
        <span className="mono faint">SHA-256 idempotente</span>
      </div>

      <div className="panel__body">
        <form className="form-grid" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field__label">Archivo</span>
            <input
              ref={fileInput}
              className="input"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!canWrite || loading}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="field">
            <span className="field__label">Moneda</span>
            <select
              className="select"
              value={currency}
              disabled={!canWrite || loading}
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
              disabled={!canWrite || loading}
              onChange={(event) => setTaxRateBp(event.target.value.replace(/[^0-9]/g, ''))}
            />
            <span className="field__hint">1300 = 13 %. Se congela en la versión importada.</span>
          </label>

          <label className="field field--check">
            <input
              type="checkbox"
              checked={taxIncluded}
              disabled={!canWrite || loading}
              onChange={(event) => setTaxIncluded(event.target.checked)}
            />
            <span className="field__label">Los precios del archivo incluyen IVA</span>
          </label>

          <details
            open={advanced}
            onToggle={(event) => setAdvanced((event.target as HTMLDetailsElement).open)}
          >
            <summary className="mono faint" style={{ cursor: 'pointer' }}>
              Mapeo de columnas (opcional: el importador detecta los encabezados)
            </summary>
            <div className="form-grid" style={{ marginTop: '0.8rem' }}>
              {MAPPING_FIELDS.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field__label">{field.label}</span>
                  <input
                    className="input"
                    placeholder={field.placeholder}
                    value={mapping[field.key]}
                    disabled={!canWrite || loading}
                    onChange={(event) =>
                      setMapping((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </details>

          <div aria-live="polite">
            {error ? <div className="alert">{error}</div> : null}
            {!canWrite ? (
              <div className="alert">Tu rol no tiene <code>catalog:write</code> para importar.</div>
            ) : null}
          </div>

          <button className="btn btn--wide" type="submit" disabled={!canWrite || loading || !file}>
            {loading ? 'Importando y validando…' : 'Importar y validar'}
          </button>
        </form>

        {result ? (
          <div style={{ marginTop: '1.2rem' }} aria-live="polite">
            <div className={result.quarantineRows > 0 ? 'alert' : 'alert alert--ok'}>
              Versión <strong>v{result.versionNumber}</strong> creada ·{' '}
              {result.totalRows} filas leídas · <strong>{result.importedRows}</strong> productos ·{' '}
              <strong>{result.quarantineRows}</strong> en cuarentena.
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
