import { z } from 'zod';

export const audienceSchema = z.enum(['staff', 'customer']);
export type Audience = z.infer<typeof audienceSchema>;

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Debe incluir al menos una mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una minúscula')
  .regex(/\d/, 'Debe incluir al menos un número');

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  audience: audienceSchema.default('staff'),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
  deviceName: z.string().max(120).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const mfaChallengeSchema = z.object({
  mfaToken: z.string().min(10),
});

export const refreshSchema = z.object({
  audience: audienceSchema.optional(),
});

export const invitationTokenSchema = z.object({
  token: z.string().min(20),
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
});

export const magicLinkRequestSchema = z.object({
  email: z.string().email(),
});

export const magicLinkConsumeSchema = z.object({
  token: z.string().min(20),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
  audience: audienceSchema.default('staff'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: passwordSchema,
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(20),
  fullName: z.string().min(2).max(120),
  password: passwordSchema,
});

export const invitationCreateSchema = z.object({
  email: z.string().email(),
  roleKey: z.string().min(2),
  scopeType: z.enum(['ORGANIZATION', 'CATALOG']).default('ORGANIZATION'),
  scopeId: z.string().uuid().optional(),
});

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  audience: Audience;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  roleKeys: string[];
  permissions: string[];
  mfaEnabled: boolean;
  mfaEnrollmentRequired: boolean;
}

export type AuthenticatedUser = AuthUser;

export interface LoginResponse {
  status: 'authenticated' | 'mfa_required' | 'mfa_enrollment_required';
  user?: AuthUser;
  mfaToken?: string;
  accessTokenExpiresAt?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}
