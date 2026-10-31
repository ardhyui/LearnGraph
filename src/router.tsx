import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    context: { user: null },
    defaultNotFoundComponent: () => (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Page not found.
      </div>
    ),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
