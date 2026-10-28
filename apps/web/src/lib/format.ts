export function formatMoney(
  priceMinor: string | number | bigint,
  currency: 'CRC' | 'USD' = 'CRC',
): string {
  const minor = typeof priceMinor === 'string' ? Number(priceMinor) : Number(priceMinor);
  const amount = currency === 'USD' ? minor / 100 : minor;
  return new Intl.NumberFormat('es-CR', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(amount);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatRole(role: string): string {
  const labels: Record<string, string> = {
    superadmin: 'Superadmin',
    org_admin: 'Admin de org',
    catalog_admin: 'Admin de catálogo',
    vendedor: 'Vendedor',
    finanzas: 'Finanzas',
    social_manager: 'Social',
    agente_chat: 'Chat',
    customer: 'Cliente',
  };
  return labels[role] ?? role;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function taxLabel(taxRateBp: number, taxIncluded: boolean): string {
  const rate = (taxRateBp / 100).toLocaleString('es-CR', { maximumFractionDigits: 2 });
  return taxIncluded ? `IVA ${rate}% incluido` : `IVA ${rate}% aparte`;
}
