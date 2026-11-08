/**
 * Lesson text (`parseRichText` markup) as React elements: paragraphs, bullet
 * lists, bold and code. Nothing is ever inserted as HTML, so stored text can
 * not run script or change the page.
 */
import { parseRichText, type Inline } from '@/lib/content/content';

function Parts({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.code ? (
          <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
            {p.text}
          </code>
        ) : p.bold ? (
          <strong key={i}>{p.text}</strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

export function RichText({ text, className }: { text: string; className?: string }) {
  return (
    <div className={className}>
      {parseRichText(text).map((block, i) =>
        block.type === 'p' ? (
          <p key={i} className="mt-2 first:mt-0">
            <Parts parts={block.parts} />
          </p>
        ) : (
          <ul key={i} className="mt-2 list-disc space-y-1 pl-5 first:mt-0">
            {block.items.map((parts, j) => (
              <li key={j}>
                <Parts parts={parts} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
