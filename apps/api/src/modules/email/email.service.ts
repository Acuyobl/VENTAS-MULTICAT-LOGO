import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Los asuntos con acentos o símbolos deben viajar con codificación RFC 2047
 * (`=?UTF-8?B?...?=`); si no, clientes como Mailpit los interpretan como latin-1
 * y muestran «Â·» en lugar de «·».
 */
function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('EMAIL_FROM', 'VentasCatálogo <no-reply@ventascatalogo.local>');
    if (config.get<string>('EMAIL_PROVIDER') === 'smtp') {
      this.transporter = nodemailer.createTransport({
        host: config.get<string>('SMTP_HOST', 'localhost'),
        port: config.get<number>('SMTP_PORT', 1025),
        secure: false,
        auth: config.get<string>('SMTP_USER')
          ? {
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASS'),
            }
          : undefined,
      });
    } else {
      this.transporter = null;
    }
  }

  async send(options: SendMailOptions): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        { to: options.to, subject: options.subject },
        'email_provider_not_configured',
      );
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        ...options,
        subject: encodeSubject(options.subject),
      });
      return true;
    } catch (error) {
      this.logger.error({ err: error, to: options.to }, 'email_send_failed');
      return false;
    }
  }

  async sendInvitation(input: {
    to: string;
    organizationName: string;
    roleName: string;
    link: string;
  }): Promise<boolean> {
    return this.send({
      to: input.to,
      subject: `Te invitaron a ${input.organizationName} en VentasCatálogo`,
      text: `Aceptá la invitación: ${input.link}`,
      html: this.layout(
        'Tenés una silla en la mesa',
        `<p>Te invitaron a <strong>${escapeHtml(input.organizationName)}</strong> como <strong>${escapeHtml(input.roleName)}</strong>.</p>
         <p>El enlace es de un solo uso y vence en 7 días.</p>
         <p><a class="button" href="${input.link}">Aceptar invitación</a></p>
         ${this.fallbackLink(input.link)}`,
      ),
    });
  }

  async sendMagicLink(input: { to: string; link: string; ttlMinutes: number }): Promise<boolean> {
    return this.send({
      to: input.to,
      subject: 'Tu enlace de acceso a VentasCatálogo',
      text: `Entrá con este enlace: ${input.link}`,
      html: this.layout(
        'Entrá sin contraseña',
        `<p>Usá este enlace para entrar a tu cuenta de cliente. Vence en ${input.ttlMinutes} minutos y solo funciona una vez.</p>
         <p><a class="button" href="${input.link}">Entrar a mi cuenta</a></p>
         ${this.fallbackLink(input.link)}`,
      ),
    });
  }

  async sendPasswordReset(input: { to: string; link: string }): Promise<boolean> {
    return this.send({
      to: input.to,
      subject: 'Restablecer tu contraseña',
      text: `Restablecé tu contraseña: ${input.link}`,
      html: this.layout(
        'Nueva llave, misma casa',
        `<p>Pediste restablecer tu contraseña. El enlace vence en 30 minutos.</p>
         <p><a class="button" href="${input.link}">Restablecer contraseña</a></p>
         ${this.fallbackLink(input.link)}`,
      ),
    });
  }

  private fallbackLink(link: string): string {
    return `<p class="muted">Si el botón no abre, copiá esta dirección:<br /><code>${escapeHtml(link)}</code></p>`;
  }

  private layout(title: string, body: string): string {
    return `<!doctype html>
<html lang="es"><body style="margin:0;background:#f6f1e7;font-family:Georgia,serif;color:#14201b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fbf8f1;border:1px solid #d9d2c4;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 18px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#2f6b4f">VentasCatálogo</p>
          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1">${escapeHtml(title)}</h1>
          <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#33413b">${body}</div>
          <p style="margin:28px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#7b827d">VentasCatálogo · Costa Rica</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
  <style>.button{display:inline-block;background:#123d2e;color:#fbf8f1;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold}.muted{color:#7b827d;font-size:13px}code{word-break:break-all}</style>
</body></html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
