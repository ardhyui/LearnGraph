/**
 * "Your data" footer of the My learning card: download this learner's
 * progress as a CSV (for a spreadsheet) or everything as JSON (a backup).
 *
 * Data is read fresh through the account-scoped graph server functions, so
 * the file only ever holds this account's own learner; nothing is uploaded.
 */
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useDB } from '@/lib/DBContext';
import { buildLearnerExport, exportFileName, progressCsv } from '@/lib/export';

type Kind = 'csv' | 'json';

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

export function DownloadMyData({ learnerId }: { learnerId: string }) {
  const { db, isReady } = useDB();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentIdRef = useRef(learnerId);
  currentIdRef.current = learnerId;

  useEffect(() => {
    setNotice(null);
    setError(null);
  }, [learnerId]);

  const download = async (kind: Kind) => {
    if (!db || !isReady || busy) return;
    const forId = learnerId;
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      const [learner, states, concepts] = await Promise.all([
        db.getLearnerProfile(forId),
        db.getLearnerKnowledgeStates(forId),
        db.listConcepts(),
      ]);
      if (currentIdRef.current !== forId) return;
      if (!learner) throw new Error('Learner not found');
      const now = new Date();
      const data = buildLearnerExport({ learner, states, concepts, now });
      const fileName = exportFileName(data.learner.name, kind, now);
      if (kind === 'csv') saveFile(fileName, progressCsv(data.progress), 'text/csv;charset=utf-8');
      else saveFile(fileName, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
      setNotice(
        kind === 'csv'
          ? `Downloaded ${fileName} — ${data.progress.length} concept${data.progress.length === 1 ? '' : 's'} with your progress.`
          : `Downloaded ${fileName} — your profile and all your progress.`,
      );
    } catch (err) {
      if (currentIdRef.current !== forId) return;
      console.error('Failed to export learner data:', err);
      setError('Could not prepare your download. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const button =
    'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60';

  return (
    <div className="mt-5 border-t border-border pt-4" data-testid="download-my-data">
      <h3 id="your-data-heading" className="text-sm font-semibold text-foreground">
        Your data
      </h3>
      <p id="your-data-hint" className="mt-1 text-sm text-muted-foreground">
        Keep a copy of your progress. The file is made on this device and only includes this learner.
      </p>
      <div role="group" aria-labelledby="your-data-heading" aria-describedby="your-data-hint" className="mt-3 flex flex-col gap-2 sm:flex-row">
        {(
          [
            ['csv', 'Download progress (CSV)'],
            ['json', 'Download everything (JSON)'],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => download(kind)}
            disabled={!isReady || busy !== null}
            aria-busy={busy === kind}
            className={button}
          >
            {busy === kind ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            {label}
          </button>
        ))}
      </div>
      <p aria-live="polite" role="status" className={notice ? 'mt-2 text-sm text-emerald-700 dark:text-emerald-400' : 'sr-only'}>
        {notice}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
