import { describe, expect, it } from 'vitest';
import { resolveFace } from './faces';

describe('resolveFace', () => {
  it('manda la raíz de app.localhost al panel', () => {
    expect(resolveFace('app.localhost:3000', '/')).toMatchObject({
      face: 'staff',
      rewriteTo: '/panel',
    });
  });

  it('no reescribe el login del backoffice', () => {
    expect(resolveFace('app.localhost:3000', '/login')).toMatchObject({
      face: 'staff',
      rewriteTo: null,
      requiresStaff: false,
    });
  });

  it('protege /panel en cualquier host', () => {
    expect(resolveFace('localhost:3000', '/panel')).toMatchObject({
      requiresStaff: true,
    });
    expect(resolveFace('app.localhost:3000', '/panel/usuarios')).toMatchObject({
      requiresStaff: true,
    });
    expect(resolveFace('tienda.localhost:3000', '/panel')).toMatchObject({
      requiresStaff: true,
    });
  });

  it('mantiene el atajo del backoffice en el host app', () => {
    expect(resolveFace('app.localhost:3000', '/usuarios')).toMatchObject({
      face: 'staff',
      rewriteTo: '/panel/usuarios',
      requiresStaff: true,
    });
  });

  it('protege /mi-cuenta pero deja entrar a /mi-cuenta/entrar', () => {
    expect(resolveFace('tienda.localhost:3000', '/mi-cuenta')).toMatchObject({
      requiresCustomer: true,
    });
    expect(resolveFace('tienda.localhost:3000', '/mi-cuenta/entrar')).toMatchObject({
      requiresCustomer: false,
    });
  });

  it('deja público el catálogo compartido en el host de tienda', () => {
    expect(resolveFace('tienda.localhost:3000', '/c/catalogo-demo')).toMatchObject({
      requiresCustomer: false,
      rewriteTo: null,
    });
  });

  it('permite previsualizar el catálogo público desde el host del backoffice', () => {
    expect(resolveFace('app.localhost:3010', '/c/catalogo-demo')).toMatchObject({
      face: 'store',
      rewriteTo: null,
      requiresStaff: false,
      requiresCustomer: false,
    });
    expect(resolveFace('app.localhost:3010', '/tienda')).toMatchObject({
      face: 'store',
      rewriteTo: null,
      requiresStaff: false,
    });
    expect(resolveFace('app.localhost:3010', '/mi-cuenta')).toMatchObject({
      rewriteTo: null,
      requiresCustomer: true,
      requiresStaff: false,
    });
  });

  it('nunca intercepta la API', () => {
    expect(resolveFace('app.localhost:3000', '/api/v1/auth/me')).toMatchObject({
      face: 'hub',
      rewriteTo: null,
    });
  });
});
