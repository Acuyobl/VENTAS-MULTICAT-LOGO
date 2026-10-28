import { createHmac, timingSafeEqual } from 'node:crypto';

/** Header de Meta: `sha256=<hex>` calculado sobre el body crudo. */
export function computeWhatsappSignature(secret: string, rawBody: Buffer | string): string {
  const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/**
 * Verifica `x-hub-signature-256` de WhatsApp Cloud API. Nunca lanza: header
 * ausente/malformado o firma inválida devuelven `false`.
 */
export function verifyWhatsappSignature(
  header: string | undefined,
  rawBody: Buffer | string,
  secret: string,
): boolean {
  if (!header || !secret || !header.startsWith('sha256=')) return false;
  const provided = header.slice('sha256='.length);
  if (!/^[a-f0-9]{64}$/i.test(provided)) return false;
  const expected = createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}
