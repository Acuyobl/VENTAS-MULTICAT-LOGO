import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@ventascatalogo/contracts';
import type { AuditService } from '../audit/audit.service';
import type { StorageService } from '../storage/storage.service';
import {
  calculateAdjustedPrice,
  CatalogsService,
  deletedCatalogSlug,
  slugifyName,
} from './catalogs.service';
import type { CatalogsRepository } from './catalogs.repository';
import type { AuditMeta } from '../../common/audit/audit.types';
import * as XLSX from 'xlsx';

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
    expect(repo.softDeleteCatalog).toHaveBeenCalledWith(
      'cat-1',
      'ver-1',
      expect.stringMatching(/^catalogo-eliminado-[a-z0-9]+$/),
    );
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog.deleted',
        entityId: 'cat-1',
        before: expect.objectContaining({ name: 'Catálogo', activeVersionId: 'ver-1' }),
        after: expect.objectContaining({
          activeVersionId: null,
          slug: expect.stringMatching(/^catalogo-eliminado-/),
        }),
      }),
    );
  });

  it('el fallo por pedidos abiertos no renombra el slug (no borra)', async () => {
    const { service, repo } = buildService({ openOrders: 1 });
    await expect(service.delete(user, 'cat-1', meta)).rejects.toMatchObject({
      details: { reason: 'catalog_has_open_orders' },
    });
    expect(repo.softDeleteCatalog).not.toHaveBeenCalled();
  });

  it('deletedCatalogSlug libera el original y respeta formato/80 chars', () => {
    const renamed = deletedCatalogSlug('ferreteria-cr', 'abc123');
    expect(renamed).toBe('ferreteria-cr-eliminado-abc123');
    expect(renamed).toMatch(/^[a-z0-9-]+$/);
    expect(renamed.length).toBeLessThanOrEqual(80);

    const longSlug = 'a'.repeat(100);
    const longRenamed = deletedCatalogSlug(longSlug, 'xyz');
    expect(longRenamed.length).toBeLessThanOrEqual(80);
    expect(longRenamed).toMatch(/-eliminado-xyz$/);
  });

  it('404 si el catálogo no existe o es de otra organización', async () => {
    const { service } = buildService({ catalog: null });
    await expect(service.delete(user, 'cat-x', meta)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('calculateAdjustedPrice', () => {
  it('aplica porcentaje de aumento (+10%) con redondeo correcto', () => {
    // 5000 CRC + 10% = 5500
    const res = calculateAdjustedPrice(5000n, 'CRC', {
      type: 'PERCENTAGE',
      direction: 'INCREASE',
      value: 10,
    });
    expect(res).toBe(5500n);
  });

  it('aplica porcentaje de rebaja (-15%)', () => {
    // 10000 CRC - 15% = 8500
    const res = calculateAdjustedPrice(10000n, 'CRC', {
      type: 'PERCENTAGE',
      direction: 'DECREASE',
      value: 15,
    });
    expect(res).toBe(8500n);
  });

  it('aplica monto fijo de aumento en USD (+$5.00 = +500 cents)', () => {
    // 2000 ($20.00) + $5.00 (500 cents) = 2500
    const res = calculateAdjustedPrice(2000n, 'USD', {
      type: 'FIXED',
      direction: 'INCREASE',
      value: 5,
    });
    expect(res).toBe(2500n);
  });

  it('aplica monto fijo de rebaja en CRC (-₡500)', () => {
    // 3000 CRC - 500 CRC = 2500
    const res = calculateAdjustedPrice(3000n, 'CRC', {
      type: 'FIXED',
      direction: 'DECREASE',
      value: 500,
    });
    expect(res).toBe(2500n);
  });

  it('nunca permite precio menor o igual a 0 (clamping a 1 minor unit)', () => {
    const res = calculateAdjustedPrice(500n, 'CRC', {
      type: 'FIXED',
      direction: 'DECREASE',
      value: 1000,
    });
    expect(res).toBe(1n);
  });
});

describe('CatalogsService.duplicate', () => {
  it('clona el catálogo, su versión activa y sus productos', async () => {
    const originalCatalog = {
      id: 'cat-src',
      name: 'Catálogo Fuente',
      slug: 'fuente',
      description: 'Desc',
      organizationId: user.organizationId,
      activeVersionId: 'ver-src',
    };

    const repo = {
      findForMember: vi.fn().mockResolvedValue(originalCatalog),
      findCatalogBySlug: vi.fn().mockResolvedValue(null),
      duplicateCatalog: vi.fn().mockResolvedValue({
        catalog: {
          id: 'cat-new',
          name: 'Copia de Catálogo Fuente',
          slug: 'fuente-copia',
          description: 'Desc',
          activeVersionId: 'ver-new',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        },
        activeVersionNumber: 1,
        productCount: 5,
        currency: 'CRC',
      }),
    } as unknown as CatalogsRepository;

    const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new CatalogsService(repo, {} as StorageService, audit);

    const result = await service.duplicate(
      user,
      'cat-src',
      { name: 'Copia de Catálogo Fuente', slug: 'fuente-copia' },
      meta,
    );

    expect(result.id).toBe('cat-new');
    expect(result.productCount).toBe(5);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog.duplicated',
        entityId: 'cat-new',
      }),
    );
  });
});

describe('CatalogsService.export', () => {
  it('exporta a XLSX con las columnas requeridas', async () => {
    const mockProducts = [
      {
        id: 'p-1',
        sku: 'SKU-001',
        name: 'Camiseta Premium',
        category: 'Ropa',
        brand: 'Sublimania',
        priceMinor: 7500n,
        currency: 'CRC',
        stock: 20,
        description: 'Algodón 100%',
        imageKey: 'img-1.jpg',
        attributes: { talla: 'M', color: 'Azul' },
      },
    ];

    const repo = {
      findCatalogWithActiveProducts: vi.fn().mockResolvedValue({
        id: 'cat-1',
        name: 'Catálogo Principal',
        slug: 'principal',
        activeVersion: {
          id: 'ver-1',
          currency: 'CRC',
          products: mockProducts,
        },
      }),
    } as unknown as CatalogsRepository;

    const storage = {
      presignGetObjectSafe: vi.fn().mockResolvedValue('https://storage/img-1.jpg'),
    } as unknown as StorageService;

    const service = new CatalogsService(repo, storage, {} as AuditService);
    const { buffer, filename, contentType } = await service.export(user, 'cat-1', 'xlsx');

    expect(filename).toBe('principal-productos.xlsx');
    expect(contentType).toContain('spreadsheetml');
    expect(buffer.byteLength).toBeGreaterThan(0);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]!];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!);
    expect(json).toHaveLength(1);
    expect(json[0]!['SKU']).toBe('SKU-001');
    expect(json[0]!['Nombre']).toBe('Camiseta Premium');
    expect(json[0]!['Categoría']).toBe('Ropa');
    expect(json[0]!['Precio']).toBe(7500);
    expect(json[0]!['URL de Imagen']).toBe('https://storage/img-1.jpg');
  });

  it('exporta a CSV con BOM y codificación utf-8', async () => {
    const mockProducts = [
      {
        id: 'p-1',
        sku: 'SKU-002',
        name: 'Gorra Clásica',
        category: 'Accesorios',
        brand: null,
        priceMinor: 5000n,
        currency: 'CRC',
        stock: 10,
        description: null,
        imageKey: null,
        attributes: null,
      },
    ];

    const repo = {
      findCatalogWithActiveProducts: vi.fn().mockResolvedValue({
        id: 'cat-1',
        name: 'Catálogo Principal',
        slug: 'principal',
        activeVersion: {
          id: 'ver-1',
          currency: 'CRC',
          products: mockProducts,
        },
      }),
    } as unknown as CatalogsRepository;

    const service = new CatalogsService(repo, {} as StorageService, {} as AuditService);
    const { buffer, filename, contentType } = await service.export(user, 'cat-1', 'csv');

    expect(filename).toBe('principal-productos.csv');
    expect(contentType).toBe('text/csv; charset=utf-8');
    const text = buffer.toString('utf-8');
    expect(text.startsWith('\uFEFF')).toBe(true);
    expect(text).toContain('SKU-002');
    expect(text).toContain('Gorra Clásica');
  });
});

describe('CatalogsService.bulkPriceAdjustment', () => {
  it('simula la vista previa del ajuste masivo', async () => {
    const catalog = {
      id: 'cat-1',
      activeVersionId: 'ver-1',
      activeVersion: {
        id: 'ver-1',
        currency: 'CRC',
      },
    };

    const products = [
      {
        id: 'p-1',
        sku: 'SKU-1',
        name: 'Producto 1',
        category: 'Calzado',
        priceMinor: 10000n,
        currency: 'CRC',
      },
    ];

    const repo = {
      findForMember: vi.fn().mockResolvedValue(catalog),
      getActiveProductsForPriceAdjustment: vi.fn().mockResolvedValue(products),
    } as unknown as CatalogsRepository;

    const service = new CatalogsService(repo, {} as StorageService, {} as AuditService);

    const preview = await service.previewBulkPriceAdjustment(user, 'cat-1', {
      scope: 'CATEGORY',
      category: 'Calzado',
      type: 'PERCENTAGE',
      direction: 'INCREASE',
      value: 10,
    });

    expect(preview.totalProducts).toBe(1);
    expect(preview.sampleItems[0]!.currentPriceMinor).toBe('10000');
    expect(preview.sampleItems[0]!.newPriceMinor).toBe('11000');
    expect(preview.sampleItems[0]!.differenceMinor).toBe('1000');
  });

  it('aplica el ajuste masivo y registra auditoría', async () => {
    const catalog = {
      id: 'cat-1',
      activeVersionId: 'ver-1',
      activeVersion: {
        id: 'ver-1',
        currency: 'CRC',
      },
    };

    const products = [
      {
        id: 'p-1',
        sku: 'SKU-1',
        name: 'Producto 1',
        category: 'Calzado',
        priceMinor: 10000n,
        currency: 'CRC',
      },
    ];

    const repo = {
      findForMember: vi.fn().mockResolvedValue(catalog),
      getActiveProductsForPriceAdjustment: vi.fn().mockResolvedValue(products),
      applyBulkProductPriceUpdates: vi.fn().mockResolvedValue(1),
    } as unknown as CatalogsRepository;

    const audit = { write: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new CatalogsService(repo, {} as StorageService, audit);

    const result = await service.applyBulkPriceAdjustment(
      user,
      'cat-1',
      {
        scope: 'ALL',
        type: 'FIXED',
        direction: 'INCREASE',
        value: 500,
      },
      meta,
    );

    expect(result.updatedCount).toBe(1);
    expect(repo.applyBulkProductPriceUpdates).toHaveBeenCalledWith([
      { id: 'p-1', priceMinor: 10500n },
    ]);
    expect(audit.write).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'catalog.bulk_price_adjustment',
        entityId: 'cat-1',
      }),
    );
  });
});
