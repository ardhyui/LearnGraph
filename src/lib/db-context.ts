/**
 * The database context shared by the provider and its data hooks.
 *
 * Kept in its own module so `DBContext.tsx` can stay the import path for the
 * hooks (and only export hooks/helpers), while `DBProvider.tsx` exports the
 * React component so editing either module keeps fast refresh working.
 */
import { createContext } from 'react';
import type { RemoteGraphDB } from '@/lib/graph/methods';

export interface DBContextValue {
  db: RemoteGraphDB | null;
  isLoading: boolean;
  error: Error | null;
  isReady: boolean;
}

export const DBContext = createContext<DBContextValue>({
  db: null,
  isLoading: true,
  error: null,
  isReady: false,
});
