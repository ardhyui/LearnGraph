/**
 * The read-only public API (Roadmap M4), for AI assistants and other tools:
 *
 *   GET /api/v1/learners                       the account's learners
 *   GET /api/v1/context?learner=&concept=&q=   the tutor brief (getRAGContext)
 *
 * Authenticated with `Authorization: Bearer lg_…` (see src/lib/api-keys.ts),
 * scoped to the key's account, read-only, 60 requests a minute per key.
 * The same payload builders (`learnersPayload`, `contextPayload`) back the MCP
 * server at `POST /api/mcp` (src/lib/mcp/), so REST and MCP stay in sync.
 * Server-only.
 */
import { allowApiRequest, bearerKey, hashApiKey, verifyApiKey } from '../api-keys.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const PARAM_MAX = 128;

/** A request the caller can fix (shown as a JSON error, not logged as a server error). */
export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

/** The key's account, or the error response to send. */
export async function authenticateApiRequest(request: Request): Promise<{ owner: string } | Response> {
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

export interface LearnersPayload {
  learners: Array<{ id: string; name: string; example: boolean }>;
}

/** The account's learners, as both `/api/v1/learners` and MCP `list_learners` return them. */
export async function learnersPayload(owner: string): Promise<LearnersPayload> {
  const graph = await graphFor(owner);
  const learners = await graph.listLearnerProfiles();
  return {
    learners: learners.map((l) => ({ id: l.userId, name: l.name ?? l.userId, example: l.userId.startsWith('demo-') })),
  };
}

export interface ContextQuery {
  learner?: string | null;
  concept?: string | null;
  query?: string | null;
}

export interface ContextPayload {
  learner: string;
  concept: string | null;
  queryType: string;
  tokens: number;
  context: string;
}

/**
 * The tutor brief for one request, shared by `/api/v1/context` and MCP
 * `get_tutor_context`. Throws `ApiRequestError` for anything the caller can fix.
 */
export async function contextPayload(owner: string, input: ContextQuery): Promise<ContextPayload> {
  const learnerParam = input.learner?.trim() || null;
  const conceptParam = input.concept?.trim() || null;
  const query = input.query?.slice(0, 1000) ?? null;
  if ((learnerParam?.length ?? 0) > PARAM_MAX || (conceptParam?.length ?? 0) > 200) {
    throw new ApiRequestError(400, 'learner or concept is too long.');
  }
  const graph = await graphFor(owner);
  // Default learner: the account's own (not an example learner), else the first.
  let learnerId = learnerParam;
  if (!learnerId) {
    const learners = await graph.listLearnerProfiles();
    learnerId = (learners.find((l) => !l.userId.startsWith('demo-')) ?? learners[0])?.userId ?? null;
    if (!learnerId) throw new ApiRequestError(404, 'This account has no learners yet.');
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
    if (!conceptId) throw new ApiRequestError(404, `No concept "${conceptParam}" in this account.`);
  }
  const { getRAGContext } = await import('../tutor/service.ts');
  const ctx = await getRAGContext(graph, { learnerId, conceptId, query });
  if (!ctx) throw new ApiRequestError(404, `No learner "${learnerId}" in this account.`);
  return { learner: learnerId, concept: conceptId, queryType: ctx.queryType, tokens: ctx.tokens, context: ctx.text };
}

export async function apiLearners(request: Request): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request);
    if (auth instanceof Response) return auth;
    return json(200, await learnersPayload(auth.owner));
  } catch (err) {
    console.error('[api/v1/learners]', err);
    return json(500, { error: 'Something went wrong on our side.' });
  }
}

export async function apiContext(request: Request): Promise<Response> {
  try {
    const auth = await authenticateApiRequest(request);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const payload = await contextPayload(auth.owner, {
      learner: url.searchParams.get('learner'),
      concept: url.searchParams.get('concept'),
      query: url.searchParams.get('q'),
    });
    return json(200, payload);
  } catch (err) {
    if (err instanceof ApiRequestError) return json(err.status, { error: err.message });
    console.error('[api/v1/context]', err);
    return json(500, { error: 'Something went wrong on our side.' });
  }
}
