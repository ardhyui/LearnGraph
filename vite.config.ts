import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';

/**
 * Finish the database bootstrap (PGlite open + migrations) while the dev server
 * starts, before the first request. Production: `src/lib/db.ts` kicks
 * `ensureDbReady` on import.
 */
function dbBootstrapPlugin(): Plugin {
  return {
    name: 'learngraph:db-bootstrap',
    apply: 'serve',
    async configureServer(server) {
      const mod = (await server.ssrLoadModule('/src/lib/db.ts')) as {
        ensureDbReady?: () => Promise<void>;
      };
      await mod.ensureDbReady?.();
    },
  };
}

export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    dbBootstrapPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === 'build' || isPreview
      ? [
          nitro({
            preset: process.env.NITRO_PRESET ?? 'vercel',
            // PGlite loads its .wasm/.data files from its package dir at runtime,
            // so ship the whole package instead of bundling it.
            traceDeps: ['@electric-sql/pglite*'],
          }),
        ]
      : []),
    viteReact(),
  ],
}));
