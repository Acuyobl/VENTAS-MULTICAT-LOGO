export type Face = 'staff' | 'store' | 'hub';

export interface FaceResolution {
  face: Face;
  rewriteTo: string | null;
  requiresStaff: boolean;
  requiresCustomer: boolean;
}

/**
 * Resuelve la cara de la aplicación a partir del host, sin depender del
 * runtime de Next. Se prueba en unit tests y se usa desde middleware.ts.
 *
 * Regla clave: las superficies de la **cara B** (tienda pública `/c/[slug]`,
 * `/tienda` y portal `/mi-cuenta`) funcionan en **cualquier** host, porque el
 * backoffice enlaza al catálogo público para previsualizarlo. Solo las rutas de
 * backoffice (`/panel`) se reescriben bajo el host `app.`.
 */
export function resolveFace(host: string, pathname: string): FaceResolution {
  const normalizedHost = host.toLowerCase().split(':')[0] ?? '';
  const isStaffHost = normalizedHost.startsWith('app.');
  const isStoreHost = normalizedHost.startsWith('tienda.');
  const isPanel = pathname === '/panel' || pathname.startsWith('/panel/');
  const isCustomerArea = pathname === '/mi-cuenta' || pathname.startsWith('/mi-cuenta/');
  const isCustomerLogin = pathname.startsWith('/mi-cuenta/entrar');
  const isAuthArea = pathname.startsWith('/login') || pathname.startsWith('/invitacion');
  const isPublicCatalog = pathname === '/c' || pathname.startsWith('/c/');
  const isStoreArea =
    pathname === '/tienda' || pathname.startsWith('/tienda/') || isPublicCatalog;
  const isApi = pathname.startsWith('/api/');

  if (isApi) {
    return { face: 'hub', rewriteTo: null, requiresStaff: false, requiresCustomer: false };
  }

  // Cara B: tienda y portal del cliente. Se sirven sin reescritura en cualquier host.
  if (isStoreArea || isCustomerArea) {
    return {
      face: isStoreArea ? 'store' : 'hub',
      rewriteTo: null,
      requiresStaff: false,
      requiresCustomer: isCustomerArea && !isCustomerLogin,
    };
  }

  if (isStaffHost) {
    if (pathname === '/') {
      return { face: 'staff', rewriteTo: '/panel', requiresStaff: true, requiresCustomer: false };
    }
    if (!isPanel && !isAuthArea) {
      // Atajo del backoffice: app.localhost/usuarios → /panel/usuarios
      return {
        face: 'staff',
        rewriteTo: `/panel${pathname}`,
        requiresStaff: true,
        requiresCustomer: false,
      };
    }
    return { face: 'staff', rewriteTo: null, requiresStaff: isPanel, requiresCustomer: false };
  }

  if (isStoreHost) {
    if (pathname === '/') {
      return { face: 'store', rewriteTo: '/tienda', requiresStaff: false, requiresCustomer: false };
    }
    return {
      face: 'store',
      rewriteTo: null,
      requiresStaff: isPanel,
      requiresCustomer: false,
    };
  }

  return {
    face: 'hub',
    rewriteTo: null,
    requiresStaff: isPanel,
    requiresCustomer: false,
  };
}
