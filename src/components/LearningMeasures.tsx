/**
 * "Learning measures" on the Status page: the roadmap's measures of success
 * for this workspace, from its own activity log (`src/lib/evidence/measures.ts`).
 */
import { useEffect, useState } from 'react';
import { measureRows, type MeasureRow } from '@/lib/evidence/measures';
import { getLearningMeasures } from '@/server/evidence.functions';

export function LearningMeasures() {
  const [rows, setRows] = useState<MeasureRow[] | null>(null);
  const [events, setEvents] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getLearningMeasures()
      .then((m) => {
        if (!live) return;
        setRows(measureRows(m));
        setEvents(m.events);
      })
      .catch(() => live && setError('Could not load the measures.'));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="learning-measures" className="glass-card mb-8 rounded-2xl border border-border p-6" data-testid="learning-measures">
      <h2 id="learning-measures" className="text-xl font-semibold text-foreground">
        Learning measures
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        From this workspace’s own activity log{rows ? ` (${events} ${events === 1 ? 'event' : 'events'})` : ''}. Nothing
        is sent to an analytics service. The targets are the first ones set in the roadmap.
      </p>
      {error ? (
        <p role="alert" className="form-error mt-4">
          {error}
        </p>
      ) : !rows ? (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          Loading…
        </p>
      ) : (
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border p-4" data-measure={r.id}>
              <dt className="font-medium text-foreground">{r.label}</dt>
              <dd className="mt-1 text-sm text-foreground">{r.value}</dd>
              <dd className="mt-1 text-xs text-muted-foreground">Target: {r.target}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
