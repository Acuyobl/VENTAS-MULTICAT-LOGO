import type { AppThemeKey } from '@ventascatalogo/contracts';

export const APP_THEME_KEYS: AppThemeKey[] = ['CLASICO', 'MODERNO', 'COMPACTO'];

export const APP_THEME_META: Record<
  AppThemeKey,
  { label: string; tagline: string; description: string; layout: string; colors: string[] }
> = {
  CLASICO: {
    label: 'Clásica (Editorial Lino)',
    tagline: 'Verde #0F766E · Beige #FFFBEB · Naranja #F97316',
    description:
      'La identidad insignia: Verde esmeralda (#0F766E), fondo pergamino cálido (#FFFBEB) y acentos en naranja solar (#F97316). Tipografía serif Fraunces y menú lateral tradicional.',
    layout: 'Menú lateral · Tipografía serif',
    colors: ['#0F766E', '#FFFBEB', '#F97316'],
  },
  MODERNO: {
    label: 'Moderna (Cobalt & Cyan)',
    tagline: 'Cobalto #4338CA · Glaciar #F8FAFC · Cian #06B6D4',
    description:
      'Tendencia de vanguardia tecnológica: Azul cobalto profundo (#4338CA), fondo blanco hielo impoluto (#F8FAFC) y acentos en cian neón eléctrico (#06B6D4). Barra superior horizontal y tipografía sans geométrica.',
    layout: 'Menú superior · Tipografía sans',
    colors: ['#4338CA', '#F8FAFC', '#06B6D4'],
  },
  COMPACTO: {
    label: 'Compacta (Haute Noir & Coral)',
    tagline: 'Ciruela #2E1065 · Crema Rosé #FDF2F8 · Coral #F43F5E',
    description:
      'Boutique de alta densidad y moda: Ciruela imperial profundo (#2E1065), fondo crema rosé sutil (#FDF2F8) y acento coral/frambuesa llamativo (#F43F5E). Rail angosto y tipografía mono de alta precisión.',
    layout: 'Rail angosto · Máxima densidad',
    colors: ['#2E1065', '#FDF2F8', '#F43F5E'],
  },
};

export function resolveTheme(value: string | undefined | null): AppThemeKey {
  return value === 'MODERNO' || value === 'COMPACTO' ? value : 'CLASICO';
}
