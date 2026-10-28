import type {
  AiCompletionRequest,
  AiCompletionResult,
  AiProvider,
  AiStreamChunk,
} from '@ventascatalogo/ai';

interface MockProduct {
  name?: string;
  price?: string;
  currency?: string;
}

/**
 * Proveedor de IA determinista para desarrollo/demo (`AI_PROVIDER=mock`).
 * Nunca llama a la red: devuelve un JSON válido con el mismo formato que el
 * prompt v3. `validateEnv` impide usarlo con `NODE_ENV=production`.
 */
export class MockAiProvider implements AiProvider {
  readonly name = 'mock';
  readonly model = 'mock-social-v1';

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const userMessage =
      [...request.messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const products = this.extractProducts(userMessage);
    const names = products.map((product) => product.name).filter(Boolean) as string[];
    const featured = names[0] ?? 'nuestros productos';

    const title = `${featured} directo desde Costa Rica`;
    const body = [
      `Te contamos de ${featured !== 'nuestros productos' ? featured : 'nuestros productos'}:`,
      names.length > 1 ? `también tenemos ${names.slice(1).join(', ')}.` : '',
      'Hecho a mano en lotes pequeños, con precios claros y entrega coordinada.',
    ]
      .filter(Boolean)
      .join(' ');
    const text = JSON.stringify({
      title,
      body,
      hashtags: ['#VentasCatalogo', '#CostaRica', '#HechoACR', '#Emprendedores', '#ComprasLocales'],
      cta: 'Escribinos por WhatsApp y coordinamos tu pedido.',
      visualSuggestion: `Foto de ${featured} sobre fondo claro con luz natural.`,
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
