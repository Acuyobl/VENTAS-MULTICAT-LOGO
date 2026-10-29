import type { Product, SocialPost } from '@prisma/client';
import { formatMoney, type ImageDesignKey } from '@ventascatalogo/contracts';

/** Paleta/estilo visual por tono (se usa también en el SVG del mock). */
export const TONE_IMAGE_STYLE = {
  CERCANO: 'tonos cálidos, luz natural y ambiente hogareño',
  PROFESIONAL: 'paleta azul/verde, luz suave y composición limpia y sobria',
  DIVERTIDO: 'colores coral/amarillo, luz brillante y energía festiva',
  PREMIUM: 'negro mate con detalles dorados, luz lateral y sombras profundas',
} as const;

export type ImageTone = keyof typeof TONE_IMAGE_STYLE;

/** Prompt de imagen determinista a partir del post + productos + instrucciones. */
export function buildImagePrompt(input: {
  post: Pick<SocialPost, 'title' | 'cta' | 'visualSuggestion' | 'platform' | 'tone' | 'goal'>;
  products: Product[];
  customPrompt?: string;
  design?: ImageDesignKey;
}): string {
  const featured = input.products[0];
  const price = featured ? formatMoney(featured.priceMinor, featured.currency) : null;
  const tone = (input.post.tone as ImageTone | null) ?? 'CERCANO';
  const base = [
    `Imagen cuadrada 1080x1080 para una publicación de ${input.post.platform.toLowerCase()}.`,
    `Plataforma: ${input.post.platform}.`,
    `Tono: ${input.post.tone}.`,
    `Objetivo: ${input.post.goal}.`,
    `Título: "${input.post.title}".`,
    featured ? `Producto destacado: ${featured.name} (${price}).` : null,
    `CTA: "${input.post.cta}".`,
    `Estilo: ${input.post.visualSuggestion ?? 'fotografía de producto limpia, luz natural, fondo claro'}.`,
    `Estilo visual del tono: ${TONE_IMAGE_STYLE[tone] ?? TONE_IMAGE_STYLE.CERCANO}.`,
    featured
      ? 'Usá la foto del producto como base y mantené el producto reconocible (misma forma, color y empaque).'
      : 'Sin foto de producto: generá una escena de producto coherente con la descripción.',
    'Marca: VentasCatálogo, Costa Rica. Sin texto ilegible ni marcas de agua.',
    input.customPrompt ? `Instrucciones adicionales: ${input.customPrompt}.` : null,
  ].filter((line): line is string => Boolean(line));
  return base.join(' ');
}
