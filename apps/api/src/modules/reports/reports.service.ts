import { Injectable } from '@nestjs/common';
import type {
  FinanceReport,
  ReconciliationReport,
  ReportRangeQuery,
} from '@ventascatalogo/contracts';
import { ReportsRepository } from './reports.repository';
import { resolveReportRange } from './report-range';
import { buildTopProducts, computeOrderTotals, computeReceivables } from './report-calculations';
import { AppException } from '../../common/errors/app-exception';

@Injectable()
export class ReportsService {
  constructor(private readonly repo: ReportsRepository) {}

  async finance(organizationId: string, query: ReportRangeQuery): Promise<FinanceReport> {
    const organization = await this.requireOrganization(organizationId);
    const range = resolveReportRange(query);

    const [orderRows, paymentRows, refunds, balanceRows, itemRows] = await Promise.all([
      this.repo.salesOrders(organizationId, range, query.catalogId),
      this.repo.confirmedPayments(organizationId, range),
      this.repo.refundsInRange(organizationId, range),
      this.repo.orderBalances(organizationId, range),
      this.repo.paidOrderItems(organizationId, range),
    ]);

    const sales = computeOrderTotals(orderRows);
    const receivables = computeReceivables(balanceRows, range.end);

    const byMethod = new Map<string, { count: number; totalMinor: bigint }>();
    for (const payment of paymentRows) {
      const method = payment.method ?? payment.provider;
      const current = byMethod.get(method) ?? { count: 0, totalMinor: 0n };
      current.count += 1;
      current.totalMinor += payment.amountMinor;
      byMethod.set(method, current);
    }
    const paymentsTotal = paymentRows.reduce((sum, payment) => sum + payment.amountMinor, 0n);

    const processed = refunds.filter((refund) => refund.status === 'PROCESSED');
    const topProducts = buildTopProducts(
      itemRows.map((item) => ({
        productId: item.productId,
        name: item.nameSnapshot,
        quantity: item.quantity,
        revenueMinor: item.lineTotalMinor,
      })),
    );

    return {
      range: { from: range.from, to: range.to },
      currency: organization.defaultCurrency,
      sales: {
        orders: sales.orders,
        byStatus: sales.byStatus,
        grossMinor: sales.grossMinor.toString(),
        discountMinor: sales.discountMinor.toString(),
        taxMinor: sales.taxMinor.toString(),
        netMinor: sales.netMinor.toString(),
        paidMinor: sales.paidMinor.toString(),
        refundedMinor: sales.refundedMinor.toString(),
      },
      payments: {
        count: paymentRows.length,
        totalMinor: paymentsTotal.toString(),
        byMethod: [...byMethod.entries()]
          .map(([method, value]) => ({
            method,
            count: value.count,
            totalMinor: value.totalMinor.toString(),
          }))
          .sort((a, b) => (BigInt(b.totalMinor) > BigInt(a.totalMinor) ? 1 : -1)),
      },
      refunds: {
        requestedCount: refunds.length,
        processedCount: processed.length,
        requestedMinor: refunds.reduce((sum, refund) => sum + refund.amountMinor, 0n).toString(),
        processedMinor: processed.reduce((sum, refund) => sum + refund.amountMinor, 0n).toString(),
      },
      receivables: {
        openOrders: receivables.openOrders,
        openBalanceMinor: receivables.openBalanceMinor.toString(),
        overdueOrders: receivables.overdueOrders,
        overdueBalanceMinor: receivables.overdueBalanceMinor.toString(),
      },
      topProducts: topProducts.map((product) => ({
        productId: product.productId,
        name: product.name,
        quantity: product.quantity,
        revenueMinor: product.revenueMinor.toString(),
      })),
    };
  }

  async reconciliation(
    organizationId: string,
    query: ReportRangeQuery,
  ): Promise<ReconciliationReport> {
    const organization = await this.requireOrganization(organizationId);
    const range = resolveReportRange(query);

    const paymentRows = await this.repo.confirmedPayments(organizationId, range);
    const refundedByPayment = await this.repo.processedRefundsByPayment(
      organizationId,
      paymentRows.map((payment) => payment.id),
    );

    let registeredMinor = 0n;
    let refundedMinor = 0n;
    const rows = paymentRows.map((payment) => {
      const refunded = refundedByPayment.get(payment.id) ?? 0n;
      registeredMinor += payment.amountMinor;
      refundedMinor += refunded;
      return {
        paymentId: payment.id,
        orderNumber: payment.order?.number ?? '',
        date: (payment.paidAt ?? payment.createdAt).toISOString(),
        method: payment.method ?? payment.provider,
        provider: payment.provider,
        amountMinor: payment.amountMinor.toString(),
        status: payment.status,
        reference: payment.reference,
      };
    });

    return {
      range: { from: range.from, to: range.to },
      currency: organization.defaultCurrency,
      rows,
      totals: {
        count: rows.length,
        registeredMinor: registeredMinor.toString(),
        refundedMinor: refundedMinor.toString(),
        netMinor: (registeredMinor - refundedMinor).toString(),
      },
    };
  }

  private async requireOrganization(organizationId: string) {
    const organization = await this.repo.findOrganization(organizationId);
    if (!organization) throw new AppException('NOT_FOUND', 404, { resource: 'organization' });
    return organization;
  }
}
