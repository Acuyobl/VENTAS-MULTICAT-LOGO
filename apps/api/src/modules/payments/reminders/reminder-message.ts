import { formatMoney, type Currency } from '@ventascatalogo/contracts';

export interface ReminderMessageInput {
  customerName: string;
  orderNumber: string;
  balanceMinor: bigint;
  currency: Currency;
  paymentUrl: string | null;
  organizationName: string;
}

export interface ReminderMessage {
  subject: string;
  text: string;
  html: string;
}

/**
 * Mensaje de recordatorio de cobro (EMAIL y cuerpo de WhatsApp). Puro para poder
 * testearlo: incluye número de pedido, saldo pendiente y el link de pago público
 * si la organización ya generó uno.
 */
export function buildReminderMessage(input: ReminderMessageInput): ReminderMessage {
  const balance = formatMoney(input.balanceMinor, input.currency);
  const subject = `Recordatorio de pago · Pedido ${input.orderNumber}`;
  const linkLine = input.paymentUrl
    ? `Podés pagar en línea desde este enlace: ${input.paymentUrl}`
    : 'Coordiná el pago con nuestro equipo de ventas.';
  const text = [
    `Hola ${input.customerName},`,
    '',
    `Te recordamos que el pedido ${input.orderNumber} tiene un saldo pendiente de ${balance}.`,
    linkLine,
    '',
    `Gracias, ${input.organizationName}.`,
  ].join('\n');
  const html = [
    `<p>Hola ${escapeHtml(input.customerName)},</p>`,
    `<p>Te recordamos que el pedido <strong>${escapeHtml(input.orderNumber)}</strong> tiene un saldo pendiente de <strong>${escapeHtml(balance)}</strong>.</p>`,
    input.paymentUrl
      ? `<p><a href="${escapeHtml(input.paymentUrl)}">Pagar en línea</a></p><p class="muted">Si el botón no abre, copiá: <code>${escapeHtml(input.paymentUrl)}</code></p>`
      : '<p>Coordiná el pago con nuestro equipo de ventas.</p>',
    `<p>Gracias,<br />${escapeHtml(input.organizationName)}</p>`,
  ].join('\n');

  return { subject, text, html };
}

/** Cuerpo plano para WhatsApp (sin HTML). */
export function buildWhatsappReminderBody(input: ReminderMessageInput): string {
  return buildReminderMessage(input).text;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
