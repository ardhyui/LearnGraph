/**
 * React context for LearnGraph data access.
 *
 * Previously the whole database lived in the browser (LevelDB/IndexedDB).
 * Now `db` is a thin proxy: every method call is forwarded to the `graphCall`
 * server function, which runs the same EducationGraphDB engine against
 * Postgres, scoped to the signed-in account. Hooks and method names are
 * unchanged, so pages work as before.
 */

import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react';
import { graphCall, seedDemoData as seedDemoDataFn } from '@/server/graph.functions';
import { REMOTE_GRAPH_METHODS, type RemoteGraphDB } from '@/lib/graph/methods';
import type {
  LearnerProfile,
  ConceptNode,
  PrerequisiteEdge,
  KnowledgeState,
  DBStats,
  ZPDResult,
} from '@/lib/graph/types';

/** Build the browser-side proxy that forwards calls to the server. */
export function createRemoteGraphDB(): RemoteGraphDB {
  const remote = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const method of REMOTE_GRAPH_METHODS) {
    remote[method] = (...args: unknown[]) =>
      // Strip `undefined` the way the old JSON store did.
      graphCall({ data: { method, args: JSON.parse(JSON.stringify(args ?? [])) } });
  }
  return remote as unknown as RemoteGraphDB;
}

interface DBContextValue {
  db: RemoteGraphDB | null;
  isLoading: boolean;
  error: Error | null;
  isReady: boolean;
}

const DBContext = createContext<DBContextValue>({
  db: null,
  isLoading: true,
  error: null,
  isReady: false,
});

interface DBProviderProps {
  children: ReactNode;
  seedDemoData?: boolean;
}

export function DBProvider({ children, seedDemoData = true }: DBProviderProps) {
  const remote = useMemo(() => createRemoteGraphDB(), []);
  const [db, setDb] = useState<RemoteGraphDB | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initDB() {
      try {
        // Seed demo data on the server if this account's workspace is empty
        if (seedDemoData) {
          const { seeded } = await seedDemoDataFn();
          if (seeded) console.log('Demo data seeded successfully!');
        }
        if (!mounted) return;
        setDb(remote);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize database:', err);
        if (mounted) {
          setError(err instanceof Error ? err : new Error('Failed to initialize database'));
          setIsLoading(false);
        }
      }
    }

    initDB();

    return () => {
      mounted = false;
    };
  }, [seedDemoData, remote]);

  const value: DBContextValue = {
    db,
    isLoading,
    error,
    isReady: !!db && !isLoading,
  };

  return <DBContext.Provider value={value}>{children}</DBContext.Provider>;
}

/**
 * Hook to access the database context
 */
export function useDB() {
  const context = useContext(DBContext);
  if (!context) {
    throw new Error('useDB must be used within a DBProvider');
  }
  return context;
}

/**
 * Hook for learner operations
 */
export function useLearners() {
  const { db, isReady } = useDB();
  const [learners, setLearners] = useState<LearnerProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db || !isReady) return;
    setLoading(true);
    try {
      const data = await db.listLearnerProfiles();
      setLearners(data);
    } catch (err) {
      console.error('Failed to fetch learners:', err);
    } finally {
      setLoading(false);
    }
  }, [db, isReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createLearner = useCallback(async (userId: string, profile: Partial<LearnerProfile>) => {
    if (!db) throw new Error('Database not ready');
    const learner = await db.setLearnerProfile(userId, profile);
    await refresh();
    return learner;
  }, [db, refresh]);

  const updateLearner = useCallback(async (userId: string, profile: Partial<LearnerProfile>) => {
    if (!db) throw new Error('Database not ready');
    const learner = await db.setLearnerProfile(userId, profile);
    await refresh();
    return learner;
  }, [db, refresh]);

  const deleteLearner = useCallback(async (userId: string) => {
    if (!db) throw new Error('Database not ready');
    await db.deleteLearnerProfile(userId);
    await refresh();
  }, [db, refresh]);

  const getLearner = useCallback(async (userId: string) => {
    if (!db) throw new Error('Database not ready');
    return db.getLearnerProfile(userId);
  }, [db]);

  return {
    learners,
    loading,
    refresh,
    createLearner,
    updateLearner,
    deleteLearner,
    getLearner,
  };
}

/**
 * Hook for concept operations
 */
export function useConcepts() {
  const { db, isReady } = useDB();
  const [concepts, setConcepts] = useState<ConceptNode[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db || !isReady) return;
    setLoading(true);
    try {
      const data = await db.listConcepts();
      setConcepts(data);
    } catch (err) {
      console.error('Failed to fetch concepts:', err);
    } finally {
      setLoading(false);
    }
  }, [db, isReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createConcept = useCallback(async (concept: Partial<ConceptNode> & { conceptId: string }) => {
    if (!db) throw new Error('Database not ready');
    const created = await db.addConcept(concept);
    await refresh();
    return created;
  }, [db, refresh]);

  const updateConcept = useCallback(async (concept: Partial<ConceptNode> & { conceptId: string }) => {
    if (!db) throw new Error('Database not ready');
    const updated = await db.addConcept(concept);
    await refresh();
    return updated;
  }, [db, refresh]);

  const deleteConcept = useCallback(async (conceptId: string) => {
    if (!db) throw new Error('Database not ready');
    await db.deleteConcept(conceptId);
    await refresh();
  }, [db, refresh]);

  const getConcept = useCallback(async (conceptId: string) => {
    if (!db) throw new Error('Database not ready');
    return db.getConcept(conceptId);
  }, [db]);

  const searchConcepts = useCallback(async (query: string) => {
    if (!db) throw new Error('Database not ready');
    return db.searchConcepts(query);
  }, [db]);

  return {
    concepts,
    loading,
    refresh,
    createConcept,
    updateConcept,
    deleteConcept,
    getConcept,
    searchConcepts,
  };
}

/**
 * Hook for edge operations
 */
export function useEdges() {
  const { db, isReady } = useDB();
  const [edges, setEdges] = useState<PrerequisiteEdge[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db || !isReady) return;
    setLoading(true);
    try {
      const data = await db.listEdges();
      setEdges(data);
    } catch (err) {
      console.error('Failed to fetch edges:', err);
    } finally {
      setLoading(false);
    }
  }, [db, isReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createEdge = useCallback(async (edge: { from: string; to: string; strength?: string; reason?: string }) => {
    if (!db) throw new Error('Database not ready');
    const created = await db.addEdge(edge);
    await refresh();
    return created;
  }, [db, refresh]);

  const deleteEdge = useCallback(async (from: string, to: string) => {
    if (!db) throw new Error('Database not ready');
    await db.deleteEdge(from, to);
    await refresh();
  }, [db, refresh]);

  const getPrerequisites = useCallback(async (conceptId: string) => {
    if (!db) throw new Error('Database not ready');
    return db.getPrerequisites(conceptId);
  }, [db]);

  const getDependents = useCallback(async (conceptId: string) => {
    if (!db) throw new Error('Database not ready');
    return db.getDependents(conceptId);
  }, [db]);

  return {
    edges,
    loading,
    refresh,
    createEdge,
    deleteEdge,
    getPrerequisites,
    getDependents,
  };
}

/**
 * Hook for knowledge state operations
 */
export function useKnowledgeStates(userId?: string) {
  const { db, isReady } = useDB();
  const [states, setStates] = useState<KnowledgeState[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db || !isReady || !userId) return;
    setLoading(true);
    try {
      const data = await db.getLearnerKnowledgeStates(userId);
      setStates(data);
    } catch (err) {
      console.error('Failed to fetch knowledge states:', err);
    } finally {
      setLoading(false);
    }
  }, [db, isReady, userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setKnowledgeState = useCallback(async (
    learnerId: string,
    conceptId: string,
    state: Partial<KnowledgeState>
  ) => {
    if (!db) throw new Error('Database not ready');
    const updated = await db.setKnowledgeState(learnerId, conceptId, state);
    await refresh();
    return updated;
  }, [db, refresh]);

  const deleteKnowledgeState = useCallback(async (learnerId: string, conceptId: string) => {
    if (!db) throw new Error('Database not ready');
    await db.deleteKnowledgeState(learnerId, conceptId);
    await refresh();
  }, [db, refresh]);

  return {
    states,
    loading,
    refresh,
    setKnowledgeState,
    deleteKnowledgeState,
  };
}

/**
 * Hook for ZPD computations
 */
export function useZPD(userId?: string) {
  const { db, isReady } = useDB();
  const [zpd, setZpd] = useState<ZPDResult | null>(null);
  const [loading, setLoading] = useState(false);

  const computeZPD = useCallback(async (options?: { limit?: number }) => {
    if (!db || !isReady || !userId) return null;
    setLoading(true);
    try {
      const result = await db.computeZPD(userId, options);
      setZpd(result);
      return result;
    } catch (err) {
      console.error('Failed to compute ZPD:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, [db, isReady, userId]);

  const generateLearningPath = useCallback(async (maxConcepts?: number) => {
    if (!db || !userId) throw new Error('Database not ready or no user');
    return db.generateLearningPath(userId, maxConcepts);
  }, [db, userId]);

  return {
    zpd,
    loading,
    computeZPD,
    generateLearningPath,
  };
}

/**
 * Hook for gap analysis
 */
export function useGapAnalysis(userId?: string) {
  const { db, isReady } = useDB();

  const detectGaps = useCallback(async (options?: Parameters<RemoteGraphDB['detectGaps']>[1]) => {
    if (!db || !isReady || !userId) throw new Error('Database not ready or no user');
    return db.detectGaps(userId, options);
  }, [db, isReady, userId]);

  const getReviewQueue = useCallback(async (options?: Parameters<RemoteGraphDB['getReviewQueue']>[1]) => {
    if (!db || !isReady || !userId) throw new Error('Database not ready or no user');
    return db.getReviewQueue(userId, options);
  }, [db, isReady, userId]);

  const generateRemediationPlan = useCallback(async (options?: Parameters<RemoteGraphDB['generateRemediationPlan']>[1]) => {
    if (!db || !isReady || !userId) throw new Error('Database not ready or no user');
    return db.generateRemediationPlan(userId, options);
  }, [db, isReady, userId]);

  return {
    detectGaps,
    getReviewQueue,
    generateRemediationPlan,
  };
}

/**
 * Hook for database stats
 */
export function useDBStats() {
  const { db, isReady } = useDB();
  const [stats, setStats] = useState<DBStats | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!db || !isReady) return;
    setLoading(true);
    try {
      const data = await db.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  }, [db, isReady]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearDatabase = useCallback(async () => {
    if (!db) throw new Error('Database not ready');
    await db.clear();
    await refresh();
  }, [db, refresh]);

  return {
    stats,
    loading,
    refresh,
    clearDatabase,
  };
}
