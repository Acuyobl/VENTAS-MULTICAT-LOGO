import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'vc:permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/** Exige al menos uno de los permisos indicados (OR). */
export const ANY_PERMISSIONS_KEY = 'vc:anyPermissions';
export const RequireAnyPermissions = (...permissions: string[]) =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);

export const SKIP_PERMISSIONS_KEY = 'vc:skipPermissions';
export const SkipPermissions = () => SetMetadata(SKIP_PERMISSIONS_KEY, true);
