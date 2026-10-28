import type { Audience } from '@ventascatalogo/contracts';

export interface CatalogScope {
  organizationId: string;
  catalogId: string;
  catalogVersionId: string;
  userId: string;
  audience: Audience;
  roleKeys: string[];
  permissions: string[];
}

export interface RequestWithContext {
  traceId?: string;
  ip?: string;
  userAgent?: string;
  user?: import('@ventascatalogo/contracts').AuthenticatedUser;
  catalogScope?: CatalogScope;
}
