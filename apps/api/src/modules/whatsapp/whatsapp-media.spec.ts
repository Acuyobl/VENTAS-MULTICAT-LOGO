import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WHATSAPP_MEDIA_MAX_BYTES,
  WHATSAPP_MEDIA_TIMEOUT_MS,
  downloadWhatsappMedia,
  mediaMimeType,
  parseInboundMedia,
  safeMediaExtension,
  whatsappAttachmentKey,
} from './whatsapp-media';

const CSV = Buffer.from('SKU,Nombre,Precio\nA1,Café,1000\n', 'utf8');

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function mediaResponse(buffer: Buffer, headers: Record<string, string> = {}): Response {
  return new Response(buffer, {
    status: 200,
    headers: { 'content-type': 'text/csv', 'content-length': String(buffer.length), ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseInboundMedia', () => {
  it('parsea imagen con caption', () => {
    expect(
      parseInboundMedia({
        from: '50688881111',
        id: 'wamid.1',
        type: 'image',
        image: { id: 'media-1', caption: '  Ver foto  ', mime_type: 'image/png' },
      }),
    ).toMatchObject({
      type: 'image',
      mediaId: 'media-1',
      caption: 'Ver foto',
      mimeType: 'image/png',
    });
  });

  it('parsea documento con filename/mime', () => {
    expect(
      parseInboundMedia({
        from: '50688881111',
        id: 'wamid.2',
        type: 'document',
        document: {
          id: 'media-2',
          filename: '../../pedido.csv',
          mime_type: 'text/csv',
          caption: 'Lista',
        },
      }),
    ).toMatchObject({ type: 'document', filename: '../../pedido.csv', mimeType: 'text/csv' });
  });

  it('ignora tipos sin media o no soportados', () => {
    expect(parseInboundMedia({ from: '1', id: 'x', type: 'text' })).toBeNull();
    expect(parseInboundMedia({ from: '1', id: 'x', type: 'image' })).toBeNull();
    expect(parseInboundMedia({ from: '1', id: 'x', type: 'audio' })).toBeNull();
  });
});

describe('extensión/key seguras', () => {
  it('usa basename y whitelist; evita path traversal', () => {
    expect(safeMediaExtension('../../etc/passwd.csv', null)).toBe('csv');
    expect(safeMediaExtension('C:\\tmp\\pedido.XLSX', null)).toBe('xlsx');
    expect(safeMediaExtension('pedido.exe', 'application/zip')).toBeNull();
    expect(safeMediaExtension(null, 'image/jpeg')).toBe('jpg');
    expect(safeMediaExtension(null, 'text/plain; charset=utf-8')).toBe('txt');
  });

  it('key sin caracteres raros', () => {
    expect(whatsappAttachmentKey('org-1', 'wamid../x', 'csv')).toBe('whatsapp/org-1/wamidx.csv');
    expect(whatsappAttachmentKey('org-1', 'msg-1', 'pdf')).toBe('whatsapp/org-1/msg-1.pdf');
    expect(mediaMimeType('csv')).toBe('text/csv');
    expect(mediaMimeType('exe')).toBeNull();
  });
});

describe('downloadWhatsappMedia', () => {
  it('descarga metadata + archivo con bearer y devuelve buffer/mime/ext', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          url: 'https://lookaside.fbsbx.com/whatsapp/media/1',
          mime_type: 'text/csv',
          file_size: CSV.length,
          filename: 'pedido.csv',
        }),
      )
      .mockResolvedValueOnce(mediaResponse(CSV));
    const result = await downloadWhatsappMedia('media-1', {
      accessToken: 'token',
      fetchImpl: fetchMock,
    });

    expect(result?.buffer.equals(CSV)).toBe(true);
    expect(result?.extension).toBe('csv');
    expect(result?.mimeType).toBe('text/csv');
    const [, firstOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((firstOptions.headers as Record<string, string>).Authorization).toBe('Bearer token');
    expect(WHATSAPP_MEDIA_TIMEOUT_MS).toBe(20_000);
    expect(WHATSAPP_MEDIA_MAX_BYTES).toBe(10 * 1024 * 1024);
  });

  it('rechaza si file_size supera el máximo', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        url: 'https://x/media',
        mime_type: 'application/pdf',
        file_size: WHATSAPP_MEDIA_MAX_BYTES + 1,
      }),
    );
    await expect(
      downloadWhatsappMedia('m', { accessToken: 't', fetchImpl: fetchMock }),
    ).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza MIME/extensión no permitidos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ url: 'https://x/media', mime_type: 'application/zip', filename: 'a.exe' }),
      );
    await expect(
      downloadWhatsappMedia('m', { accessToken: 't', fetchImpl: fetchMock }),
    ).resolves.toBeNull();
  });

  it('corta el stream si supera el tope aunque no haya content-length', async () => {
    const big = Buffer.alloc(WHATSAPP_MEDIA_MAX_BYTES + 10, 0x41);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ url: 'https://x/media', mime_type: 'text/csv', filename: 'a.csv' }),
      )
      .mockResolvedValueOnce(
        new Response(big, { status: 200, headers: { 'content-type': 'text/csv' } }),
      );
    await expect(
      downloadWhatsappMedia('m', { accessToken: 't', fetchImpl: fetchMock }),
    ).resolves.toBeNull();
  });

  it('error de Graph o de red → null sin lanzar', async () => {
    const notOk = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'x' }, 400));
    await expect(
      downloadWhatsappMedia('m', { accessToken: 't', fetchImpl: notOk }),
    ).resolves.toBeNull();

    const reject = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      downloadWhatsappMedia('m', { accessToken: 't', fetchImpl: reject }),
    ).resolves.toBeNull();
  });
});
