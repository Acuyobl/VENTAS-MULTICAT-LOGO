import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
  AiStreamChunk,
} from '@ventascatalogo/ai';
import { stableVariant } from './image/image-data-uri';

interface MockProduct {
  name?: string;
  price?: string;
  currency?: string;
}

type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP' | 'LINKEDIN';
type Tone = 'CERCANO' | 'PROFESIONAL' | 'DIVERTIDO' | 'PREMIUM';
type Goal = 'VENTAS' | 'LANZAMIENTO' | 'RECORDATORIO' | 'EDUCATIVO';

const PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'WHATSAPP', 'LINKEDIN'];
const TONES: Tone[] = ['CERCANO', 'PROFESIONAL', 'DIVERTIDO', 'PREMIUM'];
const GOALS: Goal[] = ['VENTAS', 'LANZAMIENTO', 'RECORDATORIO', 'EDUCATIVO'];

const HASHTAGS: Record<Platform, string[]> = {
  INSTAGRAM: ['#VentasCatalogo', '#CostaRica', '#HechoACR', '#ComprasLocales'],
  FACEBOOK: ['#Comunidad', '#VentasCatalogo', '#CostaRica', '#EmprendedoresCR'],
  TIKTOK: ['#TikTokMadeMeBuyIt', '#VentasCatalogo', '#CostaRicaFYP', '#FYP'],
  WHATSAPP: [],
  LINKEDIN: ['#VentasCatalogo', '#PymesCR', '#ComercioLocal', '#CostaRica'],
};

const CTA: Record<Goal, string> = {
  VENTAS: 'Escribinos por WhatsApp y coordinamos tu pedido.',
  LANZAMIENTO: 'Conocé lo nuevo del catálogo y reservá el tuyo.',
  RECORDATORIO: 'Últimos días con stock disponible: no te quedés sin el tuyo.',
  EDUCATIVO: 'Aprendé a elegir el mejor producto y prepará tu próxima compra.',
};

const TONE_STYLE: Record<Tone, string> = {
  CERCANO: 'luz natural cálida, fondo de madera clara y tonos arena',
  PROFESIONAL: 'fondo azul petróleo limpio, luz suave y composición minimalista',
  DIVERTIDO: 'fondo coral y amarillo, luz brillante y props coloridos',
  PREMIUM: 'fondo negro mate, luz lateral dorada y sombras profundas',
};

const TITLES: Record<Tone, string[]> = {
  CERCANO: ['{p} te va a encantar', 'Un clásico para tu día a día: {p}'],
  PROFESIONAL: ['{p}: calidad que se nota', 'Conocé {p}, hecho para durar'],
  DIVERTIDO: ['{p} entró a la chat party', 'Modo {p}: activado'],
  PREMIUM: ['{p}, selección de autor', 'La elegancia de {p}'],
};

const HOOKS: Record<Tone, string[]> = {
  CERCANO: ['Se nota cuando algo está hecho con cariño.', 'Te compartimos algo rico y cercano.'],
  PROFESIONAL: [
    'Calidad verificada en cada lote.',
    'Una opción confiable para tu negocio o tu casa.',
  ],
  DIVERTIDO: ['¡Alerta de antojo!', 'Esto no es un simulacro de compra.'],
  PREMIUM: ['Pocas piezas, mucha intención.', 'Para quienes eligen con criterio.'],
};

function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length] as T;
}

function normalizePlatform(value: string): Platform {
  const upper = value.toUpperCase();
  return PLATFORMS.find((platform) => platform === upper) ?? 'INSTAGRAM';
}

function normalizeTone(value: string): Tone {
  const upper = value.toUpperCase();
  return TONES.find((tone) => tone === upper) ?? 'CERCANO';
}

function normalizeGoal(value: string): Goal {
  const upper = value.toUpperCase();
  return GOALS.find((goal) => goal === upper) ?? 'VENTAS';
}

/**
 * Proveedor de IA determinista para desarrollo/demo (`AI_PROVIDER=mock`).
 * Nunca llama a la red: devuelve un JSON válido con el mismo formato que el
 * prompt v3 y varía título/body/CTA/hashtags/visualSuggestion según
 * plataforma + tono + objetivo. `validateEnv` impide usarlo en producción.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-social-v2';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const userMessage =
      [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const products = this.extractProducts(userMessage);
    const names = products.map((product) => product.name).filter(Boolean) as string[];
    const featured = names[0] ?? 'nuestros productos';
    const featuredProduct = products[0];
    const { platform, tone, goal } = this.extractMeta(userMessage);

    const seed = stableVariant(
      [platform, tone, goal, featured, names.join(','), userMessage.slice(0, 200)].join('|'),
    );

    const title = pick(TITLES[tone], seed)
      .replaceAll('{p}', featured)
      .concat(goal === 'RECORDATORIO' ? ' · últimos días' : '');
    const hook = pick(HOOKS[tone], seed >> 3);
    const goalLine =
      goal === 'VENTAS'
        ? 'Pedilo hoy y coordinamos la entrega.'
        : goal === 'LANZAMIENTO'
          ? 'Recién llegado al catálogo, con stock limitado.'
          : goal === 'RECORDATORIO'
            ? 'Quedan pocas unidades disponibles.'
            : 'En esta entrega te contamos cómo elegirlo bien.';
    const productLine = featuredProduct
      ? `Producto destacado: ${featured}${featuredProduct.price ? ` (${featuredProduct.price})` : ''}.`
      : '';
    const others = names.length > 1 ? `También podés ver ${names.slice(1).join(', ')}.` : '';
    const body = [hook, goalLine, productLine, others].filter(Boolean).join(' ');

    const text = JSON.stringify({
      title,
      body,
      hashtags: HASHTAGS[platform],
      cta: CTA[goal],
      visualSuggestion: `${TONE_STYLE[tone]} Producto: ${featured}.`,
    });

    return {
      text,
      usage: { tokensIn: 320, tokensOut: 180 },
      model: this.model,
      provider: this.name,
    };
  }

  async *stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const result = await this.complete(request);
    yield { delta: result.text, usage: result.usage };
  }

  /** Parsea `Metadatos: plataforma=…; tono=…; objetivo=…` (tolerante). */
  private extractMeta(userMessage: string): { platform: Platform; tone: Tone; goal: Goal } {
    const meta = /Metadatos:\s*plataforma=([A-Z_]+);\s*tono=([A-Z_]+);\s*objetivo=([A-Z_]+)/i.exec(
      userMessage,
    );
    if (meta) {
      return {
        platform: normalizePlatform(meta[1] ?? ''),
        tone: normalizeTone(meta[2] ?? ''),
        goal: normalizeGoal(meta[3] ?? ''),
      };
    }
    // Fallback con el prompt v3 mapeado (sin metadata): tono/objetivo genéricos.
    const platform = /Plataforma:\s*(\w+)/i.exec(userMessage)?.[1] ?? '';
    const tone = /Tono:\s*(\w+)/i.exec(userMessage)?.[1] ?? '';
    const goal = /Objetivo:\s*(\w+)/i.exec(userMessage)?.[1] ?? '';
    return {
      platform: normalizePlatform(platform),
      tone: normalizeTone(tone),
      goal: normalizeGoal(goal),
    };
  }

  private extractProducts(userMessage: string): MockProduct[] {
    const match = /Productos:\s*(\[.*\])\s*$/m.exec(userMessage);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[1]) as MockProduct[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
