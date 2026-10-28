import type { StorefrontCustomer } from '@ventascatalogo/contracts';

/** Datos mínimos del cliente invitado (contrato `storefrontCustomerSchema`). */
export type GuestCustomerInput = StorefrontCustomer;

export type GuestCustomerLookup = { by: 'email'; value: string } | { by: 'phone'; value: string };

export function normalizeGuestEmail(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Teléfono del invitado: se colapsan espacios/saltos para comparar contra lo que
 * ya está guardado (`+506 8888-1111` y `+506   8888-1111` son el mismo cliente).
 */
export function normalizeGuestPhone(value: string | null | undefined): string | null {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Criterio de búsqueda/creación del `Customer` invitado: el email manda; si no
 * hay email se usa el teléfono. Sin ninguno de los dos no se puede reutilizar el
 * cliente y se crea uno nuevo.
 */
export function guestCustomerLookup(input: GuestCustomerInput): GuestCustomerLookup | null {
  const email = normalizeGuestEmail(input.email);
  if (email) return { by: 'email', value: email };
  const phone = normalizeGuestPhone(input.phone);
  if (phone) return { by: 'phone', value: phone };
  return null;
}
