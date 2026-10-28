import { describe, expect, it } from 'vitest';
import {
  ORDER_TOKEN_TTL_DAYS,
  generateOrderToken,
  hashOrderToken,
  isOrderTokenExpired,
  orderTokenExpiry,
} from './token';

describe('storefront token', () => {
  it('hashea el token con SHA-256 (64 hex) y es determinístico', () => {
    const token = 'token-de-prueba-1234567890';
    const hash = hashOrderToken(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOrderToken(token)).toBe(hash);
    expect(hashOrderToken(`  ${token}  `)).toBe(hash);
    expect(hashOrderToken('otro-token-distinto')).not.toBe(hash);
  });

  it('genera tokens largos, aleatorios y con su hash', () => {
    const first = generateOrderToken();
    const second = generateOrderToken();
    expect(first.token.length).toBeGreaterThanOrEqual(40);
    expect(first.token).not.toBe(second.token);
    expect(first.tokenHash).toBe(hashOrderToken(first.token));
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('expira a los 30 días', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const expires = orderTokenExpiry(from);
    expect(ORDER_TOKEN_TTL_DAYS).toBe(30);
    const diffDays = (expires.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(30);
  });

  it('detecta la expiración y trata null como no vencido', () => {
    const now = new Date('2026-01-31T00:00:00.000Z');
    expect(isOrderTokenExpired(new Date('2026-01-30T23:59:59.000Z'), now)).toBe(true);
    expect(isOrderTokenExpired(new Date('2026-01-31T00:00:01.000Z'), now)).toBe(false);
    expect(isOrderTokenExpired(null, now)).toBe(false);
    expect(isOrderTokenExpired(undefined, now)).toBe(false);
  });
});
