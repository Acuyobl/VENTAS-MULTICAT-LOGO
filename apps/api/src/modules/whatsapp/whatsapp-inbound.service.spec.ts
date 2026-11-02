import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../storage/storage.service';
import { WhatsappInboundService, type WhatsappMediaDownloader } from './whatsapp-inbound.service';

interface CreatedMessage {
  conversationId: string;
  senderType: string;
  body: string;
  attachmentKey: string | null;
}

function buildService() {
  const created: CreatedMessage[] = [];
  const tx = {
    chatMessage: {
      create: vi.fn().mockImplementation(async ({ data }: { data: CreatedMessage }) => {
        created.push(data);
        return { id: `msg-${created.length}`, createdAt: new Date(), ...data };
      }),
    },
    chatConversation: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    organization: { findUnique: vi.fn().mockResolvedValue({ id: 'org-1' }) },
    catalog: { findFirst: vi.fn().mockResolvedValue({ id: 'cat-1' }) },
    customer: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'customer-1' }),
    },
    chatConversation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi
        .fn()
        .mockResolvedValue({ id: 'conv-1', externalId: '50688881111', channel: 'WHATSAPP' }),
      update: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi
      .fn()
      .mockImplementation(async (callback: (t: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;

  const values: Record<string, string | number> = {
    WHATSAPP_ORG_SLUG: 'demo',
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_API_VERSION: 'v21.0',
    WHATSAPP_MEDIA_MAX_BYTES: 10 * 1024 * 1024,
  };
  const config = {
    get: vi.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  } as unknown as ConfigService;
  const storage = {
    putDocument: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;

  return {
    service: new WhatsappInboundService(prisma, config, storage),
    created,
    storage,
  };
}

function payload(message: Record<string, unknown>) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name: 'Cliente WA' } }],
              messages: [{ from: '50688881111', id: 'wamid-1', ...message }],
            },
          },
        ],
      },
    ],
  };
}

const downloaded = {
  buffer: Buffer.from('SKU,Nombre\nA1,Café'),
  mimeType: 'text/csv',
  filename: 'pedido.csv',
  extension: 'csv',
};

describe('WhatsappInboundService · media', () => {
  it('guarda el adjunto y crea mensaje CUSTOMER con caption', async () => {
    const { service, created, storage } = buildService();
    const downloader: WhatsappMediaDownloader = vi.fn().mockResolvedValue(downloaded);

    const processed = await service.process(
      payload({
        type: 'document',
        document: {
          id: 'media-1',
          filename: 'pedido.csv',
          mime_type: 'text/csv',
          caption: '  Lista de precios  ',
        },
      }),
      downloader,
    );

    expect(processed).toBe(1);
    expect(storage.putDocument).toHaveBeenCalledWith(
      'whatsapp/org-1/wamid-1.csv',
      downloaded.buffer,
      'text/csv',
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      senderType: 'CUSTOMER',
      body: 'Lista de precios',
      attachmentKey: 'whatsapp/org-1/wamid-1.csv',
    });
  });

  it('imagen sin caption usa "📎 Archivo"', async () => {
    const { service, created } = buildService();
    const downloader: WhatsappMediaDownloader = vi
      .fn()
      .mockResolvedValue({
        ...downloaded,
        filename: null,
        extension: 'jpg',
        mimeType: 'image/jpeg',
      });
    await service.process(
      payload({ type: 'image', image: { id: 'media-2', mime_type: 'image/jpeg' } }),
      downloader,
    );
    expect(created[0]?.body).toBe('📎 Archivo');
    expect(created[0]?.attachmentKey).toBe('whatsapp/org-1/wamid-1.jpg');
  });

  it('si la descarga falla crea mensaje de texto sin adjunto y no rompe', async () => {
    const { service, created } = buildService();
    const downloader: WhatsappMediaDownloader = vi.fn().mockResolvedValue(null);
    const processed = await service.process(
      payload({
        type: 'document',
        document: { id: 'media-3', filename: 'virus.exe', mime_type: 'application/zip' },
      }),
      downloader,
    );
    expect(processed).toBe(1);
    expect(created[0]?.attachmentKey).toBeNull();
    expect(created[0]?.body).toContain('No pudimos adjuntar "virus.exe"');
  });

  it('sigue procesando texto normal', async () => {
    const { service, created } = buildService();
    const processed = await service.process(
      payload({ type: 'text', text: { body: '  Hola  ' } }),
      vi.fn(),
    );
    expect(processed).toBe(1);
    expect(created[0]).toMatchObject({ body: 'Hola', attachmentKey: null });
  });
});
