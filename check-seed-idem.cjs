const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const demo = await p.organization.findUnique({ where: { slug: 'demo' } });
  const count = await p.user.count({ where: { email: { in: ['finanzas.demo@ventascatalogo.local', 'aprobador.demo@ventascatalogo.local'] } } });
  const perms = await p.permission.count({ where: { key: { in: ['payment:refund_request', 'payment:refund_approve'] } } });
  console.log(JSON.stringify({ demoRefundUsers: count, refundPermissions: perms, demoOrgId: demo.id }));
  await p.$disconnect();
})().catch(async (e) => { console.error(e.message); await p.$disconnect(); process.exitCode = 1; });
