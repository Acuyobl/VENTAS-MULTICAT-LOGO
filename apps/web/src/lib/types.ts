export type Audience = 'staff' | 'customer';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  audience: Audience;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleKeys: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaEnrollmentRequired: boolean;
}

export interface CatalogSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  activeVersionId: string | null;
  activeVersionNumber: number | null;
  productCount: number;
  currency: 'CRC' | 'USD';
  updatedAt: string;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  priceMinor: string;
  currency: 'CRC' | 'USD';
  stock: number | null;
  attributes?: Record<string, unknown> | null;
  imageKey: string | null;
  /** URL firmada de la imagen (MinIO); null si el producto no tiene imagen. */
  imageUrl?: string | null;
}

export interface PublicCatalog {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  organizationName: string;
  versionId: string;
  versionNumber: number;
  currency: 'CRC' | 'USD';
  taxRateBp: number;
  taxIncluded: boolean;
  products: ProductSummary[];
}

export interface MemberSummary {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  status: string;
  roleKeys: string[];
  joinedAt: string | null;
}

export interface AssignableRole {
  key: string;
  name: string;
  description: string | null;
}

export interface MembersResponse {
  items: MemberSummary[];
  roles: AssignableRole[];
}

export interface SessionSummary {
  id: string;
  audience: string;
  organizationId: string;
  deviceName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface InvitationPreview {
  email: string;
  organizationName: string;
  roleName: string;
  expiresAt: string;
}

export interface LoginResponse {
  status: 'authenticated' | 'mfa_required' | 'mfa_enrollment_required';
  user?: AuthUser;
  mfaToken?: string;
  accessTokenExpiresAt?: string;
}

export interface MfaEnrollment {
  secret: string;
  otpauthUrl: string;
}

export interface ReadinessResponse {
  status: 'ok' | 'degraded';
  checks: Record<string, 'up' | 'down'>;
}
