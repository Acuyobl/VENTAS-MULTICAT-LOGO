import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { hash } from 'argon2';
import { Client as MinioClient } from 'minio';
import { productImageKey } from '../src/modules/storage/image-utils';

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
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

const prisma = new PrismaClient();

const PERMISSIONS = [
  ['catalog:read', 'organization', 'Ver catálogos'],
  ['catalog:write', 'organization', 'Importar y activar catálogos'],
  ['product:read', 'organization', 'Ver productos'],
  ['product:write', 'organization', 'Subir y quitar imágenes de producto'],
  ['customer:read', 'organization', 'Ver clientes'],
  ['customer:create', 'organization', 'Crear clientes'],
  ['quote:read', 'organization', 'Ver cotizaciones'],
  ['quote:create', 'organization', 'Crear cotizaciones'],
  ['quote:send', 'organization', 'Enviar cotizaciones y generar su PDF'],
  ['quote:convert', 'organization', 'Convertir cotizaciones en pedidos'],
  ['order:read', 'organization', 'Ver pedidos y cotizaciones'],
  ['order:create', 'organization', 'Crear pedidos y cotizaciones'],
  ['order:cancel', 'organization', 'Cancelar y cumplir pedidos'],
  ['payment:read', 'organization', 'Ver pagos'],
  ['payment:write', 'organization', 'Registrar y conciliar pagos'],
  ['payment:refund_request', 'organization', 'Solicitar reembolsos'],
  ['payment:refund_approve', 'organization', 'Aprobar o rechazar reembolsos'],
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
      'product:write',
      'customer:read',
      'customer:create',
      'quote:read',
      'quote:create',
      'quote:send',
      'quote:convert',
      'order:read',
      'order:create',
      'order:cancel',
      'payment:read',
      'payment:write',
      'payment:refund_request',
      'payment:refund_approve',
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
    permissions: [
      'catalog:read',
      'catalog:write',
      'product:read',
      'product:write',
      'customer:read',
      'customer:create',
      'quote:read',
      'quote:create',
      'quote:send',
      'quote:convert',
      'order:read',
      'order:create',
      'order:cancel',
      'payment:read',
      'payment:refund_request',
      'payment:refund_approve',
    ],
  },
  {
    key: 'vendedor',
    name: 'Vendedor',
    permissions: [
      'catalog:read',
      'product:read',
      'customer:read',
      'customer:create',
      'quote:read',
      'quote:create',
      'quote:send',
      'quote:convert',
      'order:read',
      'order:create',
      'chat:write',
    ],
  },
  {
    key: 'finanzas',
    name: 'Finanzas',
    permissions: [
      'customer:read',
      'quote:read',
      'order:read',
      'payment:read',
      'payment:write',
      'payment:refund_request',
      'expense:write',
      'finance:read',
    ],
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

/**
 * Cliente de ventas para la demo/backoffice. Idempotente por
 * `organización + email`; si ya existe se completan tipo, teléfono y cédula.
 */
async function ensureSalesCustomer(
  organizationId: string,
  input: { name: string; email: string; phone: string; taxId: string; type: 'PERSON' | 'COMPANY' },
) {
  const existing = await prisma.customer.findFirst({
    where: { organizationId, email: input.email },
  });
  if (existing) {
    return prisma.customer.update({
      where: { id: existing.id },
      data: { name: input.name, phone: input.phone, taxId: input.taxId, type: input.type },
    });
  }
  return prisma.customer.create({
    data: {
      organizationId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      taxId: input.taxId,
      type: input.type,
    },
  });
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

const DEMO_IMAGE_COLORS = [
  '#0f766e',
  '#b45309',
  '#7c3aed',
  '#be123c',
  '#0369a1',
  '#4d7c0f',
  '#a16207',
  '#9d174d',
  '#1d4ed8',
  '#065f46',
  '#7f1d1d',
  '#5b21b6',
] as const;

function demoSvg(name: string, sku: string, color: string): string {
  const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="${safeName}">
  <rect width="640" height="480" fill="${color}"/>
  <circle cx="540" cy="80" r="130" fill="#ffffff" fill-opacity="0.12"/>
  <circle cx="90" cy="430" r="90" fill="#ffffff" fill-opacity="0.08"/>
  <text x="40" y="230" font-family="Georgia, 'Times New Roman', serif" font-size="42" fill="#ffffff">${safeName}</text>
  <text x="40" y="292" font-family="ui-monospace, monospace" font-size="28" fill="#ffffff" fill-opacity="0.85">${sku}</text>
  <text x="40" y="430" font-family="ui-sans-serif, sans-serif" font-size="18" fill="#ffffff" fill-opacity="0.65">VentasCatálogo · imagen demo</text>
</svg>`;
}

/** Color estable por SKU: el mismo producto siempre recibe el mismo SVG. */
function demoColorForSku(sku: string): string {
  let hash = 0;
  for (const char of sku) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return DEMO_IMAGE_COLORS[hash % DEMO_IMAGE_COLORS.length]!;
}

/**
 * Sube un SVG demo por producto (color y texto propios, determinísticos por SKU)
 * al bucket privado `vc-products` y lo asigna como `imageKey`. Cubre la versión
 * demo y la versión activa del catálogo (si el staff activó una importación, sus
 * productos también quedan con imagen para poder probar la UI). Es best-effort:
 * si MinIO no está disponible el seed termina igual y deja un aviso.
 */
async function seedDemoProductImages(
  prisma: PrismaClient,
  input: { catalogId: string; versionIds: string[] },
): Promise<void> {
  const bucket = process.env.MINIO_BUCKET_PRODUCTS ?? 'vc-products';
  try {
    const client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
      port: Number(process.env.MINIO_PORT ?? 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin',
    });
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket);

    const products = await prisma.product.findMany({
      where: { catalogId: input.catalogId, catalogVersionId: { in: input.versionIds } },
      orderBy: [{ catalogVersionId: 'asc' }, { sku: 'asc' }],
      select: { id: true, sku: true, name: true, catalogVersionId: true },
    });

    for (const product of products) {
      const svg = demoSvg(product.name, product.sku, demoColorForSku(product.sku));
      const body = Buffer.from(svg, 'utf8');
      const checksum = createHash('sha256').update(body).digest('hex');
      const key = productImageKey({
        catalogId: input.catalogId,
        catalogVersionId: product.catalogVersionId,
        productId: product.id,
        checksum,
        ext: 'svg',
      });
      await client.putObject(bucket, key, body, body.length, {
        'Content-Type': 'image/svg+xml',
      });
      await prisma.product.update({ where: { id: product.id }, data: { imageKey: key } });
    }

    // Limpia objetos huérfanos de versiones demo anteriores del mismo catálogo
    // (seed idempotente: la clave cambia si cambia el SVG del producto).
    const referenced = new Set(
      (
        await prisma.product.findMany({
          where: { catalogId: input.catalogId, imageKey: { not: null } },
          select: { imageKey: true },
        })
      ).map((product) => product.imageKey),
    );
    const prefix = `products/${input.catalogId}/`;
    for await (const object of client.listObjectsV2(bucket, prefix, true)) {
      if (object.name && !referenced.has(object.name)) {
        await client.removeObject(bucket, object.name);
      }
    }

    console.log(`  Imágenes: ${products.length} SVG demo en ${bucket}`);
  } catch (error) {
    console.warn(
      `  Aviso: no se pudieron subir las imágenes demo (${error instanceof Error ? error.message : 'MinIO no disponible'}).`,
    );
  }
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

  // Usuarios demo para probar reembolsos con segregación de funciones: quien
  // solicita (finanzas) no puede aprobar; el aprobador es catalog_admin (no
  // dispara MFA obligatorio en el login de demo).
  const demoRequester = await ensureUser(
    'finanzas.demo@ventascatalogo.local',
    'Finanzas Demo',
    process.env.SEED_STAFF_PASSWORD ?? 'Demo1234!',
  );
  const requesterMembership = await ensureMembership(orgA.id, demoRequester.id);
  await ensureAssignment(
    demoRequester.id,
    roles.get('finanzas')!.id,
    orgA.id,
    requesterMembership.id,
  );

  const demoApprover = await ensureUser(
    'aprobador.demo@ventascatalogo.local',
    'Aprobador Demo',
    process.env.SEED_STAFF_PASSWORD ?? 'Demo1234!',
  );
  const approverMembership = await ensureMembership(orgA.id, demoApprover.id);
  await ensureAssignment(
    demoApprover.id,
    roles.get('catalog_admin')!.id,
    orgA.id,
    approverMembership.id,
  );

  const customerAsCustomer = await ensureCustomer(orgA.id, customer.email, customer.fullName);
  await ensureCustomerAccount(customer.id, orgA.id, customerAsCustomer.id);
  await ensureAssignment(customer.id, roles.get('customer')!.id, orgA.id, null);

  // Clientes demo para probar cotizaciones/pedidos desde el backoffice.
  await ensureSalesCustomer(orgA.id, {
    name: customer.fullName,
    email: customer.email,
    phone: '+506 8888-0000',
    taxId: '1-0000-0000',
    type: 'PERSON',
  });
  await ensureSalesCustomer(orgA.id, {
    name: 'María Solís Vega',
    email: 'maria.solis@ventascatalogo.local',
    phone: '+506 8888-1111',
    taxId: '1-1111-1111',
    type: 'PERSON',
  });
  await ensureSalesCustomer(orgA.id, {
    name: 'Empresa Demo S.A.',
    email: 'compras@ventascatalogo.local',
    phone: '+506 2222-3333',
    taxId: '3-101-999999',
    type: 'COMPANY',
  });

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

  const catalogForImages = await prisma.catalog.findUniqueOrThrow({
    where: { id: catalog.id },
    select: { activeVersionId: true },
  });
  const imageVersionIds = [
    ...new Set(
      [version.id, catalogForImages.activeVersionId].filter((id): id is string => Boolean(id)),
    ),
  ];
  await seedDemoProductImages(prisma, { catalogId: catalog.id, versionIds: imageVersionIds });

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
  console.log(
    '  Staff:    admin@ventascatalogo.local / Demo1234! (MFA obligatorio en el primer login)',
  );
  console.log('  Cliente:  cliente@ventascatalogo.local / Demo1234!');
  console.log(
    '  Mixto:    mixto@ventascatalogo.local / Demo1234! (staff en Demo, cliente en Aliada)',
  );
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
