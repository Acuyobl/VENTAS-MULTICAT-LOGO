import { describe, expect, it } from 'vitest';
import { guestCustomerLookup, normalizeGuestEmail, normalizeGuestPhone } from './guest-customer';

describe('normalización del cliente invitado', () => {
  it('normaliza el email a minúsculas y sin espacios', () => {
    expect(normalizeGuestEmail('  Maria.Solis@VentasCatalogo.local ')).toBe(
      'maria.solis@ventascatalogo.local',
    );
    expect(normalizeGuestEmail('')).toBeNull();
    expect(normalizeGuestEmail(null)).toBeNull();
    expect(normalizeGuestEmail('   ')).toBeNull();
  });

  it('normaliza el teléfono colapsando espacios', () => {
    expect(normalizeGuestPhone('  +506   8888-1111 ')).toBe('+506 8888-1111');
    expect(normalizeGuestPhone('')).toBeNull();
    expect(normalizeGuestPhone(undefined)).toBeNull();
  });

  it('el email manda sobre el teléfono en la búsqueda del cliente', () => {
    expect(
      guestCustomerLookup({
        fullName: 'María Solís',
        email: ' Maria@Example.com ',
        phone: '+506 8888-1111',
      }),
    ).toEqual({ by: 'email', value: 'maria@example.com' });
  });

  it('si no hay email usa el teléfono', () => {
    expect(guestCustomerLookup({ fullName: 'María', phone: '+506 8888-1111' })).toEqual({
      by: 'phone',
      value: '+506 8888-1111',
    });
  });

  it('sin email ni teléfono no hay cliente reutilizable', () => {
    expect(guestCustomerLookup({ fullName: 'Invitado sin contacto' })).toBeNull();
    expect(guestCustomerLookup({ fullName: 'Invitado', email: '', phone: '  ' })).toBeNull();
  });
});
