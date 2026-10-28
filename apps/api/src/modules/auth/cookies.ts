import type { Response } from 'express';
import type { Audience } from '@ventascatalogo/contracts';
import type { IssuedTokens } from './session.service';

export const AUTH_COOKIES: Record<Audience, { access: string; refresh: string }> = {
  staff: { access: 'vc_staff_at', refresh: 'vc_staff_rt' },
  customer: { access: 'vc_customer_at', refresh: 'vc_customer_rt' },
};

export interface CookieSettings {
  cookieDomain?: string;
  secure: boolean;
}

function baseOptions(settings: CookieSettings, maxAge: number) {
  return {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
    ...(settings.cookieDomain ? { domain: settings.cookieDomain } : {}),
  };
}

export function setAuthCookies(
  res: Response,
  audience: Audience,
  tokens: IssuedTokens,
  settings: CookieSettings,
): void {
  const names = AUTH_COOKIES[audience];
  const now = Date.now();
  res.cookie(
    names.access,
    tokens.accessToken,
    baseOptions(settings, Math.max(1000, new Date(tokens.accessTokenExpiresAt).getTime() - now)),
  );
  res.cookie(
    names.refresh,
    tokens.refreshToken,
    baseOptions(
      settings,
      Math.max(1000, new Date(tokens.refreshTokenExpiresAt).getTime() - now),
    ),
  );
}

export function clearAuthCookies(
  res: Response,
  audience: Audience,
  settings: CookieSettings,
): void {
  const names = AUTH_COOKIES[audience];
  const options = {
    httpOnly: true,
    secure: settings.secure,
    sameSite: 'lax' as const,
    path: '/',
    ...(settings.cookieDomain ? { domain: settings.cookieDomain } : {}),
  };
  res.clearCookie(names.access, options);
  res.clearCookie(names.refresh, options);
}
