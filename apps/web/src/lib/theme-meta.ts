import type { AppThemeKey } from '@ventascatalogo/contracts';

export const APP_THEME_KEYS: AppThemeKey[] = ['CLASICO', 'MODERNO', 'COMPACTO'];

export const APP_THEME_META: Record<
  AppThemeKey,
  { label: string; tagline: string; description: string; layout: string }
> = {
  CLASICO: {
    label: 'Clásica',
    tagline: 'Editorial · sidebar',
    description:
      'La identidad original: tipografía serif (Fraunces), papel cálido, menú lateral numerado y espaciado amplio.',
    layout: 'Menú lateral · tipografía serif',
  },
  MODERNO: {
    label: 'Moderna',
    tagline: 'Sans · barra superior',
    description:
      'Tipografía sans (Archivo) más grande, barra de navegación horizontal arriba, acento verde azulado y grilla más densa.',
    layout: 'Menú superior · tipografía sans',
  },
  COMPACTO: {
    label: 'Compacta',
    tagline: 'Densa · operativa',
    description:
      'Todo más pequeño y junto: tipografía mono para títulos, rail angosto y tarjetas densas. Ideal para operar rápido.',
    layout: 'Rail angosto · densidad alta',
  },
};

export function resolveTheme(value: string | undefined | null): AppThemeKey {
  return value === 'MODERNO' || value === 'COMPACTO' ? value : 'CLASICO';
}
