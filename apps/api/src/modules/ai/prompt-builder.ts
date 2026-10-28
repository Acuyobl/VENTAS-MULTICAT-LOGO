import { socialPostPrompt } from '@ventascatalogo/ai';

export interface SocialPromptProduct {
  sku: string;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  category: string | null;
  stock: number;
}

export interface SocialPromptContext {
  brandVoice: string;
  platform: 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP' | 'LINKEDIN';
  tone: 'CERCANO' | 'PROFESIONAL' | 'DIVERTIDO' | 'PREMIUM';
  goal: 'VENTAS' | 'LANZAMIENTO' | 'RECORDATORIO' | 'EDUCATIVO';
  products: SocialPromptProduct[];
  extraInstructions?: string;
}

const PLATFORM_MAP = {
  INSTAGRAM: 'instagram',
  FACEBOOK: 'facebook',
  TIKTOK: 'tiktok',
  LINKEDIN: 'linkedin',
  WHATSAPP: 'instagram',
} as const;

const TONE_MAP = {
  CERCANO: 'profesional',
  PROFESIONAL: 'profesional',
  DIVERTIDO: 'humoristico',
  PREMIUM: 'inspirador',
} as const;

const GOAL_MAP = {
  VENTAS: 'venta',
  LANZAMIENTO: 'venta',
  RECORDATORIO: 'engagement',
  EDUCATIVO: 'educativo',
} as const;

export interface BuiltSocialPrompt {
  system: string;
  user: string;
  templateKey: 'social-post';
  version: 3;
}

/**
 * Prompt para el post social: usa el prompt v3 de `packages/ai`, agrega stock y
 * las instrucciones extra del usuario. Puro para poder testearlo.
 */
export function buildSocialPrompt(context: SocialPromptContext): BuiltSocialPrompt {
  const base = socialPostPrompt.user({
    platform: PLATFORM_MAP[context.platform],
    tone: TONE_MAP[context.tone],
    goal: GOAL_MAP[context.goal],
    brandVoice: context.brandVoice,
    products: context.products.map((product) => ({
      sku: product.sku,
      name: product.name,
      description: product.description ?? '',
      price: product.price,
      currency: product.currency,
      category: product.category ?? '',
    })),
  });

  const stockLines = context.products.map(
    (product) => `${product.sku}: ${product.stock} unidades disponibles`,
  );
  const extra = context.extraInstructions
    ? `Instrucciones extra del negocio: ${context.extraInstructions}`
    : '';

  return {
    system: `${socialPostPrompt.system} Respondé solo con el objeto JSON, sin markdown ni explicaciones.`,
    user: [base, `Disponibilidad: ${stockLines.join(' · ')}`, extra].filter(Boolean).join('\n'),
    templateKey: 'social-post',
    version: 3,
  };
}
