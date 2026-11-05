import { Injectable, Logger, OnModuleDestroy, forwardRef, Inject } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import type {
  WhatsappSessionInfo,
  WhatsappSessionStatus,
} from '@ventascatalogo/contracts';
import { WhatsappInboundService } from './whatsapp-inbound.service';

interface OrgSessionState {
  status: WhatsappSessionStatus;
  qr: string | null;
  phone: string | null;
  name: string | null;
  connectedAt: string | null;
  sock: WASocket | null;
  sessionDir: string;
}

@Injectable()
export class WhatsappBaileysService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappBaileysService.name);
  private readonly sessions = new Map<string, OrgSessionState>();

  constructor(
    @Inject(forwardRef(() => WhatsappInboundService))
    private readonly inbound: WhatsappInboundService,
  ) {}

  onModuleDestroy() {
    for (const [orgId, session] of this.sessions.entries()) {
      try {
        session.sock?.end(new Error('app_shutdown'));
      } catch (err) {
        this.logger.warn({ err, orgId }, 'whatsapp_baileys_shutdown_warn');
      }
    }
    this.sessions.clear();
  }

  private getSessionDir(organizationId: string): string {
    const base = path.join(process.cwd(), '.data', 'wa-sessions', organizationId);
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }
    return base;
  }

  private getOrCreateState(organizationId: string): OrgSessionState {
    let state = this.sessions.get(organizationId);
    if (!state) {
      state = {
        status: 'DISCONNECTED',
        qr: null,
        phone: null,
        name: null,
        connectedAt: null,
        sock: null,
        sessionDir: this.getSessionDir(organizationId),
      };
      this.sessions.set(organizationId, state);
    }
    return state;
  }

  getStatus(organizationId: string): WhatsappSessionInfo {
    const state = this.getOrCreateState(organizationId);
    return {
      status: state.status,
      qr: state.qr,
      phone: state.phone,
      name: state.name,
      connectedAt: state.connectedAt,
    };
  }

  isConnected(organizationId: string): boolean {
    const state = this.sessions.get(organizationId);
    return state?.status === 'CONNECTED' && Boolean(state.sock);
  }

  async startSession(organizationId: string): Promise<WhatsappSessionInfo> {
    const state = this.getOrCreateState(organizationId);
    if (state.status === 'CONNECTED' && state.sock) {
      return this.getStatus(organizationId);
    }

    if (state.status === 'SCAN_QR' && state.qr) {
      return this.getStatus(organizationId);
    }

    state.status = 'CONNECTING';

    try {
      const { state: authState, saveCreds } = await useMultiFileAuthState(state.sessionDir);

      const sock = makeWASocket({
        auth: authState,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        syncFullHistory: false,
        defaultQueryTimeoutMs: 30_000,
      });

      state.sock = sock;

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          state.qr = qr;
          state.status = 'SCAN_QR';
          this.logger.log(`[WhatsApp QR] Código QR generado para organización: ${organizationId}`);
        }

        if (connection === 'open') {
          state.status = 'CONNECTED';
          state.qr = null;
          const userJid = sock.user?.id ?? '';
          const phoneRaw = userJid.split(':')[0] ?? userJid.split('@')[0] ?? '';
          state.phone = phoneRaw ? (phoneRaw.startsWith('+') ? phoneRaw : `+${phoneRaw}`) : null;
          state.name = sock.user?.name ?? sock.user?.notify ?? 'WhatsApp Conectado';
          state.connectedAt = new Date().toISOString();
          this.logger.log(
            `[WhatsApp QR] Dispositivo vinculado con éxito: ${state.phone} (${organizationId})`,
          );
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
            ?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          this.logger.warn(
            `[WhatsApp QR] Conexión cerrada (${organizationId}). Razón: ${statusCode}, reconectar=${shouldReconnect}`,
          );

          if (statusCode === DisconnectReason.loggedOut) {
            this.disconnectSession(organizationId);
          } else if (shouldReconnect) {
            state.status = 'CONNECTING';
            setTimeout(() => {
              this.startSession(organizationId).catch((err) => {
                this.logger.error({ err, organizationId }, 'whatsapp_reconnect_failed');
              });
            }, 3000);
          } else {
            state.status = 'DISCONNECTED';
            state.sock = null;
          }
        }
      });

      sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid ?? '';
          if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('broadcast')) {
            continue;
          }

          const rawPhone = remoteJid.replace('@s.whatsapp.net', '');
          const from = rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`;
          const body =
            msg.message?.conversation ||
            msg.message?.extendedTextMessage?.text ||
            msg.message?.imageMessage?.caption ||
            '';

          if (body.trim()) {
            try {
              await this.inbound.processDirectMessage({
                organizationId,
                from,
                contactName: msg.pushName ?? null,
                text: body.trim(),
              });
            } catch (err) {
              this.logger.error({ err, from }, 'whatsapp_baileys_inbound_error');
            }
          }
        }
      });

      return this.getStatus(organizationId);
    } catch (error) {
      this.logger.error({ error, organizationId }, 'whatsapp_baileys_start_failed');
      state.status = 'DISCONNECTED';
      state.sock = null;
      state.qr = null;
      return this.getStatus(organizationId);
    }
  }

  disconnectSession(organizationId: string): WhatsappSessionInfo {
    const state = this.sessions.get(organizationId);
    if (state) {
      try {
        state.sock?.end(new Error('user_disconnected'));
      } catch (err) {
        this.logger.warn({ err, organizationId }, 'whatsapp_disconnect_error');
      }

      state.status = 'DISCONNECTED';
      state.qr = null;
      state.phone = null;
      state.name = null;
      state.connectedAt = null;
      state.sock = null;

      try {
        if (fs.existsSync(state.sessionDir)) {
          fs.rmSync(state.sessionDir, { recursive: true, force: true });
        }
      } catch (err) {
        this.logger.warn({ err }, 'whatsapp_session_dir_remove_error');
      }
    }

    return this.getStatus(organizationId);
  }

  async sendMessage(
    organizationId: string,
    toPhone: string,
    text: string,
  ): Promise<{ ok: boolean; messageId: string | null; error: string | null }> {
    const state = this.sessions.get(organizationId);
    if (!state || state.status !== 'CONNECTED' || !state.sock) {
      return { ok: false, messageId: null, error: 'whatsapp_not_connected' };
    }

    const cleanPhone = toPhone.replace(/[^0-9]/g, '');
    const jid = `${cleanPhone}@s.whatsapp.net`;

    try {
      const result = await state.sock.sendMessage(jid, { text });
      return { ok: true, messageId: result?.key?.id ?? null, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'whatsapp_baileys_send_error';
      this.logger.error({ err, to: toPhone }, 'whatsapp_baileys_send_failed');
      return { ok: false, messageId: null, error: msg };
    }
  }

  simulateConnect(organizationId: string, phone = '+506 8888-8888'): WhatsappSessionInfo {
    const state = this.getOrCreateState(organizationId);
    state.status = 'CONNECTED';
    state.phone = phone;
    state.name = 'WhatsApp Simulado (Modo Dev)';
    state.connectedAt = new Date().toISOString();
    state.qr = null;
    return this.getStatus(organizationId);
  }
}
