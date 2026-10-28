import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

/** Configuración mínima válida; cada test sobreescribe lo que necesita. */
function baseEnv(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    NODE_ENV: 'development',
    API_PUBLIC_URL: 'http://localhost:3001',
    WEB_PUBLIC_URL: 'http://localhost:3000',
    CORS_ORIGINS: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://vc:vc@localhost:5432/ventascatalogo?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    ...overrides,
  };
}

describe('validateEnv · DEV_AUTH_HELPERS', () => {
  it('por defecto el flag está apagado', () => {
    const env = validateEnv(baseEnv());
    expect(env.DEV_AUTH_HELPERS).toBe(false);
  });

  it('acepta el flag en desarrollo y lo transforma a boolean', () => {
    const env = validateEnv(baseEnv({ DEV_AUTH_HELPERS: 'true' }));
    expect(env.DEV_AUTH_HELPERS).toBe(true);
  });

  it('aborta si NODE_ENV=production y DEV_AUTH_HELPERS=true', () => {
    expect(() =>
      validateEnv(baseEnv({ NODE_ENV: 'production', DEV_AUTH_HELPERS: 'true' })),
    ).toThrow(/DEV_AUTH_HELPERS=true no está permitido con NODE_ENV=production/);
  });

  it('permite producción con el flag apagado', () => {
    const env = validateEnv(baseEnv({ NODE_ENV: 'production', DEV_AUTH_HELPERS: 'false' }));
    expect(env.DEV_AUTH_HELPERS).toBe(false);
  });

  it('rechaza valores que no sean booleanos', () => {
    expect(() => validateEnv(baseEnv({ DEV_AUTH_HELPERS: 'sí' }))).toThrow(
      /Configuración de entorno inválida/,
    );
  });
});

describe('validateEnv · cobros', () => {
  it('por defecto la pasarela sandbox está apagada y el proveedor es sandbox', () => {
    const env = validateEnv(baseEnv());
    expect(env.PAYMENTS_SANDBOX_ENABLED).toBe(false);
    expect(env.PAYMENTS_DEFAULT_PROVIDER).toBe('sandbox');
    expect(env.PAYMENTS_LINK_TTL_MINUTES).toBe(60);
  });

  it('acepta la pasarela sandbox en desarrollo', () => {
    const env = validateEnv(
      baseEnv({ PAYMENTS_SANDBOX_ENABLED: 'true', PAYMENTS_DEFAULT_PROVIDER: 'stripe' }),
    );
    expect(env.PAYMENTS_SANDBOX_ENABLED).toBe(true);
    expect(env.PAYMENTS_DEFAULT_PROVIDER).toBe('stripe');
  });

  it('aborta si NODE_ENV=production y PAYMENTS_SANDBOX_ENABLED=true', () => {
    expect(() =>
      validateEnv(baseEnv({ NODE_ENV: 'production', PAYMENTS_SANDBOX_ENABLED: 'true' })),
    ).toThrow(/PAYMENTS_SANDBOX_ENABLED=true no está permitido con NODE_ENV=production/);
  });

  it('permite producción con la pasarela sandbox apagada', () => {
    const env = validateEnv(baseEnv({ NODE_ENV: 'production', PAYMENTS_SANDBOX_ENABLED: 'false' }));
    expect(env.PAYMENTS_SANDBOX_ENABLED).toBe(false);
  });

  it('rechaza un proveedor de pago desconocido', () => {
    expect(() => validateEnv(baseEnv({ PAYMENTS_DEFAULT_PROVIDER: 'paypal' }))).toThrow(
      /Configuración de entorno inválida/,
    );
  });
});
