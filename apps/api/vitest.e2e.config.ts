import ts from 'typescript';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * esbuild (el transformador por defecto de Vite) no implementa
 * `emitDecoratorMetadata`, imprescindible para que NestJS resuelva la inyección
 * de dependencias por tipo (`design:paramtypes`). Este plugin usa el compilador
 * de TypeScript para transformar los `.ts` de la API igual que lo hace
 * `nest build`, y así los E2E pueden importar `AppModule` real desde `src/`.
 */
function decoratorMetadataPlugin(): Plugin {
  return {
    name: 'vc-typescript-decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/')) return null;
      const result = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
          sourceMap: true,
        },
      });
      return { code: result.outputText, map: result.sourceMapText ?? null };
    },
  };
}

export default defineConfig({
  plugins: [decoratorMetadataPlugin()],
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // Los E2E comparten Postgres/Redis/MinIO y usuarios del seed: se ejecutan
    // en serie para que el orden sea determinista y la limpieza no se pise.
    fileParallelism: false,
    sequence: { concurrent: false },
    passWithNoTests: false,
    testTimeout: 40_000,
    hookTimeout: 60_000,
  },
});
