# Read-only Michi skill evidence

The Japanese dashboard can read Michi's retained lesson evidence through a
separate, optional server call. This does not append learning events, change
mastery, or schedule reviews. Refresh replaces the projection; deletion at Michi
therefore removes the displayed evidence on the next successful read.

Only the verified `local-japanese-owner` on the configured direct
`JAPANESE_LOCAL_ORIGIN`, with no external database, can initiate the fetch.
Hosted accounts get disabled status and never fetch the workstation feed.
`JAPANESE_MICHI_ORIGIN` defaults to `http://127.0.0.1:17831`; operator overrides
must be numeric loopback HTTP origins without credentials, paths, query or
fragment. Redirects are rejected. Do not expose local mode beyond loopback.

Michi serves `GET /api/local-study/evidence`, format `michi-skill-evidence` v1,
only in an explicitly local/auth-off build. The body is the same response-free
projection as its skill-evidence export. The endpoint reads its fixed local
lesson snapshot and current content catalogue; it never writes history. It
rejects proxy, foreign Host/Origin and cross-site fetch metadata. Public builds
return 404. Unreadable/corrupt source returns 503 without filesystem paths or
learner responses. Responses use `Cache-Control: no-store` and bypass offline
API caching.

The consumer rejects unsupported shapes, unknown/private fields, conflicting
IDs, future or stale reports, and payloads over 4 MiB. Identical event IDs are
deduplicated. The fetch is bounded to four seconds and the UI RPC wait to
fifteen seconds. There is no durable copy of the report in LearnGraph's DB or
browser storage. On failure, stale cards are removed and a retry message appears;
the rest of the dashboard and quizzes remain usable.

Seven abilities remain distinct. Counts distinguish objective practice and
unique steps, assistance, input exposure, self-review/revisions, delayed checks,
text alternatives and synthetic/recorded audio. Unfinished checks provide no
partial result. Drafts are labelled and no JLPT/CEFR/mastery inference is made.
This is a retained-window view, not an archive of all learning or a validated
cross-skill recommendation model.

Tests: `tests/michi-evidence.test.ts` covers the parser, source identity/dedup,
replacement/deletion, aid/output/audio distinctions, safe targets and optional
failures. The paired Michi repository's
`scripts/learngraph-evidence-smoke.mjs` exercises both applications through
agent-browser with isolated snapshots/databases and QA ports, including corrupt
source recovery, unchanged learner history, and desktop/mobile rendering.
Never run these tests against the personal services.

No migrations are added. Existing cloud authentication, Japanese quiz scoring,
legacy kanji signals and SRS scheduling are unchanged. Roll back source/bundle
without restoring older private data. A separate checkout is used so ongoing M2
content-editor work is preserved; installing or merging that combined workspace
requires its own verification.
