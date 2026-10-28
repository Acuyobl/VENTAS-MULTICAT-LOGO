import { describe, expect, it } from 'vitest';
import {
  computeStripeSignature,
  STRIPE_SIGNATURE_TOLERANCE_SECONDS,
  verifyStripeSignature,
} from './stripe-signature';

const SECRET = 'whsec_test_secret';
const PAYLOAD = Buffer.from(
  JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' }),
  'utf8',
);
const NOW = new Date('2026-01-01T12:00:00.000Z');
const TIMESTAMP = Math.floor(NOW.getTime() / 1000);

function header(timestamp: number, signature: string): string {
  return `t=${timestamp},v1=${signature}`;
}

describe('stripe-signature', () => {
  it('acepta una firma válida', () => {
    const signature = computeStripeSignature(SECRET, TIMESTAMP, PAYLOAD);
    expect(verifyStripeSignature(header(TIMESTAMP, signature), PAYLOAD, SECRET, NOW)).toBe(true);
    expect(STRIPE_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
  });

  it('rechaza payload alterado o secreto distinto', () => {
    const signature = computeStripeSignature(SECRET, TIMESTAMP, PAYLOAD);
    const tampered = Buffer.from(`${PAYLOAD.toString()} `, 'utf8');
    expect(verifyStripeSignature(header(TIMESTAMP, signature), tampered, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(header(TIMESTAMP, signature), PAYLOAD, 'otro-secreto', NOW)).toBe(
      false,
    );
  });

  it('rechaza un timestamp fuera de la tolerancia', () => {
    const oldTimestamp = TIMESTAMP - 301;
    const signature = computeStripeSignature(SECRET, oldTimestamp, PAYLOAD);
    expect(verifyStripeSignature(header(oldTimestamp, signature), PAYLOAD, SECRET, NOW)).toBe(
      false,
    );
  });

  it('rechaza headers malformados o sin secreto', () => {
    const signature = computeStripeSignature(SECRET, TIMESTAMP, PAYLOAD);
    expect(verifyStripeSignature(undefined, PAYLOAD, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(`v1=${signature}`, PAYLOAD, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(header(TIMESTAMP, 'no-hex'), PAYLOAD, SECRET, NOW)).toBe(false);
    expect(verifyStripeSignature(header(TIMESTAMP, signature), PAYLOAD, '', NOW)).toBe(false);
  });

  it('acepta si hay varias firmas v1 y una coincide', () => {
    const signature = computeStripeSignature(SECRET, TIMESTAMP, PAYLOAD);
    const multi = `t=${TIMESTAMP},v1=${'0'.repeat(64)},v1=${signature}`;
    expect(verifyStripeSignature(multi, PAYLOAD, SECRET, NOW)).toBe(true);
  });
});
