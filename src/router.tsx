// First: configures Zod before any route module builds a schema.
import './lib/zod-config';
import { createRouter } from '@tanstack/react-router';
import { getGlobalStartContext } from '@tanstack/react-start';
import { routeTree } from './routeTree.gen';
import { ErrorPage, NotFoundPage } from './components/ErrorPages';

/**
 * This response's CSP nonce (set by the request middleware in `src/start.ts`).
 * On the server the router puts it on every script it renders; in the browser
 * TanStack reads it back from the page, so this returns undefined there.
 */
function cspNonce(): string | undefined {
  try {
    return (getGlobalStartContext() as { cspNonce?: string } | undefined)?.cspNonce;
  } catch {
    return undefined;
  }
}

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: { user: null },
    defaultNotFoundComponent: NotFoundPage,
    defaultErrorComponent: ErrorPage,
    ssr: { nonce: cspNonce() },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
