export type Attempt = { at: string; correct: number; total: number; ids: string[] };
/** A formative signal, never an official JLPT score. Delayed independent retrieval is required. */
export function evidenceMastery(attempts: Attempt[]): number {
  if (!attempts.length) return 0;
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted.at(-1)!;
  const accuracy = last.correct / Math.max(1, last.total);
  if (accuracy < 0.8) return Math.round(accuracy * 70);
  const passed = sorted.filter((a) => a.correct / Math.max(1, a.total) >= 0.8);
  const spaced = passed.some(
    (a) =>
      Date.parse(last.at) - Date.parse(a.at) >= 86400000 &&
      new Set([...a.ids, ...last.ids]).size >= 4,
  );
  return spaced ? 85 : 70;
}

/** Early repeats and failures never increase the earned review interval. */
export function nextQuizReview(attempts: Attempt[]): string | null {
  if (!attempts.length) return null;
  const sorted = [...attempts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const last = sorted.at(-1)!;
  if (last.correct / Math.max(1, last.total) < 0.8)
    return new Date(Date.parse(last.at) + 600000).toISOString();
  let earned = 0;
  let previous = -Infinity;
  for (const a of sorted) {
    const at = Date.parse(a.at);
    if (a.correct / Math.max(1, a.total) < 0.8) {
      earned = 0;
      previous = -Infinity;
      continue;
    }
    if (at - previous >= 86400000) {
      earned++;
      previous = at;
    }
  }
  return new Date(
    Date.parse(last.at) + Math.min(30, 2 ** Math.min(5, Math.max(0, earned - 1))) * 86400000,
  ).toISOString();
}
