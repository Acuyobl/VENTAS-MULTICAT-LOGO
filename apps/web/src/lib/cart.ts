export type CartCurrency = 'CRC' | 'USD';

export interface CartLine {
  productId: string;
  sku: string;
  name: string;
  priceMinor: string;
  currency: CartCurrency;
  imageUrl: string | null;
  quantity: number;
}

export interface CartState {
  catalogSlug: string;
  catalogName: string;
  currency: CartCurrency;
  items: CartLine[];
  updatedAt: string;
}

export const EMPTY_CART: CartState = {
  catalogSlug: '',
  catalogName: '',
  currency: 'CRC',
  items: [],
  updatedAt: '',
};

export const CART_STORAGE_KEY = 'vc.cart.v1';
export const MAX_LINE_QUANTITY = 999;

export interface CartProductInput {
  productId: string;
  sku: string;
  name: string;
  priceMinor: string;
  currency: CartCurrency;
  imageUrl?: string | null;
}

export interface CartCatalogInput {
  slug: string;
  name: string;
}

function withTimestamp(state: CartState): CartState {
  return { ...state, updatedAt: new Date().toISOString() };
}

/**
 * Agrega un producto. Si el carrito pertenece a otro catálogo, se vacía antes de agregar
 * (un carrito nunca mezcla catálogos) y se marca `replaced` para avisar al usuario.
 */
export function cartAdd(
  state: CartState,
  product: CartProductInput,
  catalog: CartCatalogInput,
): { state: CartState; replaced: boolean } {
  const replaced = state.items.length > 0 && state.catalogSlug !== catalog.slug;
  const base: CartState = replaced
    ? { ...EMPTY_CART, catalogSlug: catalog.slug, catalogName: catalog.name }
    : { ...state, catalogSlug: catalog.slug, catalogName: catalog.name };

  const existing = base.items.find((line) => line.productId === product.productId);
  const items = existing
    ? base.items.map((line) =>
        line.productId === product.productId
          ? { ...line, quantity: Math.min(line.quantity + 1, MAX_LINE_QUANTITY) }
          : line,
      )
    : [
        ...base.items,
        {
          productId: product.productId,
          sku: product.sku,
          name: product.name,
          priceMinor: product.priceMinor,
          currency: product.currency,
          imageUrl: product.imageUrl ?? null,
          quantity: 1,
        },
      ];

  return {
    state: withTimestamp({ ...base, currency: product.currency, items }),
    replaced,
  };
}

export function cartSetQuantity(state: CartState, productId: string, quantity: number): CartState {
  const safeQuantity = Math.max(0, Math.min(Math.trunc(quantity) || 0, MAX_LINE_QUANTITY));
  const items =
    safeQuantity === 0
      ? state.items.filter((line) => line.productId !== productId)
      : state.items.map((line) =>
          line.productId === productId ? { ...line, quantity: safeQuantity } : line,
        );
  return withTimestamp({ ...state, items });
}

export function cartRemove(state: CartState, productId: string): CartState {
  return withTimestamp({
    ...state,
    items: state.items.filter((line) => line.productId !== productId),
  });
}

export function cartClear(): CartState {
  return withTimestamp({ ...EMPTY_CART });
}

export function cartCount(state: CartState): number {
  return state.items.reduce((total, line) => total + line.quantity, 0);
}

export function cartSubtotalMinor(state: CartState): bigint {
  return state.items.reduce(
    (total, line) => total + BigInt(line.priceMinor) * BigInt(line.quantity),
    0n,
  );
}

export function parseCart(raw: string | null): CartState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CartState>;
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.catalogSlug !== 'string') {
      return null;
    }
    const items = parsed.items
      .filter(
        (line): line is CartLine =>
          Boolean(line) &&
          typeof line.productId === 'string' &&
          typeof line.name === 'string' &&
          typeof line.priceMinor === 'string' &&
          Number.isInteger(line.quantity) &&
          line.quantity > 0,
      )
      .map((line) => ({ ...line, quantity: Math.min(line.quantity, MAX_LINE_QUANTITY) }));
    if (items.length === 0) return null;
    return {
      catalogSlug: parsed.catalogSlug,
      catalogName: typeof parsed.catalogName === 'string' ? parsed.catalogName : '',
      currency: parsed.currency === 'USD' ? 'USD' : 'CRC',
      items,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}
