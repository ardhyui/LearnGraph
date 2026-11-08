/**
 * "Skip to content" (WCAG 2.4.1): the first thing keyboard users reach on
 * every page; it moves focus past the menu to the page's `<main>`. Hidden
 * until focused.
 */
import type { MouseEvent } from 'react';

function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
  const main = document.querySelector('main');
  if (!main) return;
  e.preventDefault();
  if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  main.focus();
  main.scrollIntoView({ block: 'start' });
}

export function SkipLink() {
  return (
    <a
      href="#main"
      onClick={skipToMain}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      Skip to content
    </a>
  );
}
