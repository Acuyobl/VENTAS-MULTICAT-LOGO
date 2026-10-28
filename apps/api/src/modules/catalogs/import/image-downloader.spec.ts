import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadImage, ImageDownloadError, IMAGE_DOWNLOAD_TIMEOUT_MS } from './image-downloader';
import { MAX_PRODUCT_IMAGE_BYTES } from '../../storage/image-utils';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function jsonResponse(
  body: Buffer,
  contentType: string,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, ...extraHeaders },
  });
}

describe('downloadImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('descarga una imagen permitida con timeout de 8 s', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(PNG_BYTES, 'image/png; charset=binary'));
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadImage('https://cdn.example.com/foto.png');

    expect(result.contentType).toBe('image/png');
    expect(result.buffer.equals(PNG_BYTES)).toBe(true);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
    expect(IMAGE_DOWNLOAD_TIMEOUT_MS).toBe(8000);
  });

  it('falla con http_error si la URL responde 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 404 })));

    await expect(downloadImage('https://cdn.example.com/falta.png')).rejects.toMatchObject({
      reason: 'http_error',
    });
  });

  it('falla con unsupported_type si no es una imagen permitida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(Buffer.from('%PDF'), 'application/pdf')),
    );

    await expect(downloadImage('https://cdn.example.com/doc.pdf')).rejects.toMatchObject({
      reason: 'unsupported_type',
    });
  });

  it('falla con too_large cuando content-length supera 5 MB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(PNG_BYTES, 'image/png', {
          'content-length': String(MAX_PRODUCT_IMAGE_BYTES + 1),
        }),
      ),
    );

    await expect(downloadImage('https://cdn.example.com/gigante.png')).rejects.toMatchObject({
      reason: 'too_large',
    });
  });

  it('falla con timeout cuando fetch aborta por tiempo', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    const error = await downloadImage('https://cdn.example.com/lenta.png').catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ImageDownloadError);
    expect(error).toMatchObject({ reason: 'timeout' });
  });

  it('falla con network si fetch no conecta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(downloadImage('https://cdn.example.com/caida.png')).rejects.toMatchObject({
      reason: 'network',
    });
  });
});
