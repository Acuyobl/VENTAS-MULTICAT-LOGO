import { describe, expect, it } from 'vitest';
import { AppException } from '../../common/errors/app-exception';
import { buildQuoteLines, type QuoteProductSnapshot } from './quote-calculator';

function product(overrides: Partial<QuoteProductSnapshot> = {}): QuoteProductSnapshot {
  return {
    id: 'p-1',
    sku: 'SKU-113',
    name: 'Producto de ₡11.300',
    priceMinor: 11_300n,
    stock: 10,
    allowBackorder: false,
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

function productsMap(items: QuoteProductSnapshot[]): Map<string, QuoteProductSnapshot> {
  return new Map(items.map((item) => [item.id, item]));
}

describe('buildQuoteLines', () => {
  it('2 × ₡11.300 con IVA incluido da subtotal 20.000, IVA 2.600 y total 22.600', () => {
    const result = buildQuoteLines([{ productId: 'p-1', quantity: 2 }], productsMap([product()]), {
      taxRateBp: 1300,
      taxIncluded: true,
    });

    expect(result.totals.subtotalMinor).toBe(20_000n);
    expect(result.totals.taxMinor).toBe(2_600n);
    expect(result.totals.totalMinor).toBe(22_600n);
    expect(result.lines).toEqual([
      {
        productId: 'p-1',
        skuSnapshot: 'SKU-113',
        nameSnapshot: 'Producto de ₡11.300',
        unitPriceMinor: 11_300n,
        quantity: 2,
        discountMinor: 0n,
        lineTotalMinor: 22_600n,
      },
    ]);
  });

  it('el descuento por línea se aplica antes del IVA', () => {
    const result = buildQuoteLines(
      [{ productId: 'p-1', quantity: 2, discountMinor: 2_600n }],
      productsMap([product()]),
      { taxRateBp: 1300, taxIncluded: true },
    );

    expect(result.lines[0]?.lineTotalMinor).toBe(20_000n);
    expect(result.totals.discountMinor).toBe(2_600n);
    expect(result.totals.subtotalMinor).toBe(17_699n);
    expect(result.totals.taxMinor).toBe(2_301n);
    expect(result.totals.totalMinor).toBe(20_000n);
  });

  it('calcula IVA agregado cuando taxIncluded es false', () => {
    const result = buildQuoteLines(
      [{ productId: 'p-1', quantity: 1 }],
      productsMap([product({ priceMinor: 10_000n })]),
      { taxRateBp: 1300, taxIncluded: false },
    );

    expect(result.totals.subtotalMinor).toBe(10_000n);
    expect(result.totals.taxMinor).toBe(1_300n);
    expect(result.totals.totalMinor).toBe(11_300n);
  });

  it('rechaza stock insuficiente con PRODUCT_OUT_OF_STOCK y el disponible', async () => {
    const error = await Promise.resolve(
      (() => {
        try {
          buildQuoteLines(
            [{ productId: 'p-1', quantity: 3 }],
            productsMap([product({ stock: 2 })]),
            {
              taxRateBp: 1300,
              taxIncluded: true,
            },
          );
        } catch (caught) {
          return caught;
        }
        return null;
      })(),
    );

    expect(error).toBeInstanceOf(AppException);
    expect(error).toMatchObject({ code: 'PRODUCT_OUT_OF_STOCK' });
    expect((error as AppException).getStatus()).toBe(409);
    expect((error as AppException).getResponse()).toMatchObject({
      details: { productId: 'p-1', available: 2, requested: 3 },
    });
  });

  it('permite sin stock cuando el producto admite backorder', () => {
    const result = buildQuoteLines(
      [{ productId: 'p-1', quantity: 50 }],
      productsMap([product({ stock: 0, allowBackorder: true })]),
      { taxRateBp: 1300, taxIncluded: true },
    );
    expect(result.lines[0]?.quantity).toBe(50);
  });

  it('rechaza un producto inactivo', () => {
    expect(() =>
      buildQuoteLines(
        [{ productId: 'p-1', quantity: 1 }],
        productsMap([product({ isActive: false })]),
        {
          taxRateBp: 1300,
          taxIncluded: true,
        },
      ),
    ).toThrow(expect.objectContaining({ code: 'PRODUCT_INACTIVE' }));
  });

  it('rechaza un producto que no está en la versión activa', () => {
    expect(() =>
      buildQuoteLines([{ productId: 'no-existe', quantity: 1 }], productsMap([]), {
        taxRateBp: 1300,
        taxIncluded: true,
      }),
    ).toThrow(expect.objectContaining({ code: 'PRODUCT_NOT_IN_ACTIVE_VERSION' }));
  });

  it('rechaza un descuento mayor que la línea', () => {
    expect(() =>
      buildQuoteLines(
        [{ productId: 'p-1', quantity: 1, discountMinor: 20_000n }],
        productsMap([product()]),
        { taxRateBp: 1300, taxIncluded: true },
      ),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });
});
