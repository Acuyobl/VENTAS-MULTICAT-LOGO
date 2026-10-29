import {
  DEFAULT_OCR_MOCK_TEXT,
  MAX_OCR_IMAGE_BYTES,
  type OcrProvider,
  type OcrResult,
} from './ocr-provider';

/** OCR determinista para tests/dev: no descarga nada ni inspecciona la imagen. */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';
  private readonly text: string;

  constructor(text?: string | null) {
    this.text = (text ?? '').trim() || DEFAULT_OCR_MOCK_TEXT;
  }

  async recognizeImage(buffer: Buffer): Promise<OcrResult | null> {
    if (buffer.length === 0 || buffer.length > MAX_OCR_IMAGE_BYTES) return null;
    const text = this.text.trim();
    return text ? { text, provider: this.name } : null;
  }
}
