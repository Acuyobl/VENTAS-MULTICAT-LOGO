import { createHmac, timingSafeEqual } from 'node:crypto';

/** Tolerancia de reloj aceptada para el timestamp de Stripe (5 minutos). */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

/** Firma Stripe: `HMAC-SHA256(secret, "t.payload")` en hex. */
export function computeStripeSignature(
  secret: string,
  timestamp: number,
  payload: Buffer | string,
): string {
  const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;
  return createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex');
}

function secureEqualsHex(a: string, b: string): boolean {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifica el header `stripe-signature` (`t=<unix>,v1=<hmac>[,v1=…]`).
 * Nunca lanza: cualquier header malformado, firma inválida o timestamp fuera de
 * la tolerancia devuelve `false`.
 */
export function verifyStripeSignature(
  header: string | undefined,
  payload: Buffer | string,
  secret: string,
  now: Date = new Date(),
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;

  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [key, value] = part.trim().split('=');
    if (key === 't' && value) timestamp = Number.parseInt(value, 10);
    if (key === 'v1' && value) signatures.push(value);
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestamp);
  if (ageSeconds > toleranceSeconds) return false;

  const expected = computeStripeSignature(secret, timestamp, payload);
  return signatures.some((signature) => secureEqualsHex(expected, signature));
}
