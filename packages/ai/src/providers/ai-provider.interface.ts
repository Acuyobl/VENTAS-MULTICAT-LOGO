export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiCompletionRequest {
  model: string;
  messages: AiMessage[];
  maxOutputTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface AiUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface AiCompletionResult {
  text: string;
  usage: AiUsage;
  model: string;
  provider: string;
}

export interface AiStreamChunk {
  delta?: string;
  usage?: Partial<AiUsage>;
}

export interface AiProvider {
  readonly name: string;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
  stream(request: AiCompletionRequest): AsyncIterable<AiStreamChunk>;
}

export type AiErrorCode = 'AI_PROVIDER_ERROR' | 'AI_TIMEOUT' | 'AI_CONTENT_BLOCKED';

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
