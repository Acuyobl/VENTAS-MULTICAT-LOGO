import { NextResponse, type NextRequest } from 'next/server';
import { resolveFace } from './lib/faces';

const STAFF_COOKIE = 'vc_staff_at';
const CUSTOMER_COOKIE = 'vc_customer_at';

export function middleware(request: NextRequest): NextResponse {
  const host = request.headers.get('host') ?? '';
  const { rewriteTo, requiresStaff, requiresCustomer } = resolveFace(
    host,
    request.nextUrl.pathname,
  );

  if (requiresStaff && !request.cookies.get(STAFF_COOKIE)) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (requiresCustomer && !request.cookies.get(CUSTOMER_COOKIE)) {
    const loginUrl = new URL('/mi-cuenta/entrar', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (rewriteTo) {
    const url = request.nextUrl.clone();
    url.pathname = rewriteTo;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|icons|fonts|sw.js|manifest.webmanifest).*)',
  ],
};
