import { formatMoney } from '@ventascatalogo/contracts';
import { buildMockSocialSvg } from './svg-image';
import { detectImageContentType, stableVariant, toDataUri } from './image-data-uri';
import type { GeneratedImage, ImageGenerationInput, ImageProvider } from './image-provider';

/**
 * Proveedor de imagen determinista: compone un SVG 1080×1080 con la foto del
 * primer producto (si existe) como fondo a sangre y los datos del post encima.
 * Solo para desarrollo/demo (`IMAGE_PROVIDER=mock`).
 */
export class MockImageProvider implements ImageProvider {
  readonly name = 'mock';
  readonly model = 'mock-social-1080';

  async generate(input: ImageGenerationInput): Promise<GeneratedImage> {
    const featured = input.products[0];
    const photo = input.productImage;
    const photoDataUri = photo
      ? toDataUri(photo.buffer, photo.contentType || detectImageContentType(photo.buffer))
      : null;
    const design = input.design ?? 'CLASICA';
    const variant = stableVariant(
      [
        input.prompt,
        input.post.id,
        input.post.title,
        featured?.id ?? 'sin-producto',
        featured?.imageKey ?? 'sin-foto',
        design,
        input.post.platform,
        input.post.tone,
        input.post.goal,
      ].join('|'),
    );

    const svg = buildMockSocialSvg({
      title: input.post.title,
      cta: input.post.cta,
      productName: featured?.name ?? null,
      productPrice: featured ? formatMoney(featured.priceMinor, featured.currency) : null,
      visualSuggestion: input.post.visualSuggestion,
      photoDataUri,
      variant,
      design,
      platform: input.post.platform as
        'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP' | 'LINKEDIN',
      tone: input.post.tone as 'CERCANO' | 'PROFESIONAL' | 'DIVERTIDO' | 'PREMIUM',
      goal: input.post.goal as 'VENTAS' | 'LANZAMIENTO' | 'RECORDATORIO' | 'EDUCATIVO',
    });
    return {
      buffer: Buffer.from(svg, 'utf8'),
      contentType: 'image/svg+xml',
      ext: 'svg',
    };
  }
}
