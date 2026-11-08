/**
 * Zod checks once whether it may compile parsers with `Function('')`. The
 * Content-Security-Policy has no 'unsafe-eval', so in the browser that check
 * is refused and reported as a violation; skip it there. The server keeps the
 * compiled parsers. Imported first in `src/router.tsx`, before any schema is
 * built (Zod decides when a schema is created).
 */
import { z } from 'zod';

if (typeof window !== 'undefined') z.config({ jitless: true });
