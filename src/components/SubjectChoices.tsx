/**
 * Subject checkboxes ("Mathematics · 6 concepts") used by onboarding and by
 * the "Change subjects" editor on the Today panel. Purely presentational: the
 * parent owns the list of domains and the chosen ones.
 */
import { domainLabel } from '@/lib/onboarding';

interface SubjectChoicesProps {
  domains: { domain: string; count: number }[];
  chosen: string[];
  onToggle: (domain: string, on: boolean) => void;
  disabled?: boolean;
}

export function SubjectChoices({ domains, chosen, onToggle, disabled }: SubjectChoicesProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {domains.map(({ domain, count }) => {
        const on = chosen.includes(domain);
        return (
          <label
            key={domain}
            className={
              'inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-primary ' +
              (on ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground hover:bg-primary/5')
            }
          >
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={(e) => onToggle(domain, e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            {domainLabel(domain)}
            <span className="text-xs text-muted-foreground">
              {count} {count === 1 ? 'concept' : 'concepts'}
            </span>
          </label>
        );
      })}
    </div>
  );
}
