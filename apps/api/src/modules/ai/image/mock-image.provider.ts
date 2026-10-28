import { formatMoney } from '@ventascatalogo/contracts';
import { buildMockSocialSvg } from './svg-image';
import type { GeneratedImage, ImageGenerationInput, ImageProvider } from './image-provider';

/**
 * Proveedor de imagen determinista: dibuja el post como SVG 1080×1080 sin red.
 * Solo para desarrollo/demo (`IMAGE_PROVIDER=mock`).
 */
export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';
  readonly model = 'mock-social-1080';

  async generate(input: ImageGenerationInput): Promise<GeneratedImage> {
    const featured = input.products[0];
    const svg = buildMockSocialSvg({
      title: input.post.title,
      cta: input.post.cta,
      productName: featured?.name ?? null,
      productPrice: featured ? formatMoney(featured.priceMinor, featured.currency) : null,
      visualSuggestion: input.post.visualSuggestion,
    });
    return {
      buffer: Buffer.from(svg, 'utf8'),
      contentType: 'image/svg+xml',
      ext: 'svg',
    };
  }
}
