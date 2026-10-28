import { describe, expect, it } from 'vitest';
import { base32Decode, generateTotp, secondsRemaining } from './totp';

// RFC 6238, apéndice B (HMAC-SHA1). El secreto ASCII "12345678901234567890"
// codificado en base32 es el que usa la tabla oficial.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp', () => {
  it('decodifica base32 y rechaza secretos inválidos', () => {
    expect(Array.from(base32Decode('GEZDGNBVGY3TQOJQ'))).toEqual([
      49, 50, 51, 52, 53, 54, 55, 56, 57, 48,
    ]);
    expect(() => base32Decode('NO-VALIDO!')).toThrow('invalid_base32_secret');
    expect(() => base32Decode('')).toThrow('invalid_base32_secret');
  });

  it('genera los códigos de 6 dígitos del RFC 6238', async () => {
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, expected] of vectors) {
      const code = await generateTotp(RFC_SECRET, seconds * 1000);
      expect(code, `T=${seconds}`).toBe(expected);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('cambia de código al cruzar la ventana de 30 segundos', async () => {
    const inWindow = await generateTotp(RFC_SECRET, 30_000);
    const nextWindow = await generateTotp(RFC_SECRET, 60_000);
    expect(inWindow).not.toBe(nextWindow);
    expect(await generateTotp(RFC_SECRET, 30_000 + 10_000)).toBe(inWindow);
  });

  it('calcula los segundos restantes de la ventana', () => {
    expect(secondsRemaining(0)).toBe(30);
    expect(secondsRemaining(29_000)).toBe(1);
    expect(secondsRemaining(30_000)).toBe(30);
    expect(secondsRemaining(45_000)).toBe(15);
  });
});
