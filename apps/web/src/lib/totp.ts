/**
 * TOTP (RFC 6238) en el navegador: SHA-1, 6 dígitos, ventana de 30 s.
 * Se usa para autocompletar el código durante el enrolamiento (el cliente recibe el secreto)
 * y en los flujos de desarrollo donde el helper de MFA está habilitado.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;

export function base32Decode(input: string): Uint8Array {
  const clean = input
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[\s-]/g, '');
  if (!clean) throw new Error('invalid_base32_secret');

  let buffer = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const value = BASE32_ALPHABET.indexOf(char);
    if (value === -1) throw new Error('invalid_base32_secret');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

export async function generateTotp(
  secret: string,
  timestampMs: number = Date.now(),
  periodSeconds: number = TOTP_PERIOD_SECONDS,
  digits: number = TOTP_DIGITS,
): Promise<string> {
  const counter = Math.floor(timestampMs / 1000 / periodSeconds);
  const counterBytes = new Uint8Array(8);
  const view = new DataView(counterBytes.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32), false);
  view.setUint32(4, counter >>> 0, false);

  const key = await crypto.subtle.importKey(
    'raw',
    // TS 5.9 tipa los typed arrays como genéricos sobre ArrayBufferLike; WebCrypto
    // acepta cualquier ArrayBufferView, así que se acota aquí y no en los tests.
    base32Decode(secret) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));
  const offset = (signature[signature.length - 1] ?? 0) & 0x0f;
  const binary =
    ((signature[offset] ?? 0) & 0x7f) * 2 ** 24 +
    ((signature[offset + 1] ?? 0) << 16) +
    ((signature[offset + 2] ?? 0) << 8) +
    (signature[offset + 3] ?? 0);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function secondsRemaining(
  timestampMs: number = Date.now(),
  periodSeconds: number = TOTP_PERIOD_SECONDS,
): number {
  return periodSeconds - (Math.floor(timestampMs / 1000) % periodSeconds);
}
