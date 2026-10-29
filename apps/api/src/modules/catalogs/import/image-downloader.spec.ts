import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadImage,
  ImageDownloadError,
  IMAGE_DOWNLOAD_BACKOFF_MS,
  IMAGE_DOWNLOAD_TIMEOUT_MS,
  IMAGE_DOWNLOAD_USER_AGENT,
  sanitizeImageUrl,
} from './image-downloader';
import { MAX_PRODUCT_IMAGE_BYTES } from '../../storage/image-utils';

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

function okResponse(body: Buffer = PNG_BYTES, extraHeaders: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'image/png; charset=binary', ...extraHeaders },
  });
}

function statusResponse(status: number, headers: Record<string, string> = {}) {
  return new Response('nope', { status, headers });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadImage', () => {
  it('descarga con User-Agent descriptivo y timeout total de 20 s', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadImage('https://cdn.example.com/foto.png');

    expect(result.contentType).toBe('image/png');
    expect(result.buffer.equals(PNG_BYTES)).toBe(true);
    expect(IMAGE_DOWNLOAD_TIMEOUT_MS).toBe(20_000);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
    expect((options.headers as Record<string, string>)['User-Agent']).toBe(
      IMAGE_DOWNLOAD_USER_AGENT,
    );
  });

  it('reintenta 429 y termina bien; respeta Retry-After', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(429, { 'retry-after': '2' }))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await downloadImage('https://upload.wikimedia.org/foto.jpg', { sleep });

    expect(result.buffer.equals(PNG_BYTES)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('usa backoff 1 s y 3 s para 5xx/red sin Retry-After', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(503))
      .mockResolvedValueOnce(statusResponse(500))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await downloadImage('https://cdn.example.com/foto.png', { sleep });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([
      IMAGE_DOWNLOAD_BACKOFF_MS[0],
      IMAGE_DOWNLOAD_BACKOFF_MS[1],
    ]);
  });

  it('un 403 persistente no se reintenta y falla con http_error', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(statusResponse(403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadImage('https://cdn.example.com/foto.png', { sleep }),
    ).rejects.toMatchObject({ reason: 'http_error' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('reintenta errores de red y agota en 3 intentos', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      downloadImage('https://cdn.example.com/foto.png', { sleep }),
    ).rejects.toMatchObject({ reason: 'network' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('el Retry-After se limita a 10 s', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(statusResponse(429, { 'retry-after': '120' }))
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal('fetch', fetchMock);

    await downloadImage('https://cdn.example.com/foto.png', { sleep });
    expect(sleep).toHaveBeenCalledWith(10_000);
  });

  it('falla con unsupported_type si no es una imagen permitida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(Buffer.from('%PDF'), {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
      ),
    );

    await expect(downloadImage('https://cdn.example.com/doc.pdf')).rejects.toMatchObject({
      reason: 'unsupported_type',
    });
  });

  it('falla con too_large si content-length supera 5 MB', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          okResponse(PNG_BYTES, { 'content-length': String(MAX_PRODUCT_IMAGE_BYTES + 1) }),
        ),
    );

    await expect(downloadImage('https://cdn.example.com/gigante.png')).rejects.toMatchObject({
      reason: 'too_large',
    });
  });

  it('falla con too_large si el body supera 5 MB sin content-length', async () => {
    const big = Buffer.alloc(MAX_PRODUCT_IMAGE_BYTES + 10, 0x89);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(big)));

    await expect(downloadImage('https://cdn.example.com/gigante.png')).rejects.toMatchObject({
      reason: 'too_large',
    });
  });

  it('reintenta timeout y luego falla con timeout', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout));

    const error = await downloadImage('https://cdn.example.com/lenta.png', { sleep }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ImageDownloadError);
    expect(error).toMatchObject({ reason: 'timeout' });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('limpia query params utm_* antes de descargar', async () => {
    expect(
      sanitizeImageUrl(
        'https://upload.wikimedia.org/a/foto.jpg?utm_source=wiki&utm_medium=email&width=800',
      ),
    ).toBe('https://upload.wikimedia.org/a/foto.jpg?width=800');

    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', fetchMock);
    await downloadImage('https://upload.wikimedia.org/a/foto.jpg?utm_source=x&v=2');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://upload.wikimedia.org/a/foto.jpg?v=2');
  });
});
