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
 */
export function resolveFace(host: string, pathname: string): FaceResolution {
  const normalizedHost = host.toLowerCase().split(':')[0] ?? '';
  const isStaffHost = normalizedHost.startsWith('app.');
  const isStoreHost = normalizedHost.startsWith('tienda.');
  const isPanel = pathname === '/panel' || pathname.startsWith('/panel/');
  const isCustomerArea =
    pathname === '/mi-cuenta' || pathname.startsWith('/mi-cuenta/');
  const isAuthArea = pathname.startsWith('/login') || pathname.startsWith('/invitacion');
  const isStoreArea =
    pathname === '/tienda' || pathname.startsWith('/tienda/') || pathname.startsWith('/c/');
  const isApi = pathname.startsWith('/api/');

  if (isApi) {
    return { face: 'hub', rewriteTo: null, requiresStaff: false, requiresCustomer: false };
  }

  if (isStaffHost) {
    if (pathname === '/') {
      return { face: 'staff', rewriteTo: '/panel', requiresStaff: true, requiresCustomer: false };
    }
    if (!isPanel && !isAuthArea) {
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
      requiresCustomer: isCustomerArea && !pathname.startsWith('/mi-cuenta/entrar'),
    };
  }

  if (isStoreArea && !isPanel) {
    return {
      face: 'hub',
      rewriteTo: null,
      requiresStaff: false,
      requiresCustomer: isCustomerArea && !pathname.startsWith('/mi-cuenta/entrar'),
    };
  }

  return {
    face: 'hub',
    rewriteTo: null,
    requiresStaff: isPanel,
    requiresCustomer: isCustomerArea && !pathname.startsWith('/mi-cuenta/entrar'),
  };
}
