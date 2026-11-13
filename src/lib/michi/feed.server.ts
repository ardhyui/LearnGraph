import { michiOrigin, parseMichiReport, michiCards } from './evidence.ts';
export type MichiFeed = Awaited<ReturnType<typeof readMichiFeed>>;
export async function readMichiFeed(
  owner: string,
  permitted: boolean,
  fetcher: typeof fetch = fetch,
) {
  if (!permitted || owner !== 'local-japanese-owner') return { status: 'disabled' as const };
  try {
    const origin = michiOrigin(process.env.JAPANESE_MICHI_ORIGIN);
    const response = await fetcher(origin + '/api/local-study/evidence', {
      signal: AbortSignal.timeout(4000),
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
      throw new Error('Unavailable');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing evidence');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 4 * 1024 * 1024) throw new Error('Evidence too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const report = parseMichiReport(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      Date.now(),
    );
    return {
      status: 'ready' as const,
      origin,
      generatedAt: report.generatedAt,
      cards: michiCards(report),
      sessionCount: report.sessionCount,
      pendingChecks: report.pendingChecks,
      unmapped: report.rows.filter((r) => !r.compatible || r.skill === 'unmapped').length,
      ignored: report.ignoredEvents + report.ignoredSessions,
    };
  } catch {
    return { status: 'unavailable' as const };
  }
}
