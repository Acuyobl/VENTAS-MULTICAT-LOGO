import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'VentasCatálogo',
    template: '%s · VentasCatálogo',
  },
  description:
    'Catálogos, pedidos y clientes en una sola casa. Backoffice y tienda para negocios que venden con identidad propia.',
  applicationName: 'VentasCatálogo',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'VentasCatálogo',
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  themeColor: '#0f3b2b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
