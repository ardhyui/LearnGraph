import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  redirect,
  Scripts,
  useRouterState,
} from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ThemeProvider, NO_FLASH_SCRIPT } from '@/lib/theme';
import { DBProvider } from '@/lib/DBContext';
import { ErrorPage, NotFoundPage } from '@/components/ErrorPages';
import { getCurrentUser } from '@/server/session.functions';
import appCss from '../styles.css?url';

export type SessionUser = { id: string; email: string | null; name: string | null };
export interface RouterContext {
  user: SessionUser | null;
}

/** Routes reachable without an account. */
const PUBLIC_PATHS = new Set(['/sign-in']);

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ location }) => {
    const user = await getCurrentUser();
    if (!user && !PUBLIC_PATHS.has(location.pathname)) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } });
    }
    return { user };
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'LearnGraph - Adaptive Education' },
      {
        name: 'description',
        content: 'Graph-Based Adaptive Education System with Psychometric Profiling',
      },
      { name: 'theme-color', content: '#8b5cf6' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'apple-mobile-web-app-title', content: 'LearnGraph' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.svg' },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ErrorPage,
  notFoundComponent: NotFoundPage,
  component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider>{children}</ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (!user || PUBLIC_PATHS.has(pathname)) return <Outlet />;
  // Keyed by user so switching accounts never shows the previous account's data.
  return (
    <DBProvider key={user.id} seedDemoData={true}>
      <Outlet />
    </DBProvider>
  );
}
