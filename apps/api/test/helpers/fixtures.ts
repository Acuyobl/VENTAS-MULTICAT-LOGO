import { hash } from 'argon2';
import { randomBytes } from 'node:crypto';
import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Datos de prueba idempotentes: cada ejecución crea usuarios/catálogos con
 * emails y slugs únicos y los borra en `afterAll`. El seed de demo no se toca.
 */
export const DEFAULT_PASSWORD = 'Demo1234!';

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now()}.${randomBytes(4).toString('hex')}@qa.ventascatalogo.test`;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

export async function requireOrgId(prisma: PrismaService, slug: string): Promise<string> {
  const organization = await prisma.organization.findUnique({ where: { slug } });
  if (!organization) {
    throw new Error(
      `No existe la organización "${slug}": ejecutá "pnpm db:seed" antes de los E2E.`,
    );
  }
  return organization.id;
}

export async function requireSystemRoleId(prisma: PrismaService, key: string): Promise<string> {
  const role = await prisma.role.findFirst({
    where: { key, organizationId: null, isSystem: true },
  });
  if (!role) {
    throw new Error(`No existe el rol de sistema "${key}": ejecutá "pnpm db:seed".`);
  }
  return role.id;
}

export interface StaffFixture {
  userId: string;
  email: string;
  password: string;
  organizationId: string;
  organizationSlug: string;
  membershipId: string;
  roleKey: string;
}

export async function createStaffFixture(
  prisma: PrismaService,
  options: { organizationSlug: string; roleKey: string; emailPrefix?: string },
): Promise<StaffFixture> {
  const organizationId = await requireOrgId(prisma, options.organizationSlug);
  const roleId = await requireSystemRoleId(prisma, options.roleKey);
  const email = uniqueEmail(options.emailPrefix ?? options.roleKey);
  const password = DEFAULT_PASSWORD;

  const user = await prisma.user.create({
    data: {
      email,
      fullName: `QA ${options.roleKey}`,
      passwordHash: await hash(password, { type: 2 }),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      mfaEnabled: false,
    },
  });

  const membership = await prisma.membership.create({
    data: {
      organizationId,
      userId: user.id,
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      membershipId: membership.id,
      roleId,
      scopeType: 'ORGANIZATION',
      scopeId: organizationId,
    },
  });

  return {
    userId: user.id,
    email,
    password,
    organizationId,
    organizationSlug: options.organizationSlug,
    membershipId: membership.id,
    roleKey: options.roleKey,
  };
}

export interface CustomerFixture {
  userId: string;
  email: string;
  password: string;
  organizationId: string;
  customerAccountId: string;
  customerId: string;
}

export async function createCustomerFixture(
  prisma: PrismaService,
  options: { organizationSlug: string; emailPrefix?: string },
): Promise<CustomerFixture> {
  const organizationId = await requireOrgId(prisma, options.organizationSlug);
  const customerRoleId = await requireSystemRoleId(prisma, 'customer');
  const email = uniqueEmail(options.emailPrefix ?? 'customer');
  const password = DEFAULT_PASSWORD;

  const user = await prisma.user.create({
    data: {
      email,
      fullName: 'QA Cliente',
      passwordHash: await hash(password, { type: 2 }),
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
  });

  const customer = await prisma.customer.create({
    data: { organizationId, name: 'QA Cliente', email },
  });

  const account = await prisma.customerAccount.create({
    data: {
      userId: user.id,
      organizationId,
      customerId: customer.id,
      status: 'ACTIVE',
    },
  });

  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      membershipId: null,
      roleId: customerRoleId,
      scopeType: 'ORGANIZATION',
      scopeId: organizationId,
    },
  });

  return {
    userId: user.id,
    email,
    password,
    organizationId,
    customerAccountId: account.id,
    customerId: customer.id,
  };
}

export interface CatalogFixture {
  catalogId: string;
  name: string;
  slug: string;
  organizationId: string;
}

export async function createCatalogFixture(
  prisma: PrismaService,
  options: { organizationId: string; name: string; slugPrefix?: string },
): Promise<CatalogFixture> {
  const slug = uniqueSlug(options.slugPrefix ?? 'qa-catalog');
  const catalog = await prisma.catalog.create({
    data: {
      organizationId: options.organizationId,
      name: options.name,
      slug,
      description: 'Catálogo efímero creado por los tests E2E.',
    },
  });
  return {
    catalogId: catalog.id,
    name: catalog.name,
    slug,
    organizationId: options.organizationId,
  };
}

/**
 * Borra en orden de FKs: sesiones → audit → cuentas de cliente → assignments →
 * membership → customer → user. No toca filas del seed.
 */
export async function deleteUserFixture(prisma: PrismaService, userId: string): Promise<void> {
  const sessions = await prisma.authSession.findMany({ where: { userId }, select: { id: true } });
  const sessionIds = sessions.map((session) => session.id);
  const accounts = await prisma.customerAccount.findMany({
    where: { userId },
    select: { customerId: true },
  });

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: userId },
        { entityId: userId },
        ...(sessionIds.length > 0 ? [{ entityId: { in: sessionIds } }] : []),
      ],
    },
  });
  await prisma.authSession.deleteMany({ where: { userId } });
  await prisma.consent.deleteMany({ where: { userId } });
  await prisma.verificationToken.deleteMany({ where: { userId } });
  await prisma.customerAccount.deleteMany({ where: { userId } });
  await prisma.roleAssignment.deleteMany({ where: { userId } });
  await prisma.membership.deleteMany({ where: { userId } });
  if (accounts.length > 0) {
    await prisma.customer.deleteMany({
      where: { id: { in: accounts.map((account) => account.customerId) } },
    });
  }
  await prisma.user.deleteMany({ where: { id: userId } });
}

/**
 * Borra el catálogo efímero en orden de FKs. F1 agrega `ImportJob` (que apunta a
 * `CatalogVersion` y arrastra `ImportRowIssue`) y deja `Catalog.activeVersionId`
 * apuntando a una versión: hay que limpiar el puntero antes de borrarlas o
 * Postgres rechaza el DELETE. También se borra el `audit_log` generado para
 * estas entidades (no tiene FK, así que no cae por cascada).
 */
export async function deleteCatalogFixture(
  prisma: PrismaService,
  catalogId: string,
): Promise<void> {
  const versions = await prisma.catalogVersion.findMany({
    where: { catalogId },
    select: { id: true },
  });
  const jobs = await prisma.importJob.findMany({ where: { catalogId }, select: { id: true } });
  const auditedIds = [
    catalogId,
    ...versions.map((version) => version.id),
    ...jobs.map((job) => job.id),
  ];

  await prisma.auditLog.deleteMany({ where: { entityId: { in: auditedIds } } });
  await prisma.importJob.deleteMany({ where: { catalogId } });
  await prisma.catalog.updateMany({
    where: { id: catalogId },
    data: { activeVersionId: null },
  });
  await prisma.product.deleteMany({ where: { catalogId } });
  await prisma.catalogVersion.deleteMany({ where: { catalogId } });
  await prisma.catalog.deleteMany({ where: { id: catalogId } });
}

/** Elimina las sesiones y auditoría que los tests generaron para un usuario del seed. */
export async function deleteSeedActivitySince(
  prisma: PrismaService,
  userId: string,
  since: Date,
): Promise<void> {
  const sessions = await prisma.authSession.findMany({
    where: { userId, createdAt: { gte: since } },
    select: { id: true },
  });
  const sessionIds = sessions.map((session) => session.id);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: userId, createdAt: { gte: since } },
        ...(sessionIds.length > 0 ? [{ entityId: { in: sessionIds } }] : []),
      ],
    },
  });
  await prisma.authSession.deleteMany({ where: { id: { in: sessionIds } } });
}

export interface CookieHeaderSource {
  headers: Record<string, unknown>;
}

export function setCookieHeaders(source: CookieHeaderSource): string[] {
  const header = source.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? (header as string[]) : [String(header)];
}

export function cookieValue(source: CookieHeaderSource, name: string): string | undefined {
  for (const cookie of setCookieHeaders(source)) {
    const pair = cookie.split(';')[0];
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === name) return pair.slice(separator + 1);
  }
  return undefined;
}

export function cookiePair(source: CookieHeaderSource, name: string): string | undefined {
  const value = cookieValue(source, name);
  return value === undefined ? undefined : `${name}=${value}`;
}
