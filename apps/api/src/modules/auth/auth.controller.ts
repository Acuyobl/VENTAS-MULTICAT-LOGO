import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  forgotPasswordSchema,
  loginSchema,
  magicLinkConsumeSchema,
  magicLinkRequestSchema,
  mfaChallengeSchema,
  mfaVerifySchema,
  refreshSchema,
  resetPasswordSchema,
  type Audience,
  type AuthenticatedUser,
  type LoginInput,
} from '@ventascatalogo/contracts';
import { AuthService, type AuthMeta } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { PasswordResetService } from './password-reset.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { SkipPermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppException } from '../../common/errors/app-exception';
import { AUTH_COOKIES, clearAuthCookies, setAuthCookies, type CookieSettings } from './cookies';

type RequestWithTrace = Request & { traceId?: string };

function metaFrom(req: RequestWithTrace): AuthMeta {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    traceId: req.traceId ?? randomUUID(),
  };
}

@Controller('auth')
@SkipPermissions()
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly magicLink: MagicLinkService,
    private readonly passwordReset: PasswordResetService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
  ) {
    const result = await this.auth.login(body, metaFrom(req));
    if (result.tokens && result.audience) {
      setAuthCookies(res, result.audience, result.tokens, this.cookieSettings());
    }
    return result.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(refreshSchema)) body: { audience?: Audience },
  ) {
    const audience = this.detectAudience(req, body.audience);
    const raw = req.cookies?.[AUTH_COOKIES[audience].refresh];
    if (!raw) throw new AppException('UNAUTHORIZED', 401, { reason: 'refresh_cookie_missing' });
    const result = await this.auth.refresh(raw, audience, metaFrom(req));
    if (result.tokens && result.audience) {
      setAuthCookies(res, result.audience, result.tokens, this.cookieSettings());
    }
    return result.response;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(refreshSchema)) body: { audience?: Audience },
  ) {
    const settings = this.cookieSettings();
    const audiences: Audience[] = body.audience ? [body.audience] : ['staff', 'customer'];
    for (const audience of audiences) {
      const raw = req.cookies?.[AUTH_COOKIES[audience].refresh];
      await this.auth.logout(raw, audience);
      clearAuthCookies(res, audience, settings);
    }
    return { status: 'logged_out' };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/enroll')
  @HttpCode(200)
  enroll(@Body(new ZodValidationPipe(mfaChallengeSchema)) body: { mfaToken: string }) {
    return this.auth.startMfaEnrollment(body.mfaToken);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  @HttpCode(200)
  async verifyMfa(
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(mfaVerifySchema)) body: { mfaToken: string; code: string },
  ) {
    const result = await this.auth.verifyMfa(body.mfaToken, body.code, metaFrom(req));
    if (result.tokens && result.audience) {
      setAuthCookies(res, result.audience, result.tokens, this.cookieSettings());
    }
    return result.response;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('magic-link')
  @HttpCode(202)
  async requestMagicLink(
    @Body(new ZodValidationPipe(magicLinkRequestSchema)) body: { email: string },
  ) {
    await this.magicLink.request(body.email);
    return { status: 'accepted' };
  }

  @Public()
  @Post('magic-link/consume')
  @HttpCode(200)
  async consumeMagicLink(
    @Req() req: RequestWithTrace,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(magicLinkConsumeSchema)) body: { token: string },
  ) {
    const result = await this.magicLink.consume(body.token, metaFrom(req));
    setAuthCookies(res, 'customer', result.tokens, this.cookieSettings());
    return {
      status: 'authenticated',
      user: result.user,
      accessTokenExpiresAt: result.tokens.accessTokenExpiresAt,
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema))
    body: { email: string; audience: Audience },
  ) {
    await this.passwordReset.request(body.email, body.audience);
    return { status: 'accepted' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(
    @Req() req: RequestWithTrace,
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    return this.passwordReset.reset(body.token, body.password, metaFrom(req));
  }

  private detectAudience(req: RequestWithTrace, requested?: Audience): Audience {
    if (requested) return requested;
    if (req.cookies?.[AUTH_COOKIES.customer.refresh]) return 'customer';
    return 'staff';
  }

  private cookieSettings(): CookieSettings {
    return {
      cookieDomain: this.config.get<string>('AUTH_COOKIE_DOMAIN') || undefined,
      secure: this.config.get<string>('NODE_ENV') === 'production',
    };
  }
}
