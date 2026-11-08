/**
 * The read-only public API (Roadmap M4), for AI assistants and other tools:
 *
 *   GET /api/v1/learners                       the account's learners
 *   GET /api/v1/context?learner=&concept=&q=   the tutor brief (getRAGContext)
 *
 * Authenticated with `Authorization: Bearer lg_…` (see src/lib/api-keys.ts),
 * scoped to the key's account, read-only, 60 requests a minute per key.
 * Server-only.
 */
import { allowApiRequest, bearerKey, hashApiKey, verifyApiKey } from '../api-keys.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const PARAM_MAX = 128;

/** The key's account, or the error response to send. */
async function authenticate(request: Request): Promise<{ owner: string } | Response> {
  const key = bearerKey(request);
  if (!key) {
    return new Response(JSON.stringify({ error: 'Send an API key: Authorization: Bearer lg_…' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'www-authenticate': 'Bearer', 'cache-control': 'no-store' },
    });
  }
  if (!allowApiRequest(hashApiKey(key))) return json(429, { error: 'Too many requests. Try again in a minute.' });
  const { getDb } = await import('../db');
  const owner = await verifyApiKey(getDb(), key);
  if (!owner) return json(401, { error: 'This API key is not valid (or was revoked).' });
  return { owner };
}

async function graphFor(owner: string) {
  const { graphForOwner } = await import('../graph/server');
  return graphForOwner(owner);
}

export async function apiLearners(request: Request): Promise<Response> {
  try {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    const graph = await graphFor(auth.owner);
    const learners = await graph.listLearnerProfiles();
    return json(200, {
      learners: learners.map((l) => ({ id: l.userId, name: l.name ?? l.userId, example: l.userId.startsWith('demo-') })),
    });
  } catch (err) {
    console.error('[api/v1/learners]', err);
    return json(500, { error: 'Something went wrong on our side.' });
  }
}

export async function apiContext(request: Request): Promise<Response> {
  try {
    const auth = await authenticate(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const learnerParam = url.searchParams.get('learner')?.trim() || null;
    const conceptParam = url.searchParams.get('concept')?.trim() || null;
    const query = url.searchParams.get('q')?.slice(0, 1000) ?? null;
    if ((learnerParam?.length ?? 0) > PARAM_MAX || (conceptParam?.length ?? 0) > 200) {
      return json(400, { error: 'learner or concept is too long.' });
    }
    const graph = await graphFor(auth.owner);
    // Default learner: the account's own (not an example learner), else the first.
    let learnerId = learnerParam;
    if (!learnerId) {
      const learners = await graph.listLearnerProfiles();
      learnerId = (learners.find((l) => !l.userId.startsWith('demo-')) ?? learners[0])?.userId ?? null;
      if (!learnerId) return json(404, { error: 'This account has no learners yet.' });
    }
    // A concept can be named by id or by name (what an assistant usually knows).
    let conceptId: string | null = null;
    if (conceptParam) {
      const wanted = conceptParam.toLowerCase();
      const concepts = await graph.listConcepts();
      conceptId =
        concepts.find((c) => c.conceptId === conceptParam)?.conceptId ??
        concepts.find((c) => c.name.toLowerCase() === wanted)?.conceptId ??
        null;
      if (!conceptId) return json(404, { error: `No concept "${conceptParam}" in this account.` });
    }
    const { getRAGContext } = await import('../tutor/service.ts');
    const ctx = await getRAGContext(graph, { learnerId, conceptId, query });
    if (!ctx) return json(404, { error: `No learner "${learnerId}" in this account.` });
    return json(200, { learner: learnerId, concept: conceptId, queryType: ctx.queryType, tokens: ctx.tokens, context: ctx.text });
  } catch (err) {
    console.error('[api/v1/context]', err);
    return json(500, { error: 'Something went wrong on our side.' });
  }
}
