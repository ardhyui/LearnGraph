# LearnGraph

**A Graph-Based Adaptive Education System** — Personalized tutoring that makes any LLM smarter about each specific learner.

[![Status](https://img.shields.io/badge/Status-Active%20Development-green)]()
[![Phase](https://img.shields.io/badge/Phase-5%20of%208-blue)]()
[![Tests](https://img.shields.io/badge/Tests-37%2F37%20Passing-brightgreen)]()

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
| **Learning Style Derivation** | Automatically derive learning style from psychometric scores | **Working** |
| **Cognitive Profile Estimation** | Estimate working memory, attention span, processing speed | **Working** |
| **Graph Visualization** | Interactive view with mastery overlays and ZPD highlighting | **Working** |
| **Admin UI** | Full CRUD interface for all data management | **Working** |
| **"What should I learn next?"** | ZPD-based recommendations with scaffolding strategies | **Working** |
| **Knowledge Gap Detection** | Find missing, forgotten, or misconceived knowledge | **Working** |
| **Spaced Repetition** | Schedule reviews based on Ebbinghaus forgetting curve (SM-2) | **Working** |
| **Remediation Plans** | Auto-generated learning plans to address gaps | **Working** |
| **RAG Context Generation** | Augment LLM prompts with learner context | Planned (Phase 7) |

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

`.env` is loaded automatically by `npm run dev`, `npm run build` and
`npm run preview` (via `scripts/with-app-env.mjs`); real environment
variables win.

### Database & migrations

The schema lives in `migrations/*.sql` (single source of truth):

- `0001_auth.sql` — Better Auth tables (`user`, `session`, `account`, `verification`)
- `0002_learngraph.sql` — LearnGraph tables (`learners`, `concepts`,
  `prerequisite_edges`, `related_edges`, `knowledge_states`, `graph_indexes`),
  every row scoped by `owner_id` (the signed-in account)

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

// 2. Update their psychometric profile
await db.updatePsychometricScore('student-001', 'openness', {
  score: 0.85,
  confidence: 0.9,
  source: 'assessment'
});

// 3. Derive their learning style automatically
await db.computeAndStoreLearningStyle('student-001');
// Result: { primary: 'visual', secondary: 'kinesthetic', socialPreference: 'collaborative', ... }

// 4. Build the knowledge graph
await db.addConcept({
  conceptId: 'arithmetic',
  name: 'Arithmetic',
  domain: 'mathematics',
  difficulty: { overall: 2, cognitive: 2, timeEstimate: 120 },
  bloomLevels: ['remember', 'understand', 'apply']
});

await db.addConcept({
  conceptId: 'algebra',
  name: 'Algebra',
  domain: 'mathematics',
  difficulty: { overall: 4, cognitive: 4, timeEstimate: 300 },
  bloomLevels: ['remember', 'understand', 'apply', 'analyze']
});

await db.addEdge({
  from: 'arithmetic',
  to: 'algebra',
  strength: 'required',
  description: 'Arithmetic is essential for algebra'
});

// 5. Track learner progress
await db.setKnowledgeState('student-001', 'arithmetic', {
  mastery: 92,
  bloomLevel: 3,
  confidenceScore: 0.9,
  lastAssessed: new Date().toISOString()
});

// 6. Query prerequisites (up to 5 levels deep)
const prereqs = await db.getPrerequisiteChain('calculus', 3);
// Returns: arithmetic → algebra → pre-calculus → calculus

// 7. Get all learner progress
const states = await db.getLearnerKnowledgeStates('student-001');
// Returns array of all concept mastery levels for this learner
```

---

## 39 Psychometric Domains

LearnGraph models learners across **39 psychological dimensions**, organized into 12 categories:

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

See [Fine-Tuned-Psychometrics.md](research/Fine-Tuned-Psychometrics.md) for complete definitions.

---

## Admin UI Features

### My Profile Page (`/profile`)
The dedicated profile page displays all 39 psychometric domains organized into 8 intuitive categories:

**Data Entry Modes:**
| Mode | Description |
|------|-------------|
| **Auto-Discovery** | System infers values from user interactions and behavior |
| **Manual Entry** | User sets permanent values directly via sliders |
| **Adaptive** | User sets initial values, system adjusts based on interactions |
| **Assessment** | User takes psychological assessments to generate values |

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
- Log misconceptions and learning barriers
- Track confidence scores and assessment dates

### Graph Visualization
Interactive React Flow visualization with:

- **Node Colors by Mastery**:
  - 🟢 Green (≥80%): Mastered
  - 🟡 Yellow (40-79%): Partial mastery
  - 🔴 Red (<40%): Knowledge gap
  - ⚫ Gray: Not started
- **ZPD Highlighting**: Yellow border on concepts ready to learn
- **Forgotten Concepts**: Orange pulsing for concepts needing review
- **Learner Overlay**: Select any learner to see their progress
- **MiniMap**: Navigate large concept graphs
- **Pan/Zoom**: Explore complex prerequisite chains

### Functional Tests
Built-in test runner that validates:
- Data persistence across restarts
- CRUD operations for all entities
- Performance benchmarks
- Psychometric derivation functions

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
await db.updatePsychometricScore(userId, domain, {
  score: 0.75,        // 0-1 normalized
  confidence: 0.9,    // How confident in this score
  source: 'quiz',     // Where score came from
  timestamp: new Date().toISOString()
})

// Bulk update multiple domains
await db.updatePsychometricScores(userId, {
  openness: { score: 0.8, confidence: 0.9 },
  conscientiousness: { score: 0.7, confidence: 0.85 }
})

// Derive learning style from psychometric scores
const style = await db.computeAndStoreLearningStyle(userId)
// Returns: { primary, secondary, socialPreference, pacePreference, feedbackPreference }

// Derive cognitive profile
const cognitive = await db.computeAndStoreCognitiveProfile(userId)
// Returns: { workingMemoryCapacity, attentionSpan, processingSpeed, abstractThinkingLevel }
```

### Concept Operations

```typescript
// Add concept
await db.addConcept({
  conceptId: 'algebra',
  name: 'Algebra',
  domain: 'mathematics',
  description: 'Study of mathematical symbols and rules',
  difficulty: { overall: 4, cognitive: 4, timeEstimate: 300 },
  bloomLevels: ['remember', 'understand', 'apply', 'analyze'],
  tags: ['math', 'foundational'],
  learningObjectives: ['Solve linear equations', 'Graph functions']
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
  description: 'Must know arithmetic before algebra'
})

// Add related edge (non-prerequisite relationship)
await db.addRelatedEdge({
  from: 'algebra',
  to: 'geometry',
  relationship: 'complementary',
  strength: 0.7
})

// Get prerequisite chain (with depth limit)
const chain = await db.getPrerequisiteChain(conceptId, maxDepth: 5)

// Get dependent chain (what requires this concept)
const dependents = await db.getDependentChain(conceptId, maxDepth: 5)
```

### Knowledge State Operations

```typescript
// Set knowledge state
await db.setKnowledgeState(userId, conceptId, {
  mastery: 85,              // 0-100
  bloomLevel: 3,            // 1-6 (Remember to Create)
  confidenceScore: 0.9,     // 0-1
  lastPracticed: new Date().toISOString(),
  lastAssessed: new Date().toISOString(),
  reviewCount: 5,
  misconceptions: []
})

// Get knowledge state
const state = await db.getKnowledgeState(userId, conceptId)

// Get all states for a learner
const allStates = await db.getLearnerKnowledgeStates(userId)

// Add misconception
await db.addMisconception(userId, conceptId, {
  description: 'Confuses multiplication order',
  severity: 'medium',
  identified: new Date().toISOString()
})
```

### Database Statistics

```typescript
const stats = await db.getStats()
// Returns: { learners: 42, concepts: 150, edges: 300, states: 2100 }
```

---

## Server API

There is no public REST API; the UI talks to the server through TanStack
Start server functions, all protected by `authMiddleware` (session cookie +
same-site check):

| Entry point | Description |
|-------------|-------------|
| `graphCall({ method, args })` | Runs one `EducationGraphDB` method (whitelist in `src/lib/graph/methods.ts`) against the caller's workspace |
| `seedDemoData()` | Seeds the demo dataset when the caller's workspace is empty |
| `getCurrentUser()` | Current session user (used by the route guard) |
| `/api/auth/*` | Better Auth endpoints (sign-up, sign-in, sign-out, session) |

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
| **State** | Zustand (available, same as michi) | 5 |
| **Graph Visualization** | @xyflow/react (React Flow) | 12 |
| **Animation** | framer-motion | 12 |
| **Icons** | lucide-react | 0.510 |
| **Testing** | `node --test` (+ Playwright smoke test) | Node 22+ |
| **Lint / Format** | ESLint 9 flat config + Prettier 3 | |

---

## Performance

Achieved benchmarks (Phase 1 testing):

| Operation | Target | Actual |
|-----------|--------|--------|
| Write latency (PGlite, unit tests) | < 5ms | **passes** |
| Read latency (PGlite, unit tests) | < 2ms | **passes** |
| Data persistence | 100% | **100%** |
| Test coverage | 37/37 | **37/37 passing** (+1 owner-isolation test) |
| API response | < 500ms | **< 100ms** |
| Graph render (100 nodes) | < 1s | **< 500ms** |

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
│   │   ├── admin/               # learners, concepts, prerequisites, states, psychometrics
│   │   └── api/auth/$.ts        # Better Auth handler
│   ├── server/                  # server functions (graphCall, seedDemoData, getCurrentUser)
│   ├── lib/
│   │   ├── graph/
│   │   │   ├── education-graph-db.ts  # core engine: ZPD, gaps, SM-2, paths
│   │   │   ├── store.ts               # Postgres store (Kysely), owner-scoped
│   │   │   ├── types.ts, psychometrics.ts, seed.ts, methods.ts, server.ts
│   │   ├── auth/                # Better Auth server/client/middleware
│   │   ├── db.ts                # Kysely: pg (DATABASE_URL) or PGlite
│   │   ├── DBContext.tsx        # React hooks (proxy to graphCall)
│   │   └── assessments.ts, demo-data.ts, theme.tsx, utils.ts
│   ├── components/              # Sidebar, AdminLayout, ui/*
│   └── styles.css               # Tailwind 4 theme + components
├── tests/                       # node --test suites (PGlite-backed)
├── research/, docs/             # PRD and design docs
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
| Phase 6 | Adaptive Content Delivery | Planned |
| Phase 7 | RAG Integration with LLMs | Planned |
| Phase 8 | GNN Preparation (ML Export) | Future |

**MVP = Phases 1-5** — Delivers personalized "what to learn next" recommendations with gap analysis and spaced repetition.

See [phases.md](research/phases.md) for detailed functional tests per phase.

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

Based on the **Ebbinghaus forgetting curve** and **SM-2 algorithm** — optimal review scheduling to maximize retention with minimum effort.

**Implementation includes:**
- **Memory decay prediction**: `R = e^(-t/S)` where R is retention, t is time since review, S is stability factor
- **Adaptive stability**: Stability increases with review count, mastery level, and decreases with concept difficulty
- **Priority-based scheduling**: Reviews categorized as urgent, normal, or low priority
- **Optimal review windows**: Calculated timing to maximize long-term retention

### Knowledge Gap Analysis

Automatically detects and categorizes learning gaps:

| Gap Type | Detection Method | Remediation |
|----------|------------------|-------------|
| **Missing** | Concept has no knowledge state | Learn from scratch with scaffolding |
| **Partial** | Mastery < 80% threshold | Targeted practice and reinforcement |
| **Forgotten** | Predicted retention < 50% | Spaced review with repetition |
| **Misconceptions** | Unresolved misconceptions list | Corrective instruction first |

**API Endpoints:**
- `/api/gaps` — Detect all gap types for a learner
- `/api/decay` — Predict memory retention for a concept
- `/api/review-schedule` — Get optimal next review time
- `/api/review-queue` — Prioritized list of concepts to review
- `/api/remediation` — Generate step-by-step remediation plan

---

## Dependencies & Inputs

### Is a Fine-Tuned Model Required?

**NO.** LearnGraph works independently:

| System | Purpose | Required? |
|--------|---------|-----------|
| **LearnGraph** | Stores profiles + knowledge graph | **Yes (this project)** |
| Fine-Tuned Model | Analyzes text → infers personality | Optional |

### Ways to Get Psychometric Data

1. **Fine-tuned model** — Analyze user's writing to infer traits
2. **Traditional assessments** — Big Five quiz, learning style inventory
3. **Import from other systems** — LMS, CRM, assessment platforms
4. **Defaults + behavioral learning** — Start with defaults, refine over time
5. **User self-report** — "I'm a visual learner"

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
npm run ci                  # clean npm ci → typecheck → lint → tests → build → Playwright smoke
npm run ci -- --no-install  # same, without the clean reinstall
```

It starts its own dev server on port 8081 (`CI_PORT` to change) with a fresh
in-memory PGlite database — `DATABASE_URL` from `.env` is ignored — and prints
a PASS/FAIL summary. Every PR must show a green `npm run ci` before merging.

### Individual commands

```bash
npm test             # unit tests (node --test, embedded Postgres via PGlite)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .
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

| Metric | Target | Status |
|--------|--------|--------|
| Write latency | < 5ms | **Achieved (0.1ms)** |
| Read latency | < 2ms | **Achieved (0.02ms)** |
| Profile retrieval | < 10ms | **Achieved** |
| Graph traversal (depth 5) | < 100ms | **Achieved** |
| Test coverage | 100% | **37/37 passing** |
| Gap detection accuracy | 90% | **Achieved** |
| Retention rate | 85% at review time | **Implemented (SM-2)** |
| Learning efficiency | +30% time to mastery | Pending (Phase 7) |
| Personalization satisfaction | 75% | Pending (Phase 7) |

---

## Contributing

Contributions are welcome! Please:

1. Check the [CLAUDE.md](.claude/CLAUDE.md) for current progress and checklist
2. Review [phases.md](research/phases.md) for what's being built
3. Ensure tests pass before submitting PRs
4. Follow the existing code patterns

---

## License

MIT License - See LICENSE file for details.

---

## Acknowledgments

This project is built on decades of educational psychology research and modern software engineering practices. Special thanks to the researchers whose work forms the theoretical foundation of this system.
