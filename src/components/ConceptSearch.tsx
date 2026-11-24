/**
 * "Find a concept": a small search over the concepts the account already has,
 * so a learner who knows the name can open its lesson without scrolling the
 * review or "Learn next" lists. Shared by the Today panel and Gap Analysis.
 * Results are ordinary links (keyboard and screen readers use them as such); a
 * query under two characters hides the list rather than reporting an error.
 * While typing, a polite status line announces how many concepts matched and
 * whether the list was cut short — screen readers hear nothing from the list
 * itself changing. Mounted per learner, so a query typed for one learner never
 * follows the next.
 */
import { useId, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Search } from 'lucide-react';
import type { ConceptNode } from '@/lib/graph/types';
import { conceptSearchResults, conceptSearchSummary, searchQuery } from '@/lib/concept-search';
import { domainLabel } from '@/lib/onboarding';

export function ConceptSearch({ concepts }: { concepts: ConceptNode[] }) {
  const inputId = useId();
  const headingId = useId();
  const [query, setQuery] = useState('');
  const cleaned = searchQuery(query);
  const results = conceptSearchResults(concepts, query);
  const summary = conceptSearchSummary(concepts, query);
  return (
    <section
      aria-labelledby={headingId}
      data-testid="concept-search"
      className="mt-4 rounded-xl border border-border/50 bg-background/40 p-4"
    >
      <h3 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Search className="h-4 w-4 text-primary" aria-hidden="true" /> Find a concept
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">Jump straight to any lesson in your plan.</p>
      <label htmlFor={inputId} className="mt-2 block text-xs font-medium text-foreground">
        Search your concepts
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, topic or tag"
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      {summary && (
        <p role="status" aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          {summary}
        </p>
      )}
      {cleaned &&
        (results.length > 0 ? (
          <ul aria-label="Concept search results" className="mt-2 space-y-1">
            {results.map((concept) => (
              <li key={concept.conceptId}>
                <Link
                  to="/learn/$conceptId"
                  params={{ conceptId: concept.conceptId }}
                  className="flex min-h-10 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-md px-1 py-1 text-sm text-foreground underline-offset-2 hover:text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <span className="font-medium">{concept.name}</span>
                  <span className="text-xs text-muted-foreground">{domainLabel(concept.domain)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status" className="mt-2 text-sm text-muted-foreground">
            No concepts match “{cleaned}”.
          </p>
        ))}
    </section>
  );
}
