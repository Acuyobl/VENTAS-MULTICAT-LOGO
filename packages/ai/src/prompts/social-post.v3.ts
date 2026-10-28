export interface SocialPromptInput {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'linkedin' | 'x';
  tone: 'profesional' | 'humoristico' | 'urgente' | 'inspirador';
  goal: 'venta' | 'engagement' | 'educativo';
  brandVoice: string;
  products: Array<{
    sku: string;
    name: string;
    description: string;
    price: string;
    currency: string;
    category: string;
  }>;
}

export const socialPostPrompt = {
  key: 'social.post',
  version: 3,
  locale: 'es-CR',
  system:
    'Eres copywriter de una PYME costarricense. Escribís español de Costa Rica, claro y directo. ' +
    'Usás únicamente los precios y características del JSON de productos; si falta un dato no lo inventás. ' +
    'Devolvés JSON válido con las claves title, body, hashtags (array), cta y visualSuggestion.',
  user: (input: SocialPromptInput): string =>
    [
      `Plataforma: ${input.platform}`,
      `Tono: ${input.tone}`,
      `Objetivo: ${input.goal}`,
      `Voz de marca: ${input.brandVoice}`,
      `Productos: ${JSON.stringify(input.products)}`,
      'Máximo 8 hashtags relevantes para Costa Rica. CTA en segunda persona.',
    ].join('\n'),
} as const;
