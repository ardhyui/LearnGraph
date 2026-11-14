/**
 * The React provider for LearnGraph data access.
 *
 * This module exports only the component (plus its props type) so
 * `react-refresh/only-export-components` stays happy. The hooks live in
 * `DBContext.tsx`, which remains the import path used by pages.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { seedDemoData as seedDemoDataFn } from '@/server/graph.functions';
import type { RemoteGraphDB } from '@/lib/graph/methods';
import { createRemoteGraphDB } from '@/lib/DBContext';
import { DBContext, type DBContextValue } from '@/lib/db-context';
import { forgetWorkspaceReady, isWorkspaceKnownReady, rememberWorkspaceReady } from '@/lib/workspace-ready';

interface DBProviderProps {
  children: ReactNode;
  seedDemoData?: boolean;
  /** Signed-in account; lets later page loads skip waiting for the set-up check. */
  userId?: string;
}

export function DBProvider({ children, seedDemoData = true, userId }: DBProviderProps) {
  const [remote, setRemote] = useState<RemoteGraphDB>(() => createRemoteGraphDB());
  const [db, setDb] = useState<RemoteGraphDB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initDB() {
      // Seen this workspace set up before in this browser: show the page now and
      // run the (idempotent) set-up check in the background (Roadmap P0 #3).
      const background = seedDemoData && isWorkspaceKnownReady(userId);
      if (background) {
        setDb(remote);
        setIsLoading(false);
      }
      try {
        // Seed demo data on the server if this account's workspace is empty
        if (seedDemoData) {
          const { seeded } = await seedDemoDataFn();
          if (seeded) console.log('Demo data seeded successfully!');
          rememberWorkspaceReady(userId);
          // The workspace was empty (e.g. cleared) and got the examples while the
          // page was already showing: a new proxy makes every data hook reload.
          if (background && seeded && mounted) setRemote(createRemoteGraphDB());
        }
        if (!mounted || background) return;
        setDb(remote);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        forgetWorkspaceReady();
        // In the background the page already works; the next load waits again.
        if (mounted && !background) {
          setError(err instanceof Error ? err : new Error('Failed to initialize database'));
          setIsLoading(false);
        }
      }
    }

    initDB();

    return () => {
      mounted = false;
    };
    // `remote` is replaced only after a background seed, which must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDemoData, userId]);

  useEffect(() => {
    setDb((current) => (current ? remote : current));
  }, [remote]);

  const value: DBContextValue = {
    db,
    isLoading,
    error,
    isReady: !!db && !isLoading,
  };

  return <DBContext.Provider value={value}>{children}</DBContext.Provider>;
}
