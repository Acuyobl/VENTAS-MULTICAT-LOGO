import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { decryptSecret, encryptSecret } from '../../common/utils/crypto';
import { AppException } from '../../common/errors/app-exception';

@Injectable()
export class MfaService {
  constructor(private readonly config: ConfigService) {}

  generateEnrollment(email: string): { secret: string; otpauthUrl: string } {
    const secret = authenticator.generateSecret();
    const issuer = this.config.get<string>('MFA_ISSUER', 'VentasCatálogo');
    return {
      secret,
      otpauthUrl: authenticator.keyuri(email, issuer, secret),
    };
  }

  encrypt(secret: string): string {
    return encryptSecret(secret, this.config.getOrThrow<string>('ENCRYPTION_KEY'));
  }

  decrypt(payload: string): string {
    return decryptSecret(payload, this.config.getOrThrow<string>('ENCRYPTION_KEY'));
  }

  verify(code: string, encryptedSecret: string | null): boolean {
    if (!encryptedSecret) return false;
    try {
      return authenticator.verify({ token: code, secret: this.decrypt(encryptedSecret) });
    } catch {
      throw new AppException('AUTH_MFA_INVALID', 401);
    }
  }
}
