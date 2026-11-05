import {
  MAX_OCR_IMAGE_BYTES,
  OCR_TIMEOUT_MS,
  type OcrProvider,
  type OcrResult,
} from './ocr-provider';

interface TesseractWorker {
  recognize(image: Buffer): Promise<{ data: { text?: string } }>;
  terminate(): Promise<unknown>;
}

interface TesseractModule {
  createWorker(
    languages: string,
    oem?: number,
    options?: { logger?: (message: unknown) => void },
  ): Promise<TesseractWorker>;
}

export interface TesseractOcrOptions {
  /** Inyectable en tests para no descargar el modelo real. */
  loadModule?: () => Promise<TesseractModule>;
  timeoutMs?: number;
  languages?: string;
}

/**
 * OCR real con tesseract.js (`spa+eng`), worker lazy/cacheado, logger silencioso,
 * timeout por imagen y límite de 10 MB. Si falla devuelve `null`: el llamador
 * decide el warning sin romper la importación.
 */
export class TesseractOcrProvider implements OcrProvider {
  readonly name = 'tesseract';
  private readonly timeoutMs: number;
  private readonly languages: string;
  private readonly loadModule: () => Promise<TesseractModule>;
  private workerPromise: Promise<TesseractWorker> | null = null;

  constructor(options: TesseractOcrOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? OCR_TIMEOUT_MS;
    this.languages = options.languages ?? 'spa+eng';
    this.loadModule =
      options.loadModule ??
      (async () => (await import('tesseract.js')) as unknown as TesseractModule);
  }

  async recognizeImage(buffer: Buffer): Promise<OcrResult | null> {
    if (buffer.length === 0 || buffer.length > MAX_OCR_IMAGE_BYTES) return null;
    let worker: TesseractWorker;
    try {
      worker = await this.getWorker();
    } catch {
      return null;
    }

    try {
      const result = await withTimeout(worker.recognize(buffer), this.timeoutMs);
      const text = (result.data.text ?? '').trim();
      return text ? { text, provider: this.name } : null;
    } catch {
      // Timeout o error del motor: se descarta el worker para recrearlo luego.
      await this.disposeWorker(worker);
      return null;
    }
  }

  /** Libera el worker (tests/shutdown). */
  async terminate(): Promise<void> {
    if (!this.workerPromise) return;
    const worker = await this.workerPromise.catch(() => null);
    await this.disposeWorker(worker);
  }

  private getWorker(): Promise<TesseractWorker> {
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const module = await this.loadModule();
        return module.createWorker(this.languages, 1, {
          // Nunca loguear el contenido OCR (PII); tesseract usa este logger.
          logger: () => undefined,
        });
      })();
      this.workerPromise.catch(() => {
        this.workerPromise = null;
      });
    }
    return this.workerPromise;
  }

  private async disposeWorker(worker: TesseractWorker | null): Promise<void> {
    this.workerPromise = null;
    if (!worker) return;
    await worker.terminate().catch(() => undefined);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ocr_timeout')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('ocr_error'));
      },
    );
  });
}
