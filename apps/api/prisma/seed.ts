import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';

/**
 * El seed es idempotente: se puede ejecutar varias veces sin duplicar
 * organizaciones, usuarios, roles, catálogos ni productos.
 *
 * `pnpm db:seed` carga el `.env` de la raíz con dotenv-cli; si existe
 * `.env.seed`, sus valores pisan los defaults de demostración sin requerir
 * que los secretos vivan en el `.env` principal.
 */
const seedEnvPath = resolve(__dirname, '../../../.env.seed');
if (existsSync(seedEnvPath)) {
  for (const line of readFileSync(seedEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

const prisma = new PrismaClient();

const PERMISSIONS = [
  ['catalog:read', 'organization', 'Ver catálogos'],
  ['catalog:write', 'organization', 'Importar y activar catálogos'],
  ['product:read', 'organization', 'Ver productos'],
  ['order:read', 'organization', 'Ver pedidos y cotizaciones'],
  ['order:create', 'organization', 'Crear pedidos y cotizaciones'],
  ['payment:read', 'organization', 'Ver pagos'],
  ['payment:write', 'organization', 'Registrar y conciliar pagos'],
  ['expense:write', 'organization', 'Registrar gastos'],
  ['finance:read', 'organization', 'Ver reportes financieros'],
  ['social:generate', 'organization', 'Generar contenido con IA'],
  ['social:approve', 'organization', 'Aprobar contenido'],
  ['chat:write', 'organization', 'Atender conversaciones'],
  ['user:manage', 'organization', 'Invitar y administrar usuarios'],
  ['settings:manage', 'organization', 'Configurar integraciones'],
  ['admin:manage', 'global', 'Administración global del SaaS'],
  ['self:order:read', 'self', 'Ver pedidos propios'],
  ['self:quote:read', 'self', 'Ver cotizaciones propias'],
  ['self:payment:read', 'self', 'Ver pagos propios'],
  ['self:profile:write', 'self', 'Editar perfil propio'],
  ['self:chat:write', 'self', 'Chatear como cliente'],
] as const;

const ROLES = [
  {
    key: 'superadmin',
    name: 'Superadmin',
    permissions: PERMISSIONS.map(([key]) => key),
  },
  {
    key: 'org_admin',
    name: 'Administrador de organización',
    permissions: [
      'catalog:read',
      'catalog:write',
      'product:read',
      'order:read',
      'order:create',
      'payment:read',
      'payment:write',
      'expense:write',
      'finance:read',
      'social:generate',
      'social:approve',
      'chat:write',
      'user:manage',
      'settings:manage',
    ],
  },
  {
    key: 'catalog_admin',
    name: 'Administrador de catálogo',
    permissions: ['catalog:read', 'catalog:write', 'product:read'],
  },
  {
    key: 'vendedor',
    name: 'Vendedor',
    permissions: ['catalog:read', 'product:read', 'order:read', 'order:create', 'chat:write'],
  },
  {
    key: 'finanzas',
    name: 'Finanzas',
    permissions: ['order:read', 'payment:read', 'payment:write', 'expense:write', 'finance:read'],
  },
  {
    key: 'social_manager',
    name: 'Social media manager',
    permissions: ['product:read', 'social:generate', 'social:approve'],
  },
  {
    key: 'agente_chat',
    name: 'Agente de chat',
    permissions: ['chat:write', 'order:read'],
  },
  {
    key: 'customer',
    name: 'Cliente',
    permissions: [
      'self:order:read',
      'self:quote:read',
      'self:payment:read',
      'self:profile:write',
      'self:chat:write',
    ],
  },
] as const;

async function ensureRole(key: string, name: string, permissionKeys: readonly string[]) {
  const existing = await prisma.role.findFirst({ where: { key, organizationId: null } });
  if (existing) {
    return prisma.role.update({
      where: { id: existing.id },
      data: {
        name,
        isSystem: true,
        permissions: {
          set: permissionKeys.map((permissionKey) => ({ key: permissionKey })),
        },
      },
    });
  }
  return prisma.role.create({
    data: {
      key,
      name,
      isSystem: true,
      permissions: {
        connect: permissionKeys.map((permissionKey) => ({ key: permissionKey })),
      },
    },
  });
}

async function ensureUser(email: string, fullName: string, passwordPlain: string) {
  const passwordHash = await hash(passwordPlain, { type: 2 });
  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      fullName,
      passwordHash,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    update: {
      passwordHash,
      fullName,
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      // El seed es una operación de desarrollo: devuelve los usuarios demo a un estado
      // conocido (sin MFA enrolado y sin bloqueos) para que el primer login muestre el QR.
      mfaEnabled: false,
      mfaSecretEnc: null,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
}

async function ensureMembership(organizationId: string, userId: string) {
  return prisma.membership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, status: 'ACTIVE', joinedAt: new Date() },
    update: { status: 'ACTIVE', joinedAt: new Date() },
  });
}

async function ensureAssignment(
  userId: string,
  roleId: string,
  organizationId: string,
  membershipId: string | null,
  scopeType: 'ORGANIZATION' | 'CATALOG' = 'ORGANIZATION',
  scopeId: string = organizationId,
) {
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, scopeType, scopeId },
  });
  if (existing) return existing;
  return prisma.roleAssignment.create({
    data: { userId, roleId, membershipId, scopeType, scopeId },
  });
}

async function ensureCustomer(organizationId: string, email: string, name: string) {
  const existing = await prisma.customer.findFirst({ where: { organizationId, email } });
  return existing ?? prisma.customer.create({ data: { organizationId, name, email } });
}

async function ensureCustomerAccount(userId: string, organizationId: string, customerId: string) {
  const existing = await prisma.customerAccount.findFirst({
    where: { userId, organizationId },
  });
  if (existing) {
    return prisma.customerAccount.update({
      where: { id: existing.id },
      data: { customerId, status: 'ACTIVE' },
    });
  }
  return prisma.customerAccount.create({
    data: { userId, organizationId, customerId, status: 'ACTIVE' },
  });
}

async function main(): Promise<void> {
  const orgA = await prisma.organization.upsert({
    where: { slug: 'demo' },
    create: { name: 'Organización Demo', slug: 'demo', plan: 'PRO' },
    update: { name: 'Organización Demo' },
  });
  const orgB = await prisma.organization.upsert({
    where: { slug: 'aliada' },
    create: { name: 'Organización Aliada', slug: 'aliada', plan: 'STARTER' },
    update: { name: 'Organización Aliada' },
  });

  for (const [key, scope, description] of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, scope, description },
      update: { scope, description },
    });
  }

  const roles = new Map<string, { id: string }>();
  for (const role of ROLES) {
    roles.set(role.key, await ensureRole(role.key, role.name, role.permissions));
  }

  const staff = await ensureUser(
    process.env.SEED_STAFF_EMAIL ?? 'admin@ventascatalogo.local',
    'Admin Demo',
    process.env.SEED_STAFF_PASSWORD ?? 'Demo1234!',
  );
  const customer = await ensureUser(
    process.env.SEED_CUSTOMER_EMAIL ?? 'cliente@ventascatalogo.local',
    'Cliente Demo',
    process.env.SEED_CUSTOMER_PASSWORD ?? 'Demo1234!',
  );
  const dual = await ensureUser(
    process.env.SEED_DUAL_EMAIL ?? 'mixto@ventascatalogo.local',
    'Usuario Mixto',
    process.env.SEED_DUAL_PASSWORD ?? 'Demo1234!',
  );

  const staffMembership = await ensureMembership(orgA.id, staff.id);
  await ensureAssignment(staff.id, roles.get('org_admin')!.id, orgA.id, staffMembership.id);

  const customerAsCustomer = await ensureCustomer(orgA.id, customer.email, customer.fullName);
  await ensureCustomerAccount(customer.id, orgA.id, customerAsCustomer.id);
  await ensureAssignment(customer.id, roles.get('customer')!.id, orgA.id, null);

  const dualMembership = await ensureMembership(orgA.id, dual.id);
  await ensureAssignment(dual.id, roles.get('vendedor')!.id, orgA.id, dualMembership.id);
  const dualAsCustomer = await ensureCustomer(orgB.id, dual.email, dual.fullName);
  await ensureCustomerAccount(dual.id, orgB.id, dualAsCustomer.id);
  await ensureAssignment(dual.id, roles.get('customer')!.id, orgB.id, null);

  const catalog = await prisma.catalog.upsert({
    where: { organizationId_slug: { organizationId: orgA.id, slug: 'catalogo-demo' } },
    create: {
      organizationId: orgA.id,
      name: 'Catálogo Demo',
      slug: 'catalogo-demo',
      description: 'Colección de prueba para recorrer la tienda y el backoffice.',
    },
    update: {
      name: 'Catálogo Demo',
      description: 'Colección de prueba para recorrer la tienda y el backoffice.',
    },
  });
  // El seed no debe pisar la versión activa de un catálogo que ya tiene datos reales:
  // solo activa la versión demo si el catálogo no tiene ninguna activa todavía.
  const currentCatalog = await prisma.catalog.findUniqueOrThrow({ where: { id: catalog.id } });
  const existingDemoVersion = await prisma.catalogVersion.findUnique({
    where: { catalogId_versionNumber: { catalogId: catalog.id, versionNumber: 1 } },
  });
  const demoShouldBeActive =
    currentCatalog.activeVersionId === null ||
    currentCatalog.activeVersionId === existingDemoVersion?.id;
  const demoStatus = demoShouldBeActive ? 'ACTIVE' : 'ARCHIVED';

  const version = await prisma.catalogVersion.upsert({
    where: { catalogId_versionNumber: { catalogId: catalog.id, versionNumber: 1 } },
    create: {
      catalogId: catalog.id,
      versionNumber: 1,
      status: demoStatus,
      createdByUserId: staff.id,
      currency: 'CRC',
      taxRateBp: 1300,
      taxIncluded: true,
      ...(demoShouldBeActive ? { activatedAt: new Date() } : {}),
      validatedAt: new Date(),
    },
    update: {
      status: demoStatus,
      ...(demoShouldBeActive ? { activatedAt: new Date() } : {}),
    },
  });

  const productNames = [
    'Café de altura',
    'Miel de abeja',
    'Chocolate artesanal',
    'Bolso de fibra natural',
    'Vela de cera de coco',
    'Jabón de arcilla',
    'Taza de barro',
    'Mermelada de mango',
    'Collar de semillas',
    'Cuaderno de fibras',
    'Salsa picante',
    'Canasta tejida',
  ];
  const categories = ['Despensa', 'Cuidado', 'Objetos'];

  for (let i = 1; i <= 12; i += 1) {
    await prisma.product.upsert({
      where: {
        catalogVersionId_sku: {
          catalogVersionId: version.id,
          sku: `DEMO-${String(i).padStart(3, '0')}`,
        },
      },
      create: {
        catalogId: catalog.id,
        catalogVersionId: version.id,
        sku: `DEMO-${String(i).padStart(3, '0')}`,
        name: productNames[i - 1] ?? `Producto demo ${i}`,
        description: 'Hecho a mano en Costa Rica, en lotes pequeños.',
        category: categories[(i - 1) % categories.length],
        priceMinor: BigInt(5_000 + i * 1_000),
        costMinor: BigInt(2_500 + i * 400),
        currency: 'CRC',
        stock: 10 + i,
        attributes: { origin: 'Costa Rica', handmade: true },
      },
      update: {
        name: productNames[i - 1] ?? `Producto demo ${i}`,
        category: categories[(i - 1) % categories.length],
        priceMinor: BigInt(5_000 + i * 1_000),
        stock: 10 + i,
      },
    });
  }

  await prisma.catalogVersion.update({
    where: { id: version.id },
    data: { productCount: 12 },
  });

  if (demoShouldBeActive) {
    // Si el catálogo no tenía versión activa (o la activa era la demo), la demo manda
    // y se archiva cualquier otra versión activa para mantener la invariante: una sola ACTIVE.
    await prisma.catalog.update({
      where: { id: catalog.id },
      data: { activeVersionId: version.id },
    });
    await prisma.catalogVersion.updateMany({
      where: { catalogId: catalog.id, status: 'ACTIVE', id: { not: version.id } },
      data: { status: 'ARCHIVED', archivedAt: new Date() },
    });
  }

  const memberInvitationSeed = process.env.SEED_INVITATION_EMAIL;
  if (memberInvitationSeed) {
    console.log(`Invitación de demostración pendiente para ${memberInvitationSeed}`);
  }

  console.log('Seed listo.');
  console.log('  Staff:    admin@ventascatalogo.local / Demo1234! (MFA obligatorio en el primer login)');
  console.log('  Cliente:  cliente@ventascatalogo.local / Demo1234!');
  console.log('  Mixto:    mixto@ventascatalogo.local / Demo1234! (staff en Demo, cliente en Aliada)');
  console.log('  Catálogo: /c/catalogo-demo · 12 productos');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
