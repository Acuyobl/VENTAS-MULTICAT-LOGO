import type { AuthenticatedUser } from '@ventascatalogo/contracts';

/**
 * A-R6 (campos sensibles): `costMinor` se excluye por serialización para estos
 * roles, aunque tengan `product:read`. El resto de roles staff sí lo ven.
 */
export const COST_HIDDEN_ROLES = ['vendedor', 'social_manager', 'agente_chat'] as const;

export function canViewProductCost(user: AuthenticatedUser): boolean {
  return !user.roleKeys.some((role) =>
    COST_HIDDEN_ROLES.includes(role as (typeof COST_HIDDEN_ROLES)[number]),
  );
}
