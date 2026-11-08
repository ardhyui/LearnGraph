# LearnGraph

**A Graph-Based Adaptive Education System** — Personalized tutoring that makes any LLM smarter about each specific learner.

[![Status](https://img.shields.io/badge/Status-Active%20Development-green)]()
[![Phase](https://img.shields.io/badge/Phase-5%20of%208-blue)]()

What comes next and why: see the [Roadmap](Roadmap.md).

---

## What Problem Does This Solve?

**Every learner is different, but most educational AI treats them the same.**

```
WITHOUT LearnGraph:
  User: "Explain linear equations"
  LLM: [Generic explanation, same for everyone]

WITH LearnGraph:
  User: "Explain linear equations"
  System retrieves: visual learner, struggles with "moving terms", high anxiety
  LLM: [Personalized explanation with diagrams, addresses their confusion, gentle tone]
```

LearnGraph is a **Graph RAG (Retrieval-Augmented Generation) knowledge base** that enables personalized education by providing any LLM with:

1. **Who the learner is** — 39 psychological dimensions, learning style, cognitive profile
2. **What they know** — Mastery levels, misconceptions, learning history
3. **What to learn next** — Zone of Proximal Development recommendations
4. **How to teach them** — Scaffolding strategies based on their psychometric profile

---

## Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| **Learner Profiles** | Store and manage learner data with full psychometric profiles | **Working** |
| **Knowledge Graph** | Concepts, prerequisites, Bloom's taxonomy, difficulty ratings | **Working** |
| **Progress Tracking** | Mastery levels (0-100%), misconceptions, review history | **Working** |
| **Lessons in the app** | `/learn/<concept>`: explanation, worked example and practice in the learner's preferred order, then the quiz; Today plans a session that fits the time available | **Working** (mathematics example subject) |
| **Tutor chat (bring your own key)** | Ask Claude on a lesson page with your own Anthropic API key; optional blind comparison with an answer that doesn't know you | **Working** (not yet tried against the live API here) |
| **AI drafts for teachers** | Curriculum (text, PDF or Word .docx) and quiz questions drafted by Claude with your own key; every draft is approved, edited or discarded before saving | **Working** (off by default; not yet tried against the live API here) |
| **Quiz Evidence** | Concepts with questions are learned and reviewed by short quizzes graded on the server; every answer, review and snooze is logged | **Working** |
| **Learning Style Derivation** | Automatically derive learning style from psychometric scores | **Working** |
| **Cognitive Profile Estimation** | Estimate working memory, attention span, processing speed | **Working** |
| **Graph Visualization** | Interactive view with mastery overlays and ZPD highlighting | **Working** |
| **Admin UI** | Full CRUD interface for all data management | **Working** |
| **"What should I learn next?"** | ZPD-based recommendations with scaffolding strategies | **Working** |
| **Knowledge Gap Detection** | Find missing, forgotten, or misconceived knowledge | **Working** |
| **Spaced Repetition** | Schedule reviews based on Ebbinghaus forgetting curve (SM-2) | **Working** |
| **Remediation Plans** | Auto-generated learning plans to address gaps | **Working** |
| **RAG Context Generation** | A ≤ 2000-token learner brief for any AI tutor, shown before it is copied ("Ask an AI tutor" on a lesson page); no LLM is called | **Working** (built-in tutor chat planned, Roadmap M4) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                 PostgreSQL (one workspace per account)                   │
│                                                                          │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐ │
│  │     LEARNER MODEL          │    │      KNOWLEDGE MODEL            │ │
│  │     (Graph A)              │    │      (Graph B)                  │ │
│  │                            │    │                                 │ │
│  │  • User Profiles           │    │  • Concept Nodes                │ │
│  │  • 39 Psychometric Domains │◄──►│  • Prerequisite Edges           │ │
│  │  • Knowledge States        │    │  • Related Concept Edges        │ │
│  │  • Learning History        │    │  • Bloom's Taxonomy Tags        │ │
│  │  • Misconceptions          │    │  • Difficulty Ratings (1-10)    │ │
│  │  • Derived Learning Style  │    │  • Learning Objectives          │ │
│  │  • Cognitive Profile       │    │  • Domain Classification        │ │
│  └─────────────────────────────┘    └─────────────────────────────────┘ │
│                           │                    │                        │
│                           └────────┬───────────┘                        │
│                                    │                                    │
│                          ┌─────────▼─────────┐                          │
│                          │   ZPD BRIDGE      │                          │
│                          │   (Computed)      │                          │
│                          │                   │                          │
│                          │ • Ready to learn  │                          │
│                          │ • Scaffolding     │                          │
│                          │ • Learning paths  │                          │
│                          └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 22.6+ (tests use `node --test --experimental-strip-types`)
- npm
- Optional: a PostgreSQL database. Without one, local dev uses embedded
  **PGlite** (Postgres compiled to WASM) automatically.

### Installation

```bash
git clone <repo-url>
cd LearnGraph
npm install

# optional: copy and edit env vars (see "Environment variables")
cp .env.example .env

npm run dev            # http://localhost:8080
```

Open http://localhost:8080, click **Create one** to sign up with email and
password. Every new account gets its own workspace seeded with demo data
(learners, concepts, prerequisites and knowledge states).

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Production | Postgres connection string (e.g. Neon / Vercel Postgres). Unset = embedded PGlite (local dev only). |
| `BETTER_AUTH_SECRET` | Production | Random secret (>= 32 chars) used to sign sessions. Generate with `openssl rand -hex 32`. Local dev falls back to a per-process random secret. |
| `BETTER_AUTH_URL` | Production | Public base URL of the app, e.g. `https://learngraph.vercel.app`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | No | Extra comma-separated origins allowed to call `/api/auth/*`. |
| `DATABASE_POOL_MAX` | No | Max Postgres connections per server instance (pg default 10; keep small on serverless). |
| `PGLITE_DATA_DIR` | No | Local dev only: directory to persist PGlite data (e.g. `.data/pglite`). Default is in-memory (reset on restart). |

Optional, for password reset and email confirmation: `RESEND_API_KEY` and
`EMAIL_FROM` (Resend's HTTP API, no extra dependency). Without them, `npm run
dev` prints the emails to the server log and production hides "Forgot your
password?".

`.env` is loaded automatically by `npm run dev`, `npm run build` and
`npm run preview` (via `scripts/with-app-env.mjs`); real environment
variables win.

### Database & migrations

The schema lives in `migrations/*.sql` (single source of truth):

- `0001_auth.sql` — Better Auth tables (`user`, `session`, `account`, `verification`)
- `0002_learngraph.sql` — LearnGraph tables (`learners`, `concepts`,
  `prerequisite_edges`, `related_edges`, `knowledge_states`, `graph_indexes`),
  every row scoped by `owner_id` (the signed-in account)
- `0003_rate_limit.sql` — counters for the auth rate limiter
- `0004_japanese.sql` — graded Japanese quiz sessions (`japanese_quizzes`)
- `0005_learning_evidence.sql` — quiz question banks per concept
  (`quiz_questions`), graded quiz attempts (`quiz_sessions`) and the
  append-only activity log (`learning_events`)
- `0006_content_items.sql` — lesson content per concept (`content_items`:
  explanations, worked examples, practice, links, videos) and the `lesson`
  event kind
- `0007_api_keys.sql` — read-only API keys (only a SHA-256 hash is stored)
- `0008_tutor_events.sql` — `tutor` events (questions asked, comparison choices; no question text)
- `0009_ai_draft_reviews.sql` — every AI draft and the person's decision on it

```bash
DATABASE_URL=postgres://… npm run db:migrate   # apply pending migrations
```

`npm run build` runs the migrator after `vite build`, so every Vercel deploy
applies new migrations. Applied files are recorded in `_migrations` and never
run twice. With PGlite (no `DATABASE_URL`) migrations apply on startup.

### Deploy (Vercel)

`vite.config.ts` builds with Nitro's `vercel` preset. Set `DATABASE_URL`,
`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in the Vercel project, keep the
build command `npm run build`. `vercel.json` sets the install command.

### Pages

- **Home Dashboard**: http://localhost:8080
- **My Profile**: http://localhost:8080/profile (39 psychometric domains)
- **Japanese study**: http://localhost:8080/japanese
- **Admin Panel**: http://localhost:8080/admin/learners
- **Recommendations**: http://localhost:8080/recommendations
- **Gap Analysis**: http://localhost:8080/gaps
- **Graph Visualization**: http://localhost:8080/graph
- **System Status**: http://localhost:8080/status
- **Functional Tests**: http://localhost:8080/tests
- **Sign in / sign up**: http://localhost:8080/sign-in

### Basic Usage (server-side)

The engine runs on the server. In the app, the browser calls it through the
`graphCall` server function (`src/server/graph.functions.ts`), always scoped
to the signed-in user. Server-side code can use it directly:

```typescript
import { graphForOwner } from '@/lib/graph/server';

const db = await graphForOwner(userId); // userId = verified Better Auth user id

// 1. Create a learner
await db.setLearnerProfile('student-001', {
  userId: 'student-001',
  name: 'Alice Chen',
  email: 'alice@example.com'
});

// 2. Update their psychometric profile (score 0-100, confidence 0-1)
await db.updatePsychometricScore('student-001', 'big_five_openness', 85, 0.9, 'assessment');

// 3. Derive their learning style automatically
const learner = await db.computeAndStoreLearningStyle('student-001');
// learner.learningStyle: { primary, secondary, socialPreference, pacePreference, feedbackPreference }

// 4. Build the knowledge graph
await db.addConcept({
  conceptId: 'arithmetic',
  name: 'Arithmetic',
  domain: 'mathematics',
  description: 'Addition, subtraction, multiplication, division',
  difficulty: { absolute: 2, cognitiveLoad: 0.2, abstractness: 0.1 },
  bloomObjectives: { remember: ['Recall times tables'], apply: ['Solve multi-digit sums'] },
});

await db.addConcept({
  conceptId: 'algebra',
  name: 'Algebra',
  domain: 'mathematics',
  description: 'Expressions and equations with variables',
  difficulty: { absolute: 4, cognitiveLoad: 0.5, abstractness: 0.6 },
  bloomObjectives: { understand: ['Explain what a variable is'], apply: ['Solve linear equations'] },
});

await db.addEdge({
  from: 'arithmetic',
  to: 'algebra',
  strength: 'required',
  reason: 'Arithmetic is essential for algebra',
});

// 5. Track learner progress
await db.setKnowledgeState('student-001', 'arithmetic', {
  mastery: 92,
  bloomLevel: 3,
  lastAssessed: new Date().toISOString(),
});

// 6. Ask what to learn next
const zpd = await db.computeZPD('student-001');
// zpd.recommendations[0].concept.conceptId === 'algebra'

// 7. Query prerequisites (up to 3 levels deep)
const prereqs = await db.getPrerequisiteChain('algebra', 3);
// Returns [{ concept, depth, edge }], here only arithmetic

// 8. Get all learner progress
const states = await db.getLearnerKnowledgeStates('student-001');
// Returns the mastery state of every concept this learner has started
```

---

## 39 Psychometric Domains

LearnGraph models learners across **39 psychological dimensions**, organized into 8 categories:

### Personality & Traits
| Domain | Educational Relevance |
|--------|----------------------|
| **Openness** | High: seeks novel approaches, creative tasks. Low: prefers familiar methods |
| **Conscientiousness** | High: structured learning, deadlines. Low: needs flexibility, reminders |
| **Extraversion** | High: group work, discussion. Low: independent study, written communication |
| **Agreeableness** | High: collaborative, avoids conflict. Low: debate-driven, critical analysis |
| **Neuroticism** | High: needs reassurance, low-pressure environments. Low: handles challenges well |

### Emotional Intelligence
| Domain | Educational Relevance |
|--------|----------------------|
| **Empathy** | Affects peer learning, group dynamics, humanities understanding |
| **Emotional Intelligence** | Impacts self-regulation, persistence, social learning |
| **Attachment Style** | Influences relationship with instructors and mentors |

### Cognitive Style
| Domain | Educational Relevance |
|--------|----------------------|
| **Learning Styles** | Visual, auditory, kinesthetic, reading preferences |
| **Information Processing** | Analytic vs. holistic processing of new material |
| **Metacognition** | Self-awareness of learning strategies and gaps |
| **Executive Functions** | Planning, inhibition, working memory for complex tasks |

### Motivation & Growth
| Domain | Educational Relevance |
|--------|----------------------|
| **Achievement Motivation** | Drive for mastery, response to challenges |
| **Self-Efficacy** | Confidence in ability to learn and succeed |
| **Growth Mindset** | Views on ability as fixed vs. developable |
| **Locus of Control** | Internal vs. external attribution of outcomes |

*...and 23 more domains including Decision Style, Risk Tolerance, Creativity, Cultural Values, and more.*

See [domain-reference.md](research/domain-reference.md) for complete definitions.

**Only 10 of the 39 domains currently affect the study plan:** openness,
conscientiousness, extraversion, neuroticism, `learning_styles`,
`information_processing`, `self_efficacy`, `cognitive_abilities`,
`executive_functions` and `metacognition`. The rest are stored but not read by
the engine.

---

## Admin UI Features

### My Profile Page (`/profile`)
The page leads with the learner's subjects and progress. Below that, an optional section holds all 39 psychometric domains in 8 categories; the categories the study plan reads come first.

**Data Entry Modes:**
| Mode | Description |
|------|-------------|
| **Just look** | View what is filled in so far |
| **Automatic** | Not offered until automatic adjustment is built (shown only to profiles that chose it earlier) |
| **Set it myself** | The learner sets values directly and LearnGraph never changes them |
| **Set, then adjust** | Not offered until automatic adjustment is built; earlier choices behave like "Set it myself" |
| **Take quizzes** | Short questionnaires work out the values and save them immediately |

**Domain Categories:**
- Big Five Personality (5 domains)
- Dark Triad (3 domains)
- Emotional & Social Intelligence (5 domains)
- Decision Making & Motivation (7 domains)
- Values & Wellbeing (6 domains)
- Cognitive & Learning Style (6 domains)
- Social & Cultural Context (5 domains)
- Sensory & Aesthetic Preferences (2 domains)

### Learner Management
- Create, edit, and delete learner profiles
- View and update psychometric domain scores
- Bulk psychometric profile updates
- Learning style and cognitive profile display

### Concept Management
- Add educational concepts with metadata
- Set difficulty ratings (1-10 scale)
- Assign Bloom's taxonomy levels
- Organize by domain (math, science, language, etc.)
- Set time estimates for learning

### Prerequisite Management
- Create prerequisite relationships between concepts
- Set relationship strength: `required`, `recommended`, `helpful`
- Add descriptions explaining the relationship

### Progress Tracking
- Track mastery levels (0-100%) per learner per concept
- Record current Bloom level achieved
- Log misconceptions
- Track assessment and review dates

### Graph Visualization
Interactive React Flow visualization with:

- **Node Colors by Mastery**:
  - 🟢 Green (≥80%): Mastered
  - 🟡 Yellow (40-79%): Partial mastery
  - 🔴 Red (<40%): Knowledge gap
  - ⚫ Gray: Not started
- **ZPD Highlighting**: Yellow border on concepts ready to learn
- **Due for review**: Orange highlight on concepts whose review has fallen due
- **Learner Overlay**: Select any learner to see their progress
- **MiniMap**: Navigate large concept graphs
- **Pan/Zoom**: Explore complex prerequisite chains

### Functional Tests
Built-in test runner that validates:
- Data persistence across restarts
- CRUD operations for all entities
- Psychometric derivation functions
- ZPD, gap analysis and review scheduling

---

## API Reference

### Learner Operations

```typescript
// Create/Update learner profile
await db.setLearnerProfile(userId: string, profile: Partial<LearnerProfile>)

// Get learner profile
const profile = await db.getLearnerProfile(userId: string)

// List all learners
const learners = await db.listLearnerProfiles()

// Delete learner
await db.deleteLearnerProfile(userId: string)
```

### Psychometric Operations

```typescript
// Update single domain score
await db.updatePsychometricScore(
  userId,
  'big_five_openness', // Canonical domain id
  75,                  // Score, 0-100
  0.9,                 // Confidence, 0-1
  'assessment'         // Where the score came from
)

// Bulk update multiple domains
await db.updatePsychometricScores(userId, {
  big_five_openness: { score: 80, confidence: 0.9 },
  big_five_conscientiousness: { score: 70, confidence: 0.85 }
})

// Derive learning style from psychometric scores
const { learningStyle } = await db.computeAndStoreLearningStyle(userId)
// learningStyle: { primary, secondary, socialPreference, pacePreference, feedbackPreference }

// Derive cognitive profile
const { cognitiveProfile } = await db.computeAndStoreCognitiveProfile(userId)
// cognitiveProfile: { workingMemoryCapacity, attentionSpan, processingSpeed, abstractThinking }
```

### Concept Operations

```typescript
// Add concept
await db.addConcept({
  conceptId: 'algebra',
  name: 'Algebra',
  domain: 'mathematics',
  description: 'Study of mathematical symbols and rules',
  difficulty: { absolute: 4, cognitiveLoad: 0.5, abstractness: 0.6 },
  bloomObjectives: { apply: ['Solve linear equations', 'Graph functions'] },
  timeEstimates: { introduction: 30, basicMastery: 180, deepMastery: 600 },
  tags: ['math', 'foundational']
})

// Get concept
const concept = await db.getConcept(conceptId: string)

// List all concepts
const concepts = await db.listConcepts()

// Search concepts
const results = await db.searchConcepts(query: string)

// Filter by domain
const mathConcepts = await db.listConceptsByDomain('mathematics')

// Filter by difficulty
const easyOnes = await db.listConceptsByDifficulty(1, 3)

// Filter by Bloom level
const advanced = await db.listConceptsByBloomLevel('analyze')
```

### Edge Operations

```typescript
// Add prerequisite edge
await db.addEdge({
  from: 'arithmetic',
  to: 'algebra',
  strength: 'required',  // 'required' | 'recommended' | 'helpful'
  reason: 'Must know arithmetic before algebra'
})

// Add related edge (non-prerequisite relationship)
await db.addRelatedEdge('algebra', 'geometry', 'complementary')

// Get prerequisite chain (with depth limit)
const chain = await db.getPrerequisiteChain(conceptId, 5)

// Get dependent chain (what requires this concept)
const dependents = await db.getDependentChain(conceptId, 5)
```

### Knowledge State Operations

```typescript
// Set knowledge state
await db.setKnowledgeState(userId, conceptId, {
  mastery: 85,              // 0-100
  bloomLevel: 3,            // 1-6 (Remember to Create)
  lastAccessed: new Date().toISOString(),
  lastAssessed: new Date().toISOString(),
  reviewCount: 5,
  misconceptions: []
})

// Get knowledge state
const state = await db.getKnowledgeState(userId, conceptId)

// Get all states for a learner
const allStates = await db.getLearnerKnowledgeStates(userId)

// Add misconception
await db.addMisconception(userId, conceptId, 'Confuses multiplication order', 'moderate')
```

### Database Statistics

```typescript
const stats = await db.getStats()
// Returns: { learnerCount: 42, conceptCount: 150, edgeCount: 300, stateCount: 2100 }
```

---

## Server API

The UI talks to the server through TanStack Start server functions, all
protected by `authMiddleware` (session cookie + same-site check). For AI
assistants and other tools there is a small **read-only** public API,
authenticated with a key created under My Profile → "Connect an AI assistant":

```bash
curl -H "Authorization: Bearer lg_…" "https://<host>/api/v1/learners"
curl -H "Authorization: Bearer lg_…" "https://<host>/api/v1/context?concept=Fractions&q=explain+adding+fractions"
# → { "learner", "concept", "queryType", "tokens", "context": "You are tutoring one learner…" }
```

Keys can only read the tutor brief (≤ 2000 tokens, no raw psychometric
scores) of their own account, are limited to 60 requests a minute, and stop
working as soon as they are revoked.


| Entry point | Description |
|-------------|-------------|
| `graphCall({ method, args })` | Runs one `EducationGraphDB` method (whitelist in `src/lib/graph/methods.ts`) against the caller's workspace |
| `seedDemoData()` | Seeds the demo dataset when the caller's workspace is empty, and the example quiz questions once |
| Evidence server functions | Concept quizzes graded on the server, the question bank editor, self-reports and the event log (`src/server/evidence.functions.ts`) |
| Lesson server functions | The lesson page data, the lesson content editor and the "lesson opened" event (`src/server/content.functions.ts`) |
| `getCurrentUser()` | Current session user (used by the route guard) |
| `/api/auth/*` | Better Auth endpoints (sign-up, sign-in, sign-out, session) |
| `/japanese` server functions | Quizzes graded on the server and practice logging (`src/server/japanese.functions.ts`) |
| `/api/japanese-backup` | Backup archive for the local Japanese workflow (see `docs/JAPANESE-LOCAL.md`) |

---

## Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Framework** | TanStack Start + TanStack Router (file routes) | 1.16x |
| **Build** | Vite + Nitro (Vercel preset) | 8 / 3 beta |
| **UI Library** | React | 19 |
| **Styling** | Tailwind CSS (`@tailwindcss/vite`) | 4 |
| **Database** | PostgreSQL via Kysely + `pg` (PGlite for dev/tests) | Kysely 0.28 |
| **Auth** | Better Auth (email + password) | 1.6 |
| **Validation** | Zod | 4 |
| **Graph Visualization** | @xyflow/react (React Flow) | 12 |
| **Animation** | framer-motion | 12 |
| **Icons** | lucide-react | 0.510 |
| **Testing** | `node --test` (+ Playwright smoke test) | Node 22+ |
| **Lint / Format** | ESLint 9 flat config + Prettier 3 | |

---

## Performance

`npm run test:perf` checks the median latency of 50 samples on on-disk PGlite.
The budgets catch large regressions; results depend on the machine, so this
suite is not part of `npm run ci`, and it does not describe a remote Postgres.

| Operation | Budget | Measured (one workstation, 2026-11-08) |
|-----------|--------|----------------------------------------|
| Learner write | < 100ms | 7-12ms |
| Learner read | < 30ms | 2-5ms |
| Concept write | < 100ms | 7-18ms |
| Concept read | < 30ms | 1-4ms |

Older figures of 0.1ms writes and 0.02ms reads came from the original LevelDB
store and no longer apply.

---

## Project Structure

```
LearnGraph/
├── migrations/                  # SQL schema (Better Auth + LearnGraph tables)
├── scripts/
│   ├── migrate.mjs              # applies migrations/ to DATABASE_URL
│   ├── migration-plan.mjs       # shared migration bookkeeping
│   ├── with-app-env.mjs         # loads .env for dev/build/preview
│   └── smoke.mjs                # Playwright smoke test (sign-up, pages, sign-in)
├── src/
│   ├── routes/                  # TanStack file routes (one file per page)
│   │   ├── __root.tsx           # HTML shell, auth guard, providers
│   │   ├── sign-in.tsx          # email/password sign-in & sign-up
│   │   ├── index.tsx, profile.tsx, graph.tsx, gaps.tsx, …
│   │   ├── learn.$conceptId.tsx # lesson page
│   │   ├── admin/               # learners, concepts, prerequisites, lesson content, quiz questions, states, psychometrics
│   │   └── api/auth/$.ts        # Better Auth handler
│   ├── server/                  # server functions (graphCall, seedDemoData, quizzes, getCurrentUser)
│   ├── lib/
│   │   ├── graph/
│   │   │   ├── education-graph-db.ts  # core engine: ZPD, gaps, SM-2, paths
│   │   │   ├── store.ts               # Postgres store (Kysely), owner-scoped
│   │   │   ├── spacing.ts                 # review intervals and forgetting curve
│   │   │   ├── types.ts, psychometrics.ts, seed.ts, methods.ts, server.ts
│   │   ├── auth/                # Better Auth server/client/middleware
│   │   ├── evidence/            # concept quizzes, mastery from evidence, event log
│   │   ├── content/             # lesson content, format preference, example lessons
│   │   ├── session.ts           # today's session plan (reviews, lessons, breaks)
│   │   ├── japanese/            # Japanese curriculum, questions, evidence rules
│   │   ├── db.ts                # Kysely: pg (DATABASE_URL) or PGlite
│   │   ├── DBContext.tsx        # React hooks (proxy to graphCall)
│   │   └── assessments.ts, demo-data.ts, theme.tsx, utils.ts
│   ├── components/              # Sidebar, AdminLayout, ui/*
│   └── styles.css               # Tailwind 4 theme + components
├── tests/                       # node --test suites (PGlite-backed)
│   └── perf/                    # latency guard (`npm run test:perf`)
├── Roadmap.md                   # direction and milestones
├── docs/                        # system overview, detailed backlog, Japanese setup
├── research/                    # original design docs (may describe the old LevelDB store)
├── vite.config.ts, eslint.config.mjs, .prettierrc, vercel.json
```

---

## Development Phases

| Phase | Description | Status |
|-------|-------------|--------|
| **Phase 1** | Core Database Foundation | **Complete** |
| **Phase 1.5** | Admin UI & Graph Visualization | **Complete** |
| **Phase 2** | Learner Model (39 Psychometric Domains) | **Complete** |
| **Phase 3** | Knowledge Model Enhancements | **Complete** |
| **Phase 4** | ZPD Engine | **Complete** |
| **Phase 5** | Knowledge Gap Analysis & Spaced Repetition | **Complete** |
| Phase 6 | Adaptive Content Delivery | Lessons and session plans done (Roadmap M2); AI curriculum and question drafts with your own key (M5) |
| Phase 7 | RAG Integration with LLMs | Tutor brief without an LLM, read-only API, and tutor chat with your own key (Roadmap M4) |
| Phase 8 | GNN Preparation (ML Export) | Future (Roadmap M7) |

**MVP = Phases 1-5** — Delivers personalized "what to learn next" recommendations with gap analysis and spaced repetition.

See [Roadmap.md](Roadmap.md) for the current order of work and [phases.md](research/phases.md) for detailed functional tests per phase.

---

## Key Educational Concepts

### Zone of Proximal Development (ZPD)

Based on Vygotsky's educational psychology framework:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│    ┌───────────────────────────────────────────────────────┐    │
│    │                                                       │    │
│    │    ┌─────────────────────────────────────────────┐   │    │
│    │    │                                             │   │    │
│    │    │     CURRENT KNOWLEDGE                       │   │    │
│    │    │     (Can do independently)                  │   │    │
│    │    │                                             │   │    │
│    │    └─────────────────────────────────────────────┘   │    │
│    │                                                       │    │
│    │         ZONE OF PROXIMAL DEVELOPMENT                 │    │
│    │         (Can do with scaffolding) ← TARGET HERE      │    │
│    │                                                       │    │
│    └───────────────────────────────────────────────────────┘    │
│                                                                  │
│              BEYOND REACH (Too advanced)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Bloom's Taxonomy

Each concept tracks objectives at 6 cognitive levels:

1. **Remember** — Recall facts and basic concepts
2. **Understand** — Explain ideas or concepts
3. **Apply** — Use information in new situations
4. **Analyze** — Draw connections among ideas
5. **Evaluate** — Justify decisions
6. **Create** — Produce new or original work

### Spaced Repetition

One memory model in `src/lib/graph/spacing.ts` drives both the review schedule and the forgetting curve:

- **Review intervals**: 1, 3, then 7 days, then growing exponentially up to 180 days. Weak mastery and harder concepts come back sooner.
- **Memory decay prediction**: `R = e^(-t/S)`, where stability `S` is derived from the review interval, so predicted retention at the due date is 80% of the mastery at the last review.
- **Priority**: "Review first" for unresolved misconceptions or reviews overdue by a full interval, otherwise "Review soon"; reviews that are not due yet are "Can wait".
- **Snooze**: a due review can be postponed by a day without changing progress.

### Knowledge Gap Analysis

Automatically detects and categorizes learning gaps:

| Gap Type | Detection Method | Remediation |
|----------|------------------|-------------|
| **Missing** | Prerequisites are met, but the concept has not been started | Learn from scratch with scaffolding |
| **Partial** | Mastery < 80% threshold | Targeted practice and reinforcement |
| **Forgotten** | Learned, and its review has fallen due | Spaced review with repetition |
| **Misconceptions** | Unresolved misconceptions list | Corrective instruction first |

**Engine methods** (called from the UI through `graphCall`):
- `detectGaps` — Detect all gap types for a learner
- `predictDecay` — Predict memory retention for a concept
- `scheduleNextReview` — Get the next review time
- `getReviewQueue` — Prioritized list of concepts to review
- `generateRemediationPlan` — Generate a step-by-step remediation plan

---

## Dependencies & Inputs

### Is a Fine-Tuned Model Required?

**NO.** LearnGraph works independently:

| System | Purpose | Required? |
|--------|---------|-----------|
| **LearnGraph** | Stores profiles + knowledge graph | **Yes (this project)** |
| Fine-Tuned Model | Analyzes text → infers personality | Optional |

### Ways to Get Psychometric Data

Available in the app today:

1. **Questionnaires** — The "Take quizzes" mode on My Profile
2. **User self-report** — The "Set it myself" mode on My Profile
3. **Defaults** — Everything works with no psychometric data at all

Possible sources that are not built yet:

4. **Fine-tuned model** — Analyze user's writing to infer traits
5. **Import from other systems** — LMS, CRM, assessment platforms
6. **Behavioral learning** — Refine values from study activity

### Minimum Required Inputs

| Input | Required? | Notes |
|-------|-----------|-------|
| User ID | **Yes** | Need to identify learners |
| Concepts | **Yes** | Need content in knowledge graph |
| Prerequisites | **Yes** | Core value - what comes before what |
| Psychometric scores | No | Works with defaults, better with data |
| Learning history | No | Builds over time |

---

## Testing

### CI (local, required before every merge)

There is no hosted CI (no GitHub Actions). The single gate is:

```bash
npm run ci                  # clean npm ci → typecheck → lint → tests → build → CSP check → Playwright smoke
npm run ci -- --no-install  # same, without the clean reinstall
```

It starts its own dev server on port 8081 (`CI_PORT` to change) with a fresh
in-memory PGlite database — `DATABASE_URL` from `.env` is ignored — and prints
a PASS/FAIL summary. The CSP check serves the production build on port 8083
(`CI_PREVIEW_PORT`) and fails if any inline script lacks the response's nonce;
the dev server still allows inline scripts, so the smoke test can't see this.
Every PR must show a green `npm run ci` before merging.

### Individual commands

```bash
npm test             # unit tests (node --test, embedded Postgres via PGlite)
npm run test:perf    # latency guard (not part of `npm run ci`, results depend on the machine)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . --max-warnings 0 (any warning fails)
npm run build:app    # vite build only (npm run build also runs migrations)

# end-to-end smoke test (needs a running server)
npm run dev &
npm run smoke        # BASE_URL=http://127.0.0.1:8081 npm run smoke for `npm run preview`
```

The in-app functional test runner is at http://localhost:8080/tests.

### Security: auth rate limiting

Sign-in is limited to 10 attempts per minute and sign-up to 5 per 10 minutes per
client IP (Better Auth's rate limiter, counters in the Postgres `rateLimit`
table so limits hold across serverless instances). Rules live in
`src/lib/auth/rate-limit.ts`.

---

## Educational Psychology References

1. **Vygotsky, L.S. (1978)** — Mind in Society: Zone of Proximal Development
2. **Bloom, B.S. (1956)** — Taxonomy of Educational Objectives
3. **Ebbinghaus, H. (1885)** — Memory: Forgetting Curve
4. **Bruner, J.S. (1966)** — Scaffolding Theory
5. **Kolb, D.A. (1984)** — Experiential Learning
6. **Gardner, H. (1983)** — Multiple Intelligences
7. **Dweck, C.S. (2006)** — Growth Mindset
8. **Mayer, R.E. (2009)** — Multimedia Learning Principles
9. **Bandura, A. (1977)** — Self-Efficacy Theory
10. **Costa, P.T. & McCrae, R.R. (1992)** — Big Five Personality Model

---

## Success Metrics

Learning outcomes have not been measured yet, because the app does not record
enough learning history. Recording it is milestone M1 in the
[Roadmap](Roadmap.md), which also defines the metrics.

| Metric | Target | Status |
|--------|--------|--------|
| Store latency | See [Performance](#performance) | Checked by `npm run test:perf` |
| ZPD computation | < 200ms | Not measured on production Postgres |
| Gap detection accuracy | 90% | Not measured |
| Retention at review time | 85% | Not measured |
| Learning efficiency | +30% time to mastery | Not measured |
| Personalization satisfaction | 75% | Not measured |

---

## Contributing

Contributions are welcome! Please:

1. Check the [Roadmap](Roadmap.md) for the active milestone
2. Review [docs/ROADMAP.md](docs/ROADMAP.md) for the detailed backlog and [phases.md](research/phases.md) for functional tests
3. Ensure `npm run ci` passes before submitting PRs
4. Follow the existing code patterns

---

## License

MIT License - See LICENSE file for details.

---

## Acknowledgments

This project is built on decades of educational psychology research and modern software engineering practices. Special thanks to the researchers whose work forms the theoretical foundation of this system.

## Japanese study workflow

`/japanese` provides an owner-scoped N5–N1 learning map, formative quizzes and practice logging. Optional workstation integration imports Michi kanji signals and exports consistent local backups. See [setup, limitations and QA](docs/JAPANESE-LOCAL.md); local sign-in is off by default and must only be enabled on a loopback-bound service.
