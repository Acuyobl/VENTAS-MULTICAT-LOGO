import { cookies } from 'next/headers';

const API_INTERNAL_URL = (process.env.API_INTERNAL_URL ?? 'http://localhost:3001/api/v1').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiFetchOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
  authenticated?: boolean;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const cookieStore = options.authenticated === false ? null : await cookies();
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  };
  if (options.body) headers['content-type'] = 'application/json';
  if (cookieStore?.size) headers.cookie = cookieStore.toString();

  let response: Response;
  try {
    response = await fetch(`${API_INTERNAL_URL}${path}`, {
      ...options,
      headers,
      cache: 'no-store',
    });
  } catch (error) {
    throw new ApiError(503, 'API_UNAVAILABLE', 'La API no está disponible.', error);
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const body = (payload ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      response.status,
      body.code ?? 'HTTP_ERROR',
      body.message ?? `Error HTTP ${response.status}`,
      body.details,
    );
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function tryApiFetch<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}
