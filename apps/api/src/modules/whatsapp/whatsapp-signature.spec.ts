import { describe, expect, it } from 'vitest';
import { computeWhatsappSignature, verifyWhatsappSignature } from './whatsapp-signature';

const SECRET = 'app-secret-test';
const PAYLOAD = Buffer.from(
  JSON.stringify({ entry: [{ changes: [{ value: { messages: [] } }] }] }),
  'utf8',
);

describe('whatsapp-signature', () => {
  it('acepta la firma sha256 correcta', () => {
    const signature = computeWhatsappSignature(SECRET, PAYLOAD);
    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(verifyWhatsappSignature(signature, PAYLOAD, SECRET)).toBe(true);
  });

  it('rechaza payload alterado, secreto distinto o header malformado', () => {
    const signature = computeWhatsappSignature(SECRET, PAYLOAD);
    const tampered = Buffer.from(`${PAYLOAD.toString()} `, 'utf8');
    expect(verifyWhatsappSignature(signature, tampered, SECRET)).toBe(false);
    expect(verifyWhatsappSignature(signature, PAYLOAD, 'otro')).toBe(false);
    expect(verifyWhatsappSignature(undefined, PAYLOAD, SECRET)).toBe(false);
    expect(verifyWhatsappSignature('sha256=deadbeef', PAYLOAD, SECRET)).toBe(false);
    expect(verifyWhatsappSignature(`sha1=${signature.slice(7)}`, PAYLOAD, SECRET)).toBe(false);
  });
});
