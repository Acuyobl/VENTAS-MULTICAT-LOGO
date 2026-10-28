import { describe, expect, it } from 'vitest';
import { buildProductUpdateDiff, isProductVersionEditable } from './product-update';

const current = {
  name: 'Café de altura',
  description: 'Tueste medio',
  category: 'Despensa',
  brand: 'Demo',
  priceMinor: 6_000n,
  costMinor: 3_000n,
  stock: 10,
};

describe('buildProductUpdateDiff', () => {
  it('solo incluye los campos enviados que cambian (bigint como string)', () => {
    const diff = buildProductUpdateDiff(current, {
      name: 'Café de altura premium',
      priceMinor: 7_500n,
      stock: 10,
      brand: undefined,
    });
    expect(diff.data).toEqual({ name: 'Café de altura premium', priceMinor: 7_500n });
    expect(diff.before).toEqual({ name: 'Café de altura', priceMinor: '6000' });
    expect(diff.after).toEqual({ name: 'Café de altura premium', priceMinor: '7500' });
  });

  it('acepta null para limpiar campos opcionales', () => {
    const diff = buildProductUpdateDiff(current, { description: null, costMinor: null });
    expect(diff.data).toEqual({ description: null, costMinor: null });
    expect(diff.before).toEqual({ description: 'Tueste medio', costMinor: '3000' });
    expect(diff.after).toEqual({ description: null, costMinor: null });
  });

  it('cuerpo sin cambios devuelve diff vacío', () => {
    const diff = buildProductUpdateDiff(current, { priceMinor: 6_000n, stock: 10 });
    expect(diff).toEqual({ data: {}, before: {}, after: {} });
  });
});

describe('isProductVersionEditable', () => {
  it('solo permite editar la versión ACTIVE del catálogo', () => {
    expect(
      isProductVersionEditable({
        versionId: 'v1',
        versionStatus: 'ACTIVE',
        activeVersionId: 'v1',
      }),
    ).toBe(true);
    expect(
      isProductVersionEditable({
        versionId: 'v1',
        versionStatus: 'ARCHIVED',
        activeVersionId: 'v1',
      }),
    ).toBe(false);
    expect(
      isProductVersionEditable({
        versionId: 'v1',
        versionStatus: 'VALIDATED',
        activeVersionId: 'v2',
      }),
    ).toBe(false);
    expect(
      isProductVersionEditable({
        versionId: 'v1',
        versionStatus: 'ACTIVE',
        activeVersionId: null,
      }),
    ).toBe(false);
  });
});
