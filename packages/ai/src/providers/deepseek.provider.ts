import {
  AiError,
  type AiCompletionRequest,
  type AiCompletionResult,
  type AiProvider,
  type AiStreamChunk,
} from './ai-provider.interface';

export interface DeepSeekConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DeepSeekProvider implements AiProvider {
  readonly name = 'deepseek';

  constructor(private readonly cfg: DeepSeekConfig) {}

  async complete(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const response = await this.fetchWithRetry(request, false);
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      usage: {
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
      },
      model: json.model ?? request.model,
      provider: this.name,
    };
  }

  async *stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk> {
    const response = await this.fetchWithRetry(request, true);
    if (!response.body) throw new AiError('AI_PROVIDER_ERROR', 'upstream_sin_body');

    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (parsed.usage) {
          yield {
            usage: {
              tokensIn: parsed.usage.prompt_tokens,
              tokensOut: parsed.usage.completion_tokens,
            },
          };
        }
      }
    }
  }

  private async fetchWithRetry(
    request: AiCompletionRequest,
    stream: boolean,
  ): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.cfg.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      try {
        const response = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.cfg.apiKey}`,
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            stream,
            stream_options: stream ? { include_usage: true } : undefined,
          }),
          signal: request.signal ?? controller.signal,
        });
        if (response.status === 429 || response.status >= 500) {
          throw new Error(`upstream_${response.status}`);
        }
        if (!response.ok) {
          throw new AiError('AI_PROVIDER_ERROR', 'upstream_error', { status: response.status });
        }
        return response;
      } catch (error) {
        lastError = error;
        if (attempt === this.cfg.maxRetries) break;
        await sleep(2 ** attempt * 500 + Math.floor(Math.random() * 250));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof AiError
      ? lastError
      : new AiError('AI_TIMEOUT', 'ai_timeout', { cause: String(lastError) });
  }
}
