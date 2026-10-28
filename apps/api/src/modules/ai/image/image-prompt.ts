import type { Product, SocialPost } from '@prisma/client';
import { formatMoney, type ImageDesignKey } from '@ventascatalogo/contracts';

/** Prompt de imagen determinista a partir del post + productos + instrucciones. */
export function buildImagePrompt(input: {
  post: Pick<SocialPost, 'title' | 'cta' | 'visualSuggestion' | 'platform'>;
  products: Product[];
  customPrompt?: string;
  design?: ImageDesignKey;
}): string {
  const featured = input.products[0];
  const price = featured ? formatMoney(featured.priceMinor, featured.currency) : null;
  const base = [
    `Imagen cuadrada 1080x1080 para una publicación de ${input.post.platform.toLowerCase()}.`,
    `Título: "${input.post.title}".`,
    featured ? `Producto destacado: ${featured.name} (${price}).` : null,
    `CTA: "${input.post.cta}".`,
    `Estilo: ${input.post.visualSuggestion ?? 'fotografía de producto limpia, luz natural, fondo claro'}.`,
    featured
      ? 'Usá la foto del producto como base y mantené el producto reconocible (misma forma, color y empaque).'
      : 'Sin foto de producto: generá una escena de producto coherente con la descripción.',
    'Marca: VentasCatálogo, Costa Rica. Sin texto ilegible ni marcas de agua.',
    input.customPrompt ? `Instrucciones adicionales: ${input.customPrompt}.` : null,
  ].filter((line): line is string => Boolean(line));
  return base.join(' ');
}
