import type { Metadata } from 'next';
import { FinanceReportView } from '@/components/backoffice/finance-report';

export const metadata: Metadata = {
  title: 'Finanzas',
};

export const dynamic = 'force-dynamic';

export default function FinancePage() {
  return (
    <div>
      <header className="page-head">
        <div>
          <span className="eyebrow">Dinero · reportes</span>
          <h1 className="display">
            La plata, <em>clara</em>.
          </h1>
          <p>
            Ventas netas, cobros por método, reembolsos, cuentas por cobrar y conciliación del rango.
            Los montos salen de pagos y pedidos reales, no de una planilla paralela.
          </p>
        </div>
        <div className="page-head__aside">
          <strong>¢</strong>
          <span>conciliación por método</span>
        </div>
      </header>

      <FinanceReportView />
    </div>
  );
}
