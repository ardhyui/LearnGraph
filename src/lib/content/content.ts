/**
 * Lesson content per concept (Roadmap M2): explanations, worked examples,
 * practice exercises, links and videos. Pure helpers (no I/O), unit-tested:
 * validation, the learner's format preference, ordering, and a tiny text
 * markup that is turned into React elements, never into HTML.
 */
import { z } from 'zod';
import type { LearnerProfile } from '../graph/types.ts';
import { writeId } from '../graph/rpc-schemas.ts';

export const CONTENT_KINDS = ['text', 'example', 'exercise', 'link', 'video'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_KIND_LABELS: Record<ContentKind, string> = {
  text: 'Explanation',
  example: 'Worked example',
  exercise: 'Practice',
  link: 'Link',
  video: 'Video',
};

export const MAX_CONTENT_PER_CONCEPT = 50;

export interface ContentItem {
  id: string;
  conceptId: string;
  kind: ContentKind;
  title: string;
  /** Plain text with a tiny markup: blank line = paragraph, "- " = bullet, **bold**, `code`. */
  body: string;
  /** Worked solution of an exercise, revealed on request. */
  solution: string;
  /** https only (links and videos). */
  url: string | null;
  minutes: number | null;
  language: string;
  source: string;
  position: number;
}

const httpsUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => {
    try {
      return new URL(s).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an https:// link');

/** A content item typed in the editor (validated again on the server). */
export const contentInput = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid content id')
      .optional(),
    conceptId: writeId,
    kind: z.enum(CONTENT_KINDS),
    title: z.string().trim().min(1, 'must not be empty').max(200),
    body: z.string().max(20_000).default(''),
    solution: z.string().max(20_000).default(''),
    url: z.preprocess((v) => (v === '' ? null : v), httpsUrl.nullable()).default(null),
    minutes: z.number().int().min(1).max(600).nullable().default(null),
    language: z
      .string()
      .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, 'use a language code such as en or id')
      .default('en'),
    source: z.string().trim().max(500).default(''),
    position: z.number().int().min(0).max(10_000).default(0),
  })
  .refine((c) => (c.kind === 'link' || c.kind === 'video' ? !!c.url : true), {
    message: 'Links and videos need an https:// address.',
    path: ['url'],
  })
  .refine((c) => (c.kind === 'link' || c.kind === 'video' ? true : c.body.trim().length > 0), {
    message: 'Write the text of this item.',
    path: ['body'],
  });

export type ContentInput = z.infer<typeof contentInput>;

// ---------------------------------------------------------------------------
// Format preference (a choice the learner can change, not a diagnosis)
// ---------------------------------------------------------------------------

export const FORMAT_PREFERENCES = ['explain-first', 'example-first', 'practice-first'] as const;
export type FormatPreference = (typeof FORMAT_PREFERENCES)[number];

export const FORMAT_LABELS: Record<FormatPreference, string> = {
  'explain-first': 'Explanation first',
  'example-first': 'Examples first',
  'practice-first': 'Practice first',
};

/** Learner tag that stores the chosen format (`format:example-first`). */
export const FORMAT_TAG_PREFIX = 'format:';

export interface PresentationStrategy {
  preference: FormatPreference;
  /** `chosen` by the learner, `suggested` from their profile, or the `default`. */
  source: 'chosen' | 'suggested' | 'default';
}

/**
 * Which format a lesson leads with. The learner's own choice wins; otherwise
 * the profile only suggests a starting order. Matching material to "learning
 * styles" has weak evidence (Pashler et al., 2008), so this is a preference
 * the learner sees and can change, and the order used is logged with the
 * lesson so its effect can be tested.
 */
export function determinePresentationStrategy(
  learner: Pick<LearnerProfile, 'tags' | 'learningStyle'> | null | undefined,
): PresentationStrategy {
  const tag = learner?.tags?.find((t) => t.startsWith(FORMAT_TAG_PREFIX));
  const chosen = tag?.slice(FORMAT_TAG_PREFIX.length);
  if (chosen && (FORMAT_PREFERENCES as readonly string[]).includes(chosen)) {
    return { preference: chosen as FormatPreference, source: 'chosen' };
  }
  switch (learner?.learningStyle?.primary) {
    case 'kinesthetic':
      return { preference: 'practice-first', source: 'suggested' };
    case 'visual':
      return { preference: 'example-first', source: 'suggested' };
    case 'reading':
    case 'auditory':
      return { preference: 'explain-first', source: 'suggested' };
    default:
      return { preference: 'explain-first', source: 'default' };
  }
}

/** Replace the format choice inside the learner's tags (other tags untouched). */
export function withFormatPreference(tags: string[] | undefined, preference: FormatPreference | null): string[] {
  const others = (tags ?? []).filter((t) => !t.startsWith(FORMAT_TAG_PREFIX));
  return preference ? [...others, `${FORMAT_TAG_PREFIX}${preference}`].slice(0, 50) : others;
}

const KIND_SCORES: Record<FormatPreference, Record<ContentKind, number>> = {
  'explain-first': { text: 4, video: 3, example: 2, exercise: 1, link: 0 },
  'example-first': { example: 4, video: 3, text: 2, exercise: 1, link: 0 },
  'practice-first': { exercise: 4, example: 3, text: 2, video: 1, link: 0 },
};

/** How early an item comes for this preference (higher = earlier). */
export function scoreContentMatch(item: Pick<ContentItem, 'kind'>, preference: FormatPreference): number {
  return KIND_SCORES[preference][item.kind] ?? 0;
}

/** Items in lesson order: by format preference, then by the editor's order. */
export function orderContent<T extends Pick<ContentItem, 'kind' | 'position' | 'id'>>(
  items: readonly T[],
  preference: FormatPreference,
): T[] {
  return [...items].sort(
    (a, b) =>
      scoreContentMatch(b, preference) - scoreContentMatch(a, preference) ||
      a.position - b.position ||
      a.id.localeCompare(b.id),
  );
}

/** Minutes a lesson takes: its items' minutes, or a fallback per item. */
export function lessonMinutes(items: readonly Pick<ContentItem, 'kind' | 'minutes'>[]): number {
  return items.reduce((sum, item) => sum + (item.minutes ?? (item.kind === 'link' ? 0 : 2)), 0);
}

// ---------------------------------------------------------------------------
// Text markup → blocks (rendered as React elements, so nothing is HTML)
// ---------------------------------------------------------------------------

export interface Inline {
  text: string;
  bold?: boolean;
  code?: boolean;
}
export type Block = { type: 'p'; parts: Inline[] } | { type: 'ul'; items: Inline[][] };

/** `**bold**` and `code` spans; anything unmatched stays plain text. */
export function parseInline(line: string): Inline[] {
  const parts: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) parts.push({ text: line.slice(last, m.index) });
    parts.push(m[1] !== undefined ? { text: m[1], bold: true } : { text: m[2], code: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last) });
  return parts;
}

/** Paragraphs (separated by a blank line) and bullet lists (lines starting with "- "). */
export function parseRichText(body: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of body.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    let para: string[] = [];
    let list: Inline[][] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ type: 'p', parts: parseInline(para.join(' ')) });
      para = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ type: 'ul', items: list });
      list = [];
    };
    for (const line of lines) {
      const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
      if (bullet) {
        flushPara();
        list.push(parseInline(bullet[1]));
      } else {
        flushList();
        para.push(line.trim());
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}
