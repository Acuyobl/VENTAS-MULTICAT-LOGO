import { sha256, randomToken } from '../../common/utils/crypto';

/** El enlace público del pedido vive 30 días desde el checkout. */
export const ORDER_TOKEN_TTL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GeneratedOrderToken {
  /** Token en claro: solo se devuelve al crear el pedido. */
  token: string;
  /** SHA-256 que se persiste en `Order.publicToken` (nunca el token en claro). */
  tokenHash: string;
}

/** Hash determinístico del token. Se guarda en la base; el claro no se persiste. */
export function hashOrderToken(token: string): string {
  return sha256(token.trim());
}

export function generateOrderToken(): GeneratedOrderToken {
  const token = randomToken(32);
  return { token, tokenHash: hashOrderToken(token) };
}

export function orderTokenExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + ORDER_TOKEN_TTL_DAYS * DAY_MS);
}

export function isOrderTokenExpired(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= now.getTime();
}
