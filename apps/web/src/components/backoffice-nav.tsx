'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppThemeKey } from '@ventascatalogo/contracts';

interface NavItem {
  href: string;
  label: string;
  index: string;
  icon: string;
}

const BASE_ITEMS: NavItem[] = [
  { href: '/panel', label: 'Resumen', index: '01', icon: 'resumen' },
  { href: '/panel/catalogos', label: 'Catálogos', index: '02', icon: 'catalogos' },
  { href: '/panel/productos', label: 'Productos', index: '03', icon: 'productos' },
  { href: '/panel/cotizaciones', label: 'Cotizaciones', index: '04', icon: 'cotizaciones' },
  { href: '/panel/pedidos', label: 'Pedidos', index: '05', icon: 'pedidos' },
  { href: '/panel/gastos', label: 'Gastos', index: '06', icon: 'gastos' },
  { href: '/panel/finanzas', label: 'Finanzas', index: '07', icon: 'finanzas' },
  { href: '/panel/contenido', label: 'Contenido', index: '08', icon: 'contenido' },
  { href: '/panel/chat', label: 'Chat', index: '09', icon: 'chat' },
  { href: '/panel/usuarios', label: 'Equipo', index: '10', icon: 'usuarios' },
  { href: '/panel/sesiones', label: 'Sesiones', index: '11', icon: 'sesiones' },
  { href: '/panel/ajustes', label: 'Ajustes', index: '12', icon: 'ajustes' },
];

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'resumen':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="9" rx="1.5" />
          <rect x="14" y="3" width="7" height="5" rx="1.5" />
          <rect x="14" y="12" width="7" height="9" rx="1.5" />
          <rect x="3" y="16" width="7" height="5" rx="1.5" />
        </svg>
      );
    case 'catalogos':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
          <path d="M6 6h10" />
          <path d="M6 10h10" />
        </svg>
      );
    case 'productos':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m7.5 4.27 9 5.15" />
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case 'cotizaciones':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    case 'pedidos':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      );
    case 'gastos':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </svg>
      );
    case 'finanzas':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case 'contenido':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3-1.9 4.8L5 9.5l4.8 1.9L12 16.5l1.9-5.1 5.1-1.9-5.1-1.9z" />
          <path d="M19 15l-1 2.5L15.5 19l2.5 1 1 2.5 1-2.5 2.5-1-2.5-1.5z" />
        </svg>
      );
    case 'chat':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      );
    case 'usuarios':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'sesiones':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case 'ajustes':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

interface NavGroupDef {
  id: string;
  title: string;
  hrefs: string[];
}

const COMPACT_GROUPS: NavGroupDef[] = [
  {
    id: 'operacion',
    title: 'Operación',
    hrefs: [
      '/panel',
      '/panel/pedidos',
      '/panel/cotizaciones',
      '/panel/productos',
      '/panel/catalogos',
    ],
  },
  {
    id: 'canales',
    title: 'Canales & IA',
    hrefs: ['/panel/chat', '/panel/contenido'],
  },
  {
    id: 'finanzas',
    title: 'Finanzas',
    hrefs: ['/panel/finanzas', '/panel/gastos'],
  },
  {
    id: 'sistema',
    title: 'Sistema',
    hrefs: ['/panel/ajustes', '/panel/usuarios', '/panel/sesiones'],
  },
];

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

  if (theme === 'COMPACTO') {
    let globalIndex = 1;
    return (
      <nav className="bo__nav" aria-label="Navegación del backoffice" data-theme={theme}>
        {COMPACT_GROUPS.map((group) => {
          const items = group.hrefs
            .map((href) => BASE_ITEMS.find((it) => it.href === href))
            .filter((it): it is NavItem => Boolean(it));

          return (
            <div key={group.id} className="bo__nav-group">
              <span className="bo__nav-group-title">{group.title}</span>
              <div className="bo__nav-group-items">
                {items.map((item) => {
                  const active =
                    item.href === '/panel'
                      ? pathname === '/panel'
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const displayIndex = String(globalIndex++).padStart(2, '0');

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      data-active={active}
                      className="bo__nav-link"
                    >
                      <span className="bo__nav-icon" aria-hidden="true">
                        <NavIcon name={item.icon} />
                      </span>
                      <span className="bo__nav-label">{item.label}</span>
                      <span className="bo__nav-index">{displayIndex}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    );
  }

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
          <Link key={item.href} href={item.href} data-active={active} className="bo__nav-link">
            <span className="bo__nav-icon" aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
            <span className="bo__nav-label">{item.label}</span>
            <span className="bo__nav-index">{item.index}</span>
          </Link>
        );
      })}
    </nav>
  );
}
