import { describe, expect, it } from 'vitest';
import { formatMoney } from '@ventascatalogo/contracts';
import { buildReminderMessage, buildWhatsappReminderBody } from './reminder-message';

const base = {
  customerName: 'María Solís',
  orderNumber: 'PED-2026-000042',
  balanceMinor: 6_300n,
  currency: 'CRC' as const,
  organizationName: 'VentasCatálogo',
};

describe('buildReminderMessage', () => {
  it('incluye pedido, saldo formateado y link cuando existe', () => {
    const message = buildReminderMessage({
      ...base,
      paymentUrl: 'https://tienda.localhost:3010/pago/token-123',
    });

    expect(message.subject).toBe('Recordatorio de pago · Pedido PED-2026-000042');
    expect(message.text).toContain('María Solís');
    expect(message.text).toContain('PED-2026-000042');
    expect(message.text).toContain(formatMoney(6_300n, 'CRC'));
    expect(message.text).toContain('https://tienda.localhost:3010/pago/token-123');
    expect(message.html).toContain('href="https://tienda.localhost:3010/pago/token-123"');
  });

  it('sin link de pago invita a coordinar el cobro', () => {
    const message = buildReminderMessage({ ...base, paymentUrl: null });
    expect(message.text).toContain('Coordiná el pago');
    expect(message.text).not.toContain('/pago/');
    expect(message.html).toContain('Coordiná el pago');
  });

  it('escapa HTML de los datos del cliente', () => {
    const message = buildReminderMessage({
      ...base,
      customerName: '<script>alert(1)</script>',
      paymentUrl: null,
    });
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('el cuerpo de WhatsApp es plano (sin etiquetas HTML)', () => {
    const body = buildWhatsappReminderBody({ ...base, paymentUrl: null });
    expect(body).not.toMatch(/<[a-z][^>]*>/i);
    expect(body).toContain('PED-2026-000042');
  });
});
