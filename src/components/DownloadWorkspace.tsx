/**
 * "Download workspace (JSON)" on Admin → Learners (Roadmap P0 #6): the whole
 * workspace of the signed-in account — every learner with their profile and
 * knowledge states, plus the workspace's concepts and prerequisite edges — as
 * one file made on the device. Data is read fresh through the same
 * account-scoped graph server functions the admin pages already use; nothing
 * is uploaded and no server function is added.
 */
import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useDB } from '@/lib/DBContext';
import { buildWorkspaceExport, workspaceExportFileName } from '@/lib/workspace-export';

function saveFile(fileName: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before freeing it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function DownloadWorkspace() {
  const { db, isReady } = useDB();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    if (!db || !isReady || busy) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const [learners, concepts, edges] = await Promise.all([
        db.listLearnerProfiles(),
        db.listConcepts(),
        db.listEdges(),
      ]);
      // One read per learner (the existing account-scoped RPCs, nothing new).
      const states = (await Promise.all(learners.map((l) => db.getLearnerKnowledgeStates(l.userId)))).flat();
      const now = new Date();
      const data = buildWorkspaceExport({ learners, states, concepts, edges, now });
      const fileName = workspaceExportFileName(now);
      saveFile(fileName, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
      setNotice(
        data.learners.length === 0 && data.concepts.length === 0
          ? `Downloaded ${fileName} — this workspace is empty.`
          : `Downloaded ${fileName} — ${plural(data.learners.length, 'learner')}, ${plural(data.concepts.length, 'concept')} and ${plural(data.edges.length, 'prerequisite')}.`,
      );
    } catch (err) {
      console.error('Failed to export workspace data:', err);
      setError('Could not prepare your download. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void download()}
        disabled={!isReady || busy}
        aria-busy={busy}
        data-testid="download-workspace"
        className="btn btn-secondary inline-flex min-h-10 items-center justify-center gap-2"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? 'Preparing workspace…' : 'Download workspace (JSON)'}
      </button>
      <p aria-live="polite" role="status" className={notice ? 'w-full mt-2 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}>
        {notice}
      </p>
      {error && (
        <p role="alert" className="w-full mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
