'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
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

export function BackofficeNav() {
  const pathname = usePathname();

  return (
    <nav className="bo__nav" aria-label="Navegación del backoffice">
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
