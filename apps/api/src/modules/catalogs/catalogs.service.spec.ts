import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import type { AuditService } from '../audit/audit.service';
import type { StorageService } from '../storage/storage.service';
import { CatalogsService } from './catalogs.service';
import type { CatalogsRepository } from './catalogs.repository';
import type { AuditMeta } from '../../common/audit/audit.types';

const user = {
  id: '01920000-0000-7000-8000-000000000001',
  organizationId: '01920000-0000-7000-8000-000000000002',
  audience: 'staff',
  roleKeys: ['catalog_admin'],
} as unknown as AuthenticatedUser;

const meta: AuditMeta = { ip: '127.0.0.1', userAgent: 'vitest', traceId: 'trace-1' };

function buildService(overrides: {
  catalog?: { id: string; name: string; slug: string; activeVersionId: string | null } | null;
  openOrders?: number;
}) {
  const repo = {
    findCatalogForDelete: vi
      .fn()
      .mockResolvedValue(
        overrides.catalog === undefined
          ? { id: 'cat-1', name: 'Catálogo', slug: 'catalogo', activeVersionId: 'ver-1' }
          : overrides.catalog,
      ),
    countOpenOrders: vi.fn().mockResolvedValue(overrides.openOrders ?? 0),
    softDeleteCatalog: vi.fn().mockResolvedValue(undefined),
  } as unknown as CatalogsRepository;
  const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const service = new CatalogsService(repo, {} as StorageService, audit);
  return { service, repo, audit };
}

describe('CatalogsService.delete', () => {
  it('409 catalog_has_open_orders y no borra si hay pedidos abiertos', async () => {
    const { service, repo } = buildService({ openOrders: 2 });
    await expect(service.delete(user, 'cat-1', meta)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { reason: 'catalog_has_open_orders', openOrders: 2 },
    });
    expect(repo.softDeleteCatalog).not.toHaveBeenCalled();
  });

  it('soft delete + archiva la versión activa y audita cuando no hay pedidos', async () => {
    const { service, repo, audit } = buildService({ openOrders: 0 });
    await service.delete(user, 'cat-1', meta);
    expect(repo.softDeleteCatalog).toHaveBeenCalledWith('cat-1', 'ver-1');
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog.deleted',
        entityId: 'cat-1',
        before: expect.objectContaining({ name: 'Catálogo', activeVersionId: 'ver-1' }),
        after: expect.objectContaining({ activeVersionId: null }),
      }),
    );
  });

  it('404 si el catálogo no existe o es de otra organización', async () => {
    const { service } = buildService({ catalog: null });
    await expect(service.delete(user, 'cat-x', meta)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
