import { cache } from 'react';
import { apiFetch } from './api';
import type { AuthUser } from './types';

export const getSession = cache(async (): Promise<AuthUser | null> => {
  try {
    return await apiFetch<AuthUser>('/auth/me');
  } catch {
    return null;
  }
});
