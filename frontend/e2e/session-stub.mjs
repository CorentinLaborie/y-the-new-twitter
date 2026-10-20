// Stub of the session check of the account API, for the e2e tests of the protected area.
// The protected pages check the session on the server (app/(app)/session-guard.ts), so Playwright's page.route cannot
// answer that call. This stub answers it on the API port. Only the cookie SESSION=e2e-feed gets a user; every other
// call is a guest. A backend already running on the port is reused instead (playwright.config.ts), and then the
// protected-page tests need that backend to know the e2e session.
import { createServer } from 'node:http';

const SIGNED_IN_COOKIE = /(?:^|;\s*)SESSION=e2e-feed(?:;|$)/;

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/v1/auth/session') {
    const signedIn = SIGNED_IN_COOKIE.test(request.headers.cookie ?? '');
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ user: signedIn ? { handle: 'alice', displayName: 'Alice Martin' } : null }),
    );
    return;
  }
  response.writeHead(404, { 'content-type': 'application/problem+json' });
  response.end(JSON.stringify({ type: 'about:blank', title: 'Introuvable', status: 404 }));
});

server.listen(8080);
