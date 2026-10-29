import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockOcrProvider } from './mock-ocr.provider';
import { TesseractOcrProvider } from './tesseract-ocr.provider';
import type { OcrProvider, OcrResult } from './ocr-provider';

/**
 * Selecciona el proveedor OCR con `OCR_PROVIDER=mock|tesseract` (default mock
 * para no descargar modelos en CI). `OCR_MOCK_TEXT` permite fijar el texto que
 * devuelve el mock en tests/demos.
 */
@Injectable()
export class OcrService {
  private readonly provider: OcrProvider;

  constructor(config: ConfigService) {
    const provider = config.get<string>('OCR_PROVIDER', 'mock');
    this.provider =
      provider === 'tesseract'
        ? new TesseractOcrProvider()
        : new MockOcrProvider(config.get<string>('OCR_MOCK_TEXT'));
  }

  get name(): string {
    return this.provider.name;
  }

  recognizeImage(buffer: Buffer): Promise<OcrResult | null> {
    return this.provider.recognizeImage(buffer);
  }
}
