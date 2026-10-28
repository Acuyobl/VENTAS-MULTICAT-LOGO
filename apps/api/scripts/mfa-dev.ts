/**
 * Utilidad SOLO para desarrollo y demos: gestiona el MFA TOTP de usuarios sembrados.
 *
 * Uso (desde la raíz del repo):
 *   pnpm --filter @ventascatalogo/api mfa:dev reset admin@ventascatalogo.local
 *   pnpm --filter @ventascatalogo/api mfa:dev code  admin@ventascatalogo.local
 *
 * - `reset` desactiva MFA y borra el secreto: el siguiente login muestra el QR de enrolamiento.
 * - `code`  imprime el código TOTP vigente del usuario (para demos guiadas o pruebas).
 *
 * Nunca se ejecuta en producción: no está cableado en la app, solo en scripts de desarrollo.
 */
import { PrismaClient } from '@prisma/client';
import { authenticator } from 'otplib';
import { decryptSecret } from '../src/common/utils/crypto';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const [command, emailArg] = process.argv.slice(2);
  if (!command || !emailArg) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const email = emailArg.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No existe el usuario ${email}.`);
    process.exitCode = 1;
    return;
  }

  if (command === 'reset') {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });
    console.log(`MFA reiniciado para ${email}: el próximo login pide enrolamiento (QR).`);
    return;
  }

  if (command === 'code') {
    if (!user.mfaEnabled || !user.mfaSecretEnc) {
      console.error(`${email} no tiene MFA enrolado; no hay código que mostrar.`);
      process.exitCode = 1;
      return;
    }
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      console.error('Falta ENCRYPTION_KEY en el .env.');
      process.exitCode = 1;
      return;
    }
    console.log(authenticator.generate(decryptSecret(user.mfaSecretEnc, key)));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function printUsage(): void {
  console.error('Uso: tsx scripts/mfa-dev.ts <reset|code> <email>');
}

void main().finally(() => prisma.$disconnect());
