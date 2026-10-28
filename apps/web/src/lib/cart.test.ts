import { describe, expect, it } from 'vitest';
import {
  EMPTY_CART,
  cartAdd,
  cartClear,
  cartCount,
  cartRemove,
  cartSetQuantity,
  cartSubtotalMinor,
  parseCart,
} from './cart';

const cafe = {
  productId: '11111111-1111-7111-8111-111111111111',
  sku: 'CAF-001',
  name: 'Café de altura',
  priceMinor: '11300',
  currency: 'CRC' as const,
  imageUrl: null,
};

const miel = {
  productId: '22222222-2222-7222-8222-222222222222',
  sku: 'MIE-001',
  name: 'Miel de abeja',
  priceMinor: '8500',
  currency: 'CRC' as const,
};

const catalog = { slug: 'catalogo-demo', name: 'Catálogo Demo' };

describe('cart', () => {
  it('agrega, incrementa y cuenta cantidades', () => {
    const first = cartAdd(EMPTY_CART, cafe, catalog);
    expect(first.replaced).toBe(false);
    expect(cartCount(first.state)).toBe(1);

    const second = cartAdd(first.state, cafe, catalog);
    expect(cartCount(second.state)).toBe(2);
    expect(second.state.items).toHaveLength(1);
  });

  it('calcula el subtotal en enteros de unidad menor', () => {
    const withCafe = cartAdd(EMPTY_CART, cafe, catalog).state;
    const both = cartAdd(withCafe, miel, catalog).state;
    const updated = cartSetQuantity(both, miel.productId, 2);
    expect(cartSubtotalMinor(updated)).toBe(BigInt(11300 + 8500 * 2));
  });

  it('quita líneas y vacía el carrito', () => {
    const both = cartAdd(cartAdd(EMPTY_CART, cafe, catalog).state, miel, catalog).state;
    const withoutCafe = cartRemove(both, cafe.productId);
    expect(withoutCafe.items.map((line) => line.sku)).toEqual(['MIE-001']);
    expect(cartClear().items).toHaveLength(0);
  });

  it('cantidad 0 elimina la línea y nunca supera el máximo', () => {
    const state = cartAdd(EMPTY_CART, cafe, catalog).state;
    expect(cartSetQuantity(state, cafe.productId, 0).items).toHaveLength(0);
    expect(cartSetQuantity(state, cafe.productId, 5000).items[0]?.quantity).toBe(999);
  });

  it('vacía el carrito al cambiar de catálogo', () => {
    const state = cartAdd(EMPTY_CART, cafe, catalog).state;
    const other = cartAdd(state, miel, { slug: 'otro-catalogo', name: 'Otro' });
    expect(other.replaced).toBe(true);
    expect(other.state.items).toHaveLength(1);
    expect(other.state.catalogSlug).toBe('otro-catalogo');
  });

  it('persiste y recupera un carrito válido, e ignora datos corruptos', () => {
    const state = cartAdd(EMPTY_CART, cafe, catalog).state;
    const restored = parseCart(JSON.stringify(state));
    expect(restored?.catalogSlug).toBe('catalogo-demo');
    expect(restored?.items[0]?.quantity).toBe(1);
    expect(parseCart('{no-json')).toBeNull();
    expect(parseCart(JSON.stringify({ catalogSlug: 'x', items: [] }))).toBeNull();
  });
});
