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
    label: 'Compacta (Navy & Electric Lime)',
    tagline: 'Azul Navy #111827 · Cool White #F3F4F6 · Electric Lime #A3E635',
    description:
      'Tendencia cibernética de alta densidad: Azul navy profundo (#111827), fondo cool white limpio (#F3F4F6) y acentos en electric lime neón (#A3E635). Rail angosto, tipografía mono de alta precisión y máximo contraste.',
    layout: 'Rail angosto · Máxima densidad',
    colors: ['#111827', '#F3F4F6', '#A3E635'],
  },
};

export function resolveTheme(value: string | undefined | null): AppThemeKey {
  return value === 'MODERNO' || value === 'COMPACTO' ? value : 'CLASICO';
}
