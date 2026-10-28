import { describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import { canViewProductCost } from './product-permissions';

function userWithRoles(roleKeys: string[]): AuthenticatedUser {
  return { roleKeys } as unknown as AuthenticatedUser;
}

describe('canViewProductCost (A-R6)', () => {
  it('oculta el costo a vendedor, social_manager y agente_chat', () => {
    expect(canViewProductCost(userWithRoles(['vendedor']))).toBe(false);
    expect(canViewProductCost(userWithRoles(['social_manager']))).toBe(false);
    expect(canViewProductCost(userWithRoles(['agente_chat']))).toBe(false);
  });

  it('lo muestra a los roles con acceso de gestión', () => {
    expect(canViewProductCost(userWithRoles(['org_admin']))).toBe(true);
    expect(canViewProductCost(userWithRoles(['catalog_admin']))).toBe(true);
    expect(canViewProductCost(userWithRoles(['finanzas']))).toBe(true);
    expect(canViewProductCost(userWithRoles(['catalog_admin', 'vendedor']))).toBe(false);
  });
});
