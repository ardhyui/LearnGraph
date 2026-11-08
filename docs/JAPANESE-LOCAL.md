# Workstation Japanese integration

Local installation is documented in ~/Documents/Belajar-Jepang/INTEGRASI.md.

- /japanese seeds 40 Japanese concepts and prerequisite edges idempotently for the verified owner. The workstation profile does not seed demo learners.
- 48 locally authored formative questions cover eight N5 foundation topics; the course is not a complete official JLPT question bank. N4–N1 entries are practice milestones and resource links.
- Quiz sessions, selected questions and completed results are owner-scoped in japanese_quizzes. Scoring is server-side and completion is conditional on an unfinished session. Success needs independent delayed evidence before crossing the mastery threshold. Early repetitions cannot earn a longer review interval.
- Every Japanese concept carries `evidenceRequired: true` (migration 0005 backfills existing ones; the page sets it on new ones). The generic setKnowledgeState RPC and the Today self-report buttons refuse such concepts, so self-reported understanding cannot replace quiz evidence. Quizzes and practice logs on this page are also written to the shared `learning_events` log (`source: 'japanese'`); `japanese_quizzes` is unchanged.
- Optional JAPANESE_MICHI_SNAPSHOT reads the fixed server-side snapshot only for local-japanese-owner. It imports chapter-level signals from passed exams and mature SRS cards. The local Michi app restores an empty browser from the same snapshot and saves subsequent changes. It is a single-workstation integration, not multi-device conflict resolution.
- JAPANESE_LOCAL_EXPORT_DIR exports report data while the dashboard is open. /api/japanese-backup uses PGlite.dumpDataDir for a consistent archive.
- JAPANESE_LOCAL_ORIGIN is disabled by default. When explicitly set to the exact loopback origin, requests from that origin resolve to a single local account, created in the auth table for FK integrity. Proxy/foreign-origin requests are refused. This mode must only be served on loopback, without forwarding or public hosting. Normal account authentication remains the default elsewhere.
- Local build: NITRO_PRESET=node-server npm run build:local. Run .output/server/index.mjs with NITRO_HOST=127.0.0.1, NITRO_PORT, PGLITE_DATA_DIR and the documented environment variables. No external database or paid AI service is required.

Verification: tests/japanese.test.ts tests evidence, early-repeat scheduling, curriculum dependencies and local-origin rejection. scripts/japanese-smoke.mjs performs mutating UI/integration checks; it requires JAPANESE_QA=1 and isolated servers/data on 17841/17842. The script rejects the personal service ports 17831/17832. Set JAPANESE_QA_DIR to the temporary directory shared by both QA servers (the Michi snapshot must be michi-progress.json there). MICHI_TEST_URL and JAPANESE_TEST_URL may override the isolated QA URLs. Never run it against personal learning data. System Chromium is used for the local smoke test.


## PR validation (7 November 2026)

- 180 functional tests outside education-graph-db.test.ts passed. Its 33 non-performance database tests also passed when run with --test-skip-pattern=Performance (213 functional tests total).
- Typecheck, lint with zero warnings, default Vercel build and Node-server build passed.
- Isolated browser integration passed server quiz grading, same-day cap, practice logging, Michi snapshot/restore/import, backup download and foreign-origin rejection. Loaded mobile layout and browser title were checked; desktop/mobile screenshots were inspected.
- A downloaded backup was restored into a new in-memory PGlite instance: two graded quizzes and migration 0004 were retained.
- The full npm test attempt was limited to 180 seconds and is not green: legacy database benchmarks require writes below 5ms and reads below 2ms. Both profile benchmarks also failed on a clean origin/main checkout. The four performance cases are outside the 213 passing functional tests; thresholds were not changed. Regressions found in sidebar ordering and the Japanese page title were fixed and their existing tests pass.

All browser fixtures used temporary data and QA ports 17841/17842. Personal database,
Michi progress, exports and credentials are not part of this change.
