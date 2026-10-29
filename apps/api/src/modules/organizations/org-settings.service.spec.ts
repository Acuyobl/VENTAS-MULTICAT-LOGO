import { describe, expect, it } from 'vitest';
import {
  appThemeKeySchema,
  orgSettingsSchema,
  orgSettingsUpdateSchema,
} from '@ventascatalogo/contracts';
import { normalizeAppTheme } from './org-settings.service';

describe('normalizeAppTheme', () => {
  it('acepta los 3 temas y cae a CLASICO con valores desconocidos', () => {
    expect(normalizeAppTheme('CLASICO')).toBe('CLASICO');
    expect(normalizeAppTheme('MODERNO')).toBe('MODERNO');
    expect(normalizeAppTheme('COMPACTO')).toBe('COMPACTO');
    expect(normalizeAppTheme('NEON')).toBe('CLASICO');
    expect(normalizeAppTheme(null)).toBe('CLASICO');
    expect(normalizeAppTheme(undefined)).toBe('CLASICO');
  });
});

describe('contratos de tema', () => {
  it('appThemeKeySchema valida el enum', () => {
    expect(appThemeKeySchema.safeParse('MODERNO').success).toBe(true);
    expect(appThemeKeySchema.safeParse('NEON').success).toBe(false);
  });

  it('orgSettingsUpdateSchema acepta appTheme solo o combinado', () => {
    expect(orgSettingsUpdateSchema.safeParse({ appTheme: 'COMPACTO' }).success).toBe(true);
    expect(
      orgSettingsUpdateSchema.safeParse({
        allowSelfApproval: true,
        imageDesign: 'PROMO',
        appTheme: 'MODERNO',
      }).success,
    ).toBe(true);
    expect(orgSettingsUpdateSchema.safeParse({ appTheme: 'NEON' }).success).toBe(false);
    expect(orgSettingsUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('orgSettingsSchema exige appTheme en la respuesta', () => {
    expect(
      orgSettingsSchema.safeParse({
        allowSelfApproval: false,
        imageDesign: 'CLASICA',
        appTheme: 'CLASICO',
      }).success,
    ).toBe(true);
    expect(
      orgSettingsSchema.safeParse({ allowSelfApproval: false, imageDesign: 'CLASICA' }).success,
    ).toBe(false);
  });
});
