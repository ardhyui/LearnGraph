import { useRouterState } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { navigationAnnouncement } from '@/lib/page-titles';

/**
 * Tells screen-reader users which page they are on after an in-app
 * navigation. A full page load announces the document title by itself, but
 * client-side navigation only swaps the content, so nothing is read out.
 * The first render (SSR / hydration) announces nothing; focus is untouched,
 * so the menu drawer and in-page focus handling keep working as before.
 */
export function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const status = useRouterState({ select: (s) => s.status });
  const [message, setMessage] = useState('');
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'idle') return;
    if (announced.current === null) {
      announced.current = pathname; // initial page: the browser reads the title itself
      return;
    }
    if (announced.current === pathname) return;
    announced.current = pathname;
    setMessage(navigationAnnouncement(pathname));
  }, [pathname, status]);

  return (
    <p id="route-announcer" role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
