import type { Metadata } from 'next';
import type { ExpenseListResponse } from '@ventascatalogo/contracts';
import { tryApiFetch } from '@/lib/api';
import type { CatalogSummary } from '@/lib/types';
import { ExpensesPanel } from '@/components/backoffice/expenses-panel';

export const metadata: Metadata = {
  title: 'Gastos',
};

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  const [catalogs, expenses] = await Promise.all([
    tryApiFetch<{ items: CatalogSummary[] }>('/catalogs'),
    tryApiFetch<ExpenseListResponse>('/expenses?limit=50'),
  ]);

  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Dinero · gastos</span>
          <h1 className="display">
            Lo que <em>sale</em>.
          </h1>
          <p>
            Insumos, transporte, servicios y planilla: cada gasto queda asociado al catálogo y suma
            al reporte de utilidad del mes.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>{expenses?.totals.count ?? 0}</strong>
          <span>gastos registrados</span>
        </div>
      </header>

      <ExpensesPanel
        catalogs={catalogs?.items ?? []}
        initial={expenses ?? { items: [], nextCursor: null, totals: { count: 0, amountMinor: '0', taxMinor: '0', byCategory: [] } }}
      />
    </div>
  );
}
