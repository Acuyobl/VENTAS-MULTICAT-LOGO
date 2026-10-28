'use client';

import { useState, type ReactNode } from 'react';
import type { Audience } from '@/lib/types';

interface LogoutButtonProps {
  audience: Audience;
  redirectTo: string;
  className?: string;
  children?: ReactNode;
}

export function LogoutButton({
  audience,
  redirectTo,
  className = 'btn btn--small btn--secondary',
  children = 'Salir',
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ audience }),
      });
    } finally {
      window.location.assign(redirectTo);
    }
  }

  return (
    <button className={className} type="button" onClick={logout} disabled={loading}>
      {loading ? 'Saliendo…' : children}
    </button>
  );
}
