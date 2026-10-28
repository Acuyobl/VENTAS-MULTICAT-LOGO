'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  CART_STORAGE_KEY,
  EMPTY_CART,
  cartAdd,
  cartClear,
  cartCount,
  cartRemove,
  cartSetQuantity,
  cartSubtotalMinor,
  parseCart,
  type CartCatalogInput,
  type CartProductInput,
  type CartState,
} from '@/lib/cart';

interface CartContextValue {
  cart: CartState;
  hydrated: boolean;
  count: number;
  subtotalMinor: bigint;
  add: (product: CartProductInput, catalog: CartCatalogInput) => { replaced: boolean };
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
    if (stored) setCart(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (cart.items.length === 0) {
        window.localStorage.removeItem(CART_STORAGE_KEY);
      } else {
        window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
      }
    } catch {
      // localStorage puede estar bloqueado (modo privado); el carrito sigue en memoria.
    }
  }, [cart, hydrated]);

  const add = useCallback(
    (product: CartProductInput, catalog: CartCatalogInput) => {
      const result = cartAdd(cart, product, catalog);
      setCart(result.state);
      return { replaced: result.replaced };
    },
    [cart],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      hydrated,
      count: cartCount(cart),
      subtotalMinor: cartSubtotalMinor(cart),
      add,
      setQuantity: (productId, quantity) =>
        setCart((current) => cartSetQuantity(current, productId, quantity)),
      remove: (productId) => setCart((current) => cartRemove(current, productId)),
      clear: () => setCart(cartClear()),
    }),
    [cart, hydrated, add],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart debe usarse dentro de CartProvider');
  return context;
}
