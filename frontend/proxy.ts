import { NextResponse, type NextRequest } from 'next/server';

/**
 * Passes the requested path to server code (the session check of the protected area reads it, so that a guest
 * is sent back to the page asked for). It decides nothing else: the session check stays in the layout.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  // Same name as REQUESTED_PATH_HEADER in lib/route-guard.ts (the proxy must not import app modules).
  headers.set('x-pathname', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
