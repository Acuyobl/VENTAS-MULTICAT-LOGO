import { cache } from 'react';
import type { PublicAppSettings } from '@ventascatalogo/contracts';
import { apiFetch } from './api';

const FALLBACK: PublicAppSettings = {
  appTheme: 'CLASICO',
  organizationName: 'VentasCatálogo',
  organizationSlug: 'demo',
};

/** Lee el tema público de la organización. Cacheado por request y con fallback seguro. */
export const getPublicAppSettings = cache(async (): Promise<PublicAppSettings> => {
  try {
    return await apiFetch<PublicAppSettings>('/public/app-settings', { authenticated: false });
  } catch {
    return FALLBACK;
  }
});
