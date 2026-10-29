'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppThemeKey } from '@ventascatalogo/contracts';

interface NavItem {
  href: string;
  label: string;
  index: string;
}

const BASE_ITEMS: NavItem[] = [
  { href: '/panel', label: 'Resumen', index: '01' },
  { href: '/panel/catalogos', label: 'Catálogos', index: '02' },
  { href: '/panel/productos', label: 'Productos', index: '03' },
  { href: '/panel/cotizaciones', label: 'Cotizaciones', index: '04' },
  { href: '/panel/pedidos', label: 'Pedidos', index: '05' },
  { href: '/panel/gastos', label: 'Gastos', index: '06' },
  { href: '/panel/finanzas', label: 'Finanzas', index: '07' },
  { href: '/panel/contenido', label: 'Contenido', index: '08' },
  { href: '/panel/chat', label: 'Chat', index: '09' },
  { href: '/panel/usuarios', label: 'Equipo', index: '10' },
  { href: '/panel/sesiones', label: 'Sesiones', index: '11' },
  { href: '/panel/ajustes', label: 'Ajustes', index: '12' },
];

/** Cada tema ordena los menús distinto: el tema cambia el orden y el énfasis del shell. */
const THEME_ORDER: Record<AppThemeKey, string[]> = {
  CLASICO: [
    '/panel',
    '/panel/catalogos',
    '/panel/productos',
    '/panel/cotizaciones',
    '/panel/pedidos',
    '/panel/gastos',
    '/panel/finanzas',
    '/panel/contenido',
    '/panel/chat',
    '/panel/usuarios',
    '/panel/sesiones',
    '/panel/ajustes',
  ],
  MODERNO: [
    '/panel',
    '/panel/cotizaciones',
    '/panel/pedidos',
    '/panel/productos',
    '/panel/catalogos',
    '/panel/contenido',
    '/panel/chat',
    '/panel/finanzas',
    '/panel/gastos',
    '/panel/equipo',
    '/panel/usuarios',
    '/panel/sesiones',
    '/panel/ajustes',
  ],
  COMPACTO: [
    '/panel',
    '/panel/pedidos',
    '/panel/cotizaciones',
    '/panel/productos',
    '/panel/catalogos',
    '/panel/chat',
    '/panel/contenido',
    '/panel/finanzas',
    '/panel/gastos',
    '/panel/ajustes',
    '/panel/usuarios',
    '/panel/sesiones',
  ],
};

export function BackofficeNav({ theme = 'CLASICO' }: { theme?: AppThemeKey }) {
  const pathname = usePathname();
  const order = THEME_ORDER[theme] ?? THEME_ORDER.CLASICO;
  const items = order
    .map((href) => BASE_ITEMS.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item));

  return (
    <nav className="bo__nav" aria-label="Navegación del backoffice" data-theme={theme}>
      {items.map((item) => {
        const active =
          item.href === '/panel'
            ? pathname === '/panel'
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} data-active={active}>
            <span className="bo__nav-index">{item.index}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
