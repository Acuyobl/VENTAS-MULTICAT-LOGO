import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { DevAuthService } from './dev-auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

/** DTO local: `packages/contracts` es de F1 y no se toca en esta tarea. */
const devTotpSchema = z.object({ mfaToken: z.string().min(10) });

/**
 * Endpoint de desarrollo para autocompletar el TOTP del login staff.
 *
 * Solo existe si `DEV_AUTH_HELPERS=true`; con el flag apagado responde `404
 * NOT_FOUND` desde el handler (no desde el módulo) para no revelar la ruta.
 */
@Controller('auth/dev')
@Public()
export class DevAuthController {
  constructor(private readonly devAuth: DevAuthService) {}

  @Post('totp')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  totp(@Body(new ZodValidationPipe(devTotpSchema)) body: { mfaToken: string }) {
    return this.devAuth.generateTotp(body.mfaToken);
  }
}
