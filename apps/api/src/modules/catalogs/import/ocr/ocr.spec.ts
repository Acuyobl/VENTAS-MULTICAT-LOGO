import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_OCR_MOCK_TEXT,
  MAX_OCR_IMAGE_BYTES,
  imageContentType,
  parseOcrText,
} from './ocr-provider';
import { MockOcrProvider } from './mock-ocr.provider';
import { TesseractOcrProvider } from './tesseract-ocr.provider';
import { extractPdfJpegImages, parseScannedPdfWithOcr } from './pdf-ocr';
import { sniffFileFormat } from '../parse-import-file';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0xff, 0xd9]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP'),
  Buffer.from([0x56, 0x50, 0x38, 0x20]),
]);

describe('MockOcrProvider', () => {
  it('devuelve el texto por defecto o el configurado', async () => {
    const defaultProvider = new MockOcrProvider();
    await expect(defaultProvider.recognizeImage(PNG)).resolves.toEqual({
      text: DEFAULT_OCR_MOCK_TEXT,
      provider: 'mock',
    });

    const custom = new MockOcrProvider('Tornillo 1200\nClavo 300');
    const result = await custom.recognizeImage(JPG);
    expect(result?.text).toContain('Tornillo 1200');
  });

  it('ignora buffers vacíos o de más de 10 MB', async () => {
    const provider = new MockOcrProvider('x');
    await expect(provider.recognizeImage(Buffer.alloc(0))).resolves.toBeNull();
    await expect(
      provider.recognizeImage(Buffer.alloc(MAX_OCR_IMAGE_BYTES + 1)),
    ).resolves.toBeNull();
  });
});

describe('sniffFileFormat · imágenes por magic bytes', () => {
  it('detecta PNG, JPG y WebP aunque la extensión sea otra', () => {
    expect(sniffFileFormat(PNG, 'archivo.dat')).toBe('image');
    expect(sniffFileFormat(JPG, 'archivo.jpg')).toBe('image');
    expect(sniffFileFormat(WEBP, 'foto')).toBe('image');
  });

  it('una extensión de imagen con bytes desconocidos se trata como imagen', () => {
    expect(sniffFileFormat(Buffer.from('no soy imagen'), 'png')).toBe('image');
  });

  it('imageContentType detecta jpeg/webp/png', () => {
    expect(imageContentType(JPG)).toBe('image/jpeg');
    expect(imageContentType(WEBP)).toBe('image/webp');
    expect(imageContentType(PNG)).toBe('image/png');
  });
});

describe('parseOcrText', () => {
  it('convierte texto OCR en filas nombre/precio', () => {
    const parsed = parseOcrText('Camisa demo 5000\nPantalón demo 7000');
    expect(parsed?.headers).toEqual(['SKU', 'Nombre', 'Precio']);
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.rows[0]).toMatchObject({ Nombre: 'Camisa demo', Precio: '5000' });
  });

  it('texto vacío → null', () => {
    expect(parseOcrText('')).toBeNull();
    expect(parseOcrText(null)).toBeNull();
  });
});

/** PDF mínimo con un stream JPEG `/DCTDecode`. */
function scannedPdf(images: Buffer[]): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  images.forEach((image, index) => {
    parts.push(
      Buffer.from(
        `1 0 obj << /Type /XObject /Subtype /Image /Filter /DCTDecode >>\nstream\n`,
        'latin1',
      ),
      image,
      Buffer.from(`\nendstream\nendobj\n% pagina ${index + 1}\n`, 'latin1'),
    );
  });
  parts.push(Buffer.from('%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}

describe('PDF escaneado', () => {
  it('extrae solo imágenes JPEG con /DCTDecode', () => {
    const images = extractPdfJpegImages(scannedPdf([JPG, PNG]));
    expect(images).toHaveLength(1);
    expect(images[0]?.equals(JPG)).toBe(true);
  });

  it('OCR de las imágenes y parseo del texto', async () => {
    const ocr = {
      recognizeImage: vi
        .fn()
        .mockResolvedValue({ text: 'Camisa 5000\nPantalón 7000', provider: 'mock' }),
    };
    const parsed = await parseScannedPdfWithOcr(scannedPdf([JPG]), ocr);
    expect(parsed?.rows).toHaveLength(2);
    expect(parsed?.sheetSelection).toContain('PDF escaneado');
  });

  it('sin imágenes o sin texto devuelve null', async () => {
    await expect(
      parseScannedPdfWithOcr(Buffer.from('%PDF-1.4\n%%EOF'), {
        recognizeImage: vi.fn(),
      }),
    ).resolves.toBeNull();

    const noText = { recognizeImage: vi.fn().mockResolvedValue(null) };
    await expect(parseScannedPdfWithOcr(scannedPdf([JPG]), noText)).resolves.toBeNull();
  });
});

describe('TesseractOcrProvider (módulo mockeado, sin descargar)', () => {
  function fakeModule(recognize = vi.fn().mockResolvedValue({ data: { text: 'Camisa 5000' } })) {
    const terminate = vi.fn().mockResolvedValue(undefined);
    const createWorker = vi.fn().mockResolvedValue({ recognize, terminate });
    return { createWorker, terminate, recognize };
  }

  it('crea el worker con spa+eng y logger silencioso', async () => {
    const fake = fakeModule();
    const provider = new TesseractOcrProvider({
      loadModule: async () => ({ createWorker: fake.createWorker }),
    });

    const result = await provider.recognizeImage(PNG);

    expect(result).toEqual({ text: 'Camisa 5000', provider: 'tesseract' });
    expect(fake.createWorker).toHaveBeenCalledWith(
      'spa+eng',
      1,
      expect.objectContaining({ logger: expect.any(Function) }),
    );
    const options = fake.createWorker.mock.calls[0]?.[2] as { logger: (m: unknown) => void };
    expect(options.logger({ status: 'recognizing text' })).toBeUndefined();
  });

  it('cachea el worker entre imágenes', async () => {
    const fake = fakeModule();
    const provider = new TesseractOcrProvider({
      loadModule: async () => ({ createWorker: fake.createWorker }),
    });
    await provider.recognizeImage(PNG);
    await provider.recognizeImage(JPG);
    expect(fake.createWorker).toHaveBeenCalledTimes(1);
  });

  it('si el motor falla devuelve null y descarta el worker', async () => {
    const fake = fakeModule(vi.fn().mockRejectedValue(new Error('tesseract failed')));
    const provider = new TesseractOcrProvider({
      loadModule: async () => ({ createWorker: fake.createWorker }),
    });
    await expect(provider.recognizeImage(PNG)).resolves.toBeNull();
    expect(fake.terminate).toHaveBeenCalled();
  });

  it('respeta el timeout de 60 s (inyectado) y devuelve null', async () => {
    const never = vi.fn().mockReturnValue(new Promise(() => undefined));
    const fake = fakeModule(never);
    const provider = new TesseractOcrProvider({
      loadModule: async () => ({ createWorker: fake.createWorker }),
      timeoutMs: 10,
    });
    await expect(provider.recognizeImage(PNG)).resolves.toBeNull();
    expect(fake.terminate).toHaveBeenCalled();
  });

  it('si el módulo no se puede cargar devuelve null', async () => {
    const provider = new TesseractOcrProvider({
      loadModule: async () => {
        throw new Error('no module');
      },
    });
    await expect(provider.recognizeImage(PNG)).resolves.toBeNull();
  });
});
