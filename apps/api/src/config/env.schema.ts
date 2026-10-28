import { z } from 'zod';

const boolFromString = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

const portFromString = z.coerce.number().int().positive();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: portFromString.default(3001),
    API_PREFIX: z.string().default('api/v1'),
    API_PUBLIC_URL: z.string().url(),
    WEB_PUBLIC_URL: z.string().url(),
    STAFF_PUBLIC_URL: z.string().url().default('http://app.localhost:3000'),
    TIENDA_PUBLIC_URL: z.string().url().default('http://tienda.localhost:3000'),
    CORS_ORIGINS: z.string(),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    AUTH_STAFF_AUDIENCE: z.string().default('staff'),
    AUTH_CUSTOMER_AUDIENCE: z.string().default('customer'),
    STAFF_REFRESH_TTL: z.string().default('7d'),
    CUSTOMER_REFRESH_TTL: z.string().default('30d'),
    MAGIC_LINK_TTL: z.string().default('20m'),
    MFA_ISSUER: z.string().default('VentasCatálogo'),
    AUTH_COOKIE_DOMAIN: z.string().optional().default(''),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    AUTH_LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
    MFA_ENFORCE_ADMINS: boolFromString.default(true),
    /**
     * Helpers de autenticación SOLO para desarrollo (p. ej. `POST /auth/dev/totp`).
     * Nunca debe activarse en producción: `validateEnv` aborta el arranque si
     * `NODE_ENV=production` y el flag está encendido.
     */
    DEV_AUTH_HELPERS: boolFromString.default(false),
    ENCRYPTION_KEY: z.string().min(1),
    LOG_LEVEL: z.string().default('info'),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    MINIO_ENDPOINT: z.string().default('localhost'),
    MINIO_PORT: portFromString.default(9000),
    MINIO_USE_SSL: boolFromString.default(false),
    MINIO_ACCESS_KEY: z.string().default('minioadmin'),
    MINIO_SECRET_KEY: z.string().default('minioadmin'),
    MINIO_BUCKET_PRODUCTS: z.string().default('vc-products'),
    MINIO_BUCKET_DOCS: z.string().default('vc-docs'),
    MINIO_BUCKET_PUBLIC: z.string().default('vc-public'),
    MINIO_PRESIGN_TTL: z.coerce.number().int().positive().default(900),
    EMAIL_PROVIDER: z.enum(['smtp', 'resend']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: portFromString.default(1025),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    EMAIL_FROM: z.string().default('VentasCatálogo <no-reply@ventascatalogo.local>'),
    RESEND_API_KEY: z.string().optional().default(''),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    GOOGLE_REDIRECT_URI: z.string().optional().default(''),
    GOOGLE_SCOPES: z.string().optional().default(''),
    /**
     * Proveedor de IA. `mock` es determinista y SOLO para desarrollo/demo:
     * `validateEnv` aborta el arranque si se combina con `NODE_ENV=production`.
     */
    AI_PROVIDER: z.enum(['deepseek', 'mock']).default('deepseek'),
    DEEPSEEK_API_KEY: z.string().optional().default(''),
    DEEPSEEK_BASE_URL: z.string().default('https://api.deepseek.com/v1'),
    AI_MODEL_DEFAULT: z.string().default('deepseek-chat'),
    AI_MODEL_REASONER: z.string().default('deepseek-reasoner'),
    AI_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
    AI_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
    AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1200),
    AI_MONTHLY_QUOTA_TOKENS: z.coerce.number().int().positive().default(2_000_000),
    AI_USD_PER_1K_INPUT: z.coerce.number().nonnegative().default(0.00027),
    AI_USD_PER_1K_OUTPUT: z.coerce.number().nonnegative().default(0.0011),
    AI_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
    /** Generación de imágenes de contenido: `mock` (SVG local) u `openai`. */
    IMAGE_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
    OPENAI_API_KEY: z.string().optional().default(''),
    OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),
    /** Organización destino del WhatsApp entrante (webhook sin sesión). */
    WHATSAPP_ORG_SLUG: z.string().default('demo'),
    WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
    WHATSAPP_WABA_ID: z.string().optional().default(''),
    WHATSAPP_VERIFY_TOKEN: z.string().optional().default(''),
    WHATSAPP_APP_SECRET: z.string().optional().default(''),
    PAYMENTS_DEFAULT_PROVIDER: z.enum(['sandbox', 'stripe']).default('sandbox'),
    /**
     * Pasarela sandbox para desarrollo/demos. Prohibida en producción:
     * `validateEnv` aborta el arranque si se combina con `NODE_ENV=production`.
     */
    PAYMENTS_SANDBOX_ENABLED: boolFromString.default(false),
    PAYMENTS_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    SEED_STAFF_EMAIL: z.string().optional(),
    SEED_STAFF_PASSWORD: z.string().optional(),
    SEED_CUSTOMER_EMAIL: z.string().optional(),
    SEED_CUSTOMER_PASSWORD: z.string().optional(),
    SEED_DUAL_EMAIL: z.string().optional(),
    SEED_DUAL_PASSWORD: z.string().optional(),
  })
  .passthrough();

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${details}`);
  }

  if (result.data.NODE_ENV === 'production' && result.data.DEV_AUTH_HELPERS) {
    throw new Error(
      'DEV_AUTH_HELPERS=true no está permitido con NODE_ENV=production: expone POST /auth/dev/totp y permitiría obtener códigos TOTP. Apagá el flag.',
    );
  }

  if (result.data.NODE_ENV === 'production' && result.data.PAYMENTS_SANDBOX_ENABLED) {
    throw new Error(
      'PAYMENTS_SANDBOX_ENABLED=true no está permitido con NODE_ENV=production: la pasarela sandbox confirma pagos sin cobrar. Apagá el flag.',
    );
  }

  if (result.data.NODE_ENV === 'production' && result.data.AI_PROVIDER === 'mock') {
    throw new Error(
      'AI_PROVIDER=mock no está permitido con NODE_ENV=production: genera contenido de relleno en vez de llamar al modelo. Configurá deepseek.',
    );
  }

  if (result.data.NODE_ENV === 'production' && result.data.IMAGE_PROVIDER === 'mock') {
    throw new Error(
      'IMAGE_PROVIDER=mock no está permitido con NODE_ENV=production: genera SVGs de relleno en vez de llamar al modelo de imágenes. Configurá openai.',
    );
  }

  const keyLength = Buffer.from(result.data.ENCRYPTION_KEY, 'base64').length;
  if (keyLength !== 32) {
    throw new Error('ENCRYPTION_KEY debe ser base64 de 32 bytes (AES-256).');
  }

  return result.data;
}
