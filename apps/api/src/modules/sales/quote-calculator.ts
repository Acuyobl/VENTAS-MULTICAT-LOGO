import { calculateTotals, type QuoteItemInput, type Totals } from '@ventascatalogo/contracts';
import { AppException } from '../../common/errors/app-exception';

/** Datos del producto de la versión activa que necesita la cotización. */
export interface QuoteProductSnapshot {
  id: string;
  sku: string;
  name: string;
  priceMinor: bigint;
  stock: number | null;
  allowBackorder: boolean;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface BuiltQuoteLine {
  productId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  unitPriceMinor: bigint;
  quantity: number;
  discountMinor: bigint;
  lineTotalMinor: bigint;
}

export interface QuoteCalculation {
  lines: BuiltQuoteLine[];
  totals: Totals;
}

export interface QuoteCalculationOptions {
  taxRateBp: number;
  taxIncluded: boolean;
}

/**
 * Reglas R4 de la cotización: el producto tiene que existir en la versión activa
 * (snapshot de SKU/nombre/precio), estar activo y tener stock suficiente salvo
 * `allowBackorder`. El dinero se calcula con `calculateTotals` (descuento por
 * línea antes del IVA), nunca con floats.
 */
export function buildQuoteLines(
  items: readonly QuoteItemInput[],
  products: ReadonlyMap<string, QuoteProductSnapshot>,
  options: QuoteCalculationOptions,
): QuoteCalculation {
  const lines: BuiltQuoteLine[] = [];

  for (const item of items) {
    const product = products.get(item.productId);
    if (!product) {
      throw new AppException('PRODUCT_NOT_IN_ACTIVE_VERSION', 409, {
        productId: item.productId,
      });
    }
    if (product.deletedAt || !product.isActive) {
      throw new AppException('PRODUCT_INACTIVE', 409, { productId: item.productId });
    }
    if (!product.allowBackorder && product.stock !== null && product.stock < item.quantity) {
      throw new AppException('PRODUCT_OUT_OF_STOCK', 409, {
        productId: item.productId,
        available: product.stock,
        requested: item.quantity,
      });
    }

    const unitPriceMinor = product.priceMinor;
    const discountMinor = item.discountMinor ?? 0n;
    const grossMinor = unitPriceMinor * BigInt(item.quantity);
    if (discountMinor > grossMinor) {
      throw new AppException('VALIDATION_FAILED', 400, {
        fieldErrors: {
          items: [
            `El descuento de "${product.sku}" (${discountMinor}) supera el total de la línea (${grossMinor}).`,
          ],
        },
      });
    }

    lines.push({
      productId: product.id,
      skuSnapshot: product.sku,
      nameSnapshot: product.name,
      unitPriceMinor,
      quantity: item.quantity,
      discountMinor,
      lineTotalMinor: grossMinor - discountMinor,
    });
  }

  const totals = calculateTotals(
    lines.map((line) => ({
      unitPriceMinor: line.unitPriceMinor,
      quantity: line.quantity,
      discountMinor: line.discountMinor,
    })),
    options.taxRateBp,
    options.taxIncluded,
  );

  return { lines, totals };
}
