# LearnGraph
## Psychometric-Adaptive Learning Intelligence

A personalized tutoring database that makes any LLM smarter about each specific user. LearnGraph combines psychometric profiling with educational psychology to deliver truly personalized learning experiences.

---

## Complete System Overview
Everything you need to understand how LearnGraph builds personalized learning paths automatically.

> **Status:** this overview mixes what is built with the product vision. Phases 1 to 5 are implemented; everything else is planned. See [Implementation Status](#implementation-status) and the [Roadmap](../Roadmap.md).

---

## What Is LearnGraph?

LearnGraph is a **Graph RAG (Retrieval-Augmented Generation) system** that transforms generic AI tutoring into deeply personalized education. Instead of giving everyone the same explanation, LearnGraph provides AI tutors with comprehensive context about each learner.

```
WITHOUT LearnGraph:
  User: "Explain linear equations"
  LLM: [Generic explanation, same for everyone]

WITH LearnGraph:
  User: "Explain linear equations"
  System retrieves: visual learner, struggles with "moving terms", high anxiety,
                    mastered arithmetic, partial algebra knowledge
  LLM: [Personalized explanation with diagrams, addresses their specific
        confusion, gentle encouraging tone, builds on what they already know]
```

### Key Value Propositions

| Feature | Description |
|---------|-------------|
| **"What should I learn next?"** | Compares your mastery against prerequisites to find optimal concepts |
| **Personalized explanations** (planned) | Gives LLMs your learning style, misconceptions, and preferences |
| **Gap detection** | Finds missing, forgotten, or misunderstood knowledge |
| **Spaced repetition** | Schedules reviews from a shared forgetting model |
| **Smart scaffolding** | Selects teaching strategies based on your psychometric profile |
| **Learning paths** | Generates custom roadmaps to any learning goal |

### Main Features: The Core Value

- **Personalized Learning Paths** — Every student gets a unique path based on what they know and how they learn
- **Psychometric Profiling** — Track 39 psychological domains to understand how each learner thinks
- **Prerequisite Intelligence** — Never learn something you're not ready for; always know what comes next
- **Gap Detection** — Automatically find missing knowledge, forgotten concepts, and misconceptions
- **Spaced Repetition** — Science-backed review scheduling using the Ebbinghaus forgetting curve
- **ZPD Engine** — Vygotsky's Zone of Proximal Development to find concepts that are challenging but achievable
- **AI Curriculum Ingestion** (planned) — Teachers describe a course in plain English, AI generates the knowledge graph
- **AI Assessment Generation** (planned) — Auto-generate quizzes and tests for each concept (toggle on/off)
- **RAG Context for LLMs** (planned) — Give any AI tutor rich context about the learner for personalized responses

---

## Quick Test: See the Value in 2 Minutes

There is no public REST API yet, so try it in the browser:

1. Run `npm install` and `npm run dev`, then open http://localhost:8080.
2. Click **Create one** and sign up. Every new account gets a workspace with example learners and concepts.
3. Under **Let's set up your learning plan**, enter your name, pick subjects and a starting point, then choose **Start learning**.
4. The **Today** panel shows **Learn next**, with concepts whose prerequisites you already meet. Reviews appear under **Review now** once they fall due. The example concepts have quiz questions, so you pass a short quiz (graded on the server) instead of marking them as known.
5. Open **Gap Analysis** (`/gaps`) to see what you have not started, are still learning, or should review, and where each mastery value came from (quiz or self-report).
6. Open **Knowledge Graph** (`/graph`) to see the concepts with your progress overlaid.
7. Choose **Open the lesson** on a "Learn next" concept: the mathematics examples have an explanation, a worked example and practice, then the quiz. Pick "Show first" to change the order.
8. Open **Manage data → Lesson Content** (`/admin/content`) or **Quiz Questions** (`/admin/questions`) to edit a concept's lesson or question bank.

---

## The Dual-Graph Architecture

LearnGraph uses a single database with two interconnected graphs:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                  PostgreSQL (one workspace per account)                  │
│                                                                          │
│  ┌─────────────────────────────┐    ┌─────────────────────────────────┐ │
│  │     LEARNER MODEL          │    │      KNOWLEDGE MODEL            │ │
│  │     (Graph A)              │    │      (Graph B)                  │ │
│  │                            │    │                                 │ │
│  │  • User Profiles           │    │  • Concept Nodes                │ │
│  │  • 39 Psychometric Scores  │◄──►│  • Prerequisite Edges           │ │
│  │  • Knowledge State         │    │  • Bloom's Taxonomy Tags        │ │
│  │  • Learning History        │    │  • Difficulty Ratings           │ │
│  │  • Misconceptions          │    │  • Learning Objectives          │ │
│  │  • Preferences             │    │  • Scaffolding Strategies       │ │
│  │                            │    │                                 │ │
│  └─────────────────────────────┘    └─────────────────────────────────┘ │
│                           │                    │                        │
│                           └────────┬───────────┘                        │
│                                    │                                    │
│                          ┌─────────▼─────────┐                          │
│                          │   ZPD BRIDGE      │                          │
│                          │   (Computed)      │                          │
│                          │                   │                          │
│                          │ Zone of Proximal  │                          │
│                          │ Development Engine│                          │
│                          └───────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How It Works: The Learning Pipeline

When you interact with LearnGraph, multiple systems work together automatically:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                          USER INTERACTION                                  │
│                                                                           │
│   "What should I learn next?"   "Explain this concept"   "I'm stuck"     │
│                    │                    │                     │           │
└────────────────────┼────────────────────┼─────────────────────┼───────────┘
                     │                    │                     │
                     ▼                    ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       CONTEXT RETRIEVAL                                    │
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐   │
│  │ Learner Profile │  │ Knowledge State │  │   ZPD Computation       │   │
│  │                 │  │                 │  │                         │   │
│  │ • Big Five      │  │ • Mastery %     │  │ • Ready concepts        │   │
│  │ • Learning      │  │ • Bloom Level   │  │ • Gap analysis          │   │
│  │   Style         │  │ • Last Access   │  │ • Prerequisites met     │   │
│  │ • Cognitive     │  │ • Decay Rate    │  │ • Scaffolding needed    │   │
│  │   Profile       │  │ • Misconceptions│  │                         │   │
│  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘   │
│           │                    │                       │                  │
│           └────────────────────┼───────────────────────┘                  │
│                                │                                          │
│                                ▼                                          │
│                    ┌───────────────────────┐                              │
│                    │   RAG CONTEXT         │                              │
│                    │   AGGREGATOR          │                              │
│                    │                       │                              │
│                    │   Combines learner    │                              │
│                    │   data + knowledge    │                              │
│                    │   graph + ZPD into    │                              │
│                    │   < 2000 tokens       │                              │
│                    └───────────┬───────────┘                              │
│                                │                                          │
└────────────────────────────────┼──────────────────────────────────────────┘
                                 │
                                 ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                       LLM AUGMENTED RESPONSE                               │
│                                                                           │
│   The AI tutor now knows:                                                 │
│   • Your learning style (visual/auditory/kinesthetic)                     │
│   • Your current mastery of relevant concepts                             │
│   • Your specific misconceptions to address                               │
│   • What scaffolding strategies work for you                              │
│   • What you should learn next                                            │
│                                                                           │
│   → Delivers personalized, context-aware response                         │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step: What Happens When You Ask "What Should I Learn Next?"

1. **Profile Retrieval** → System loads your 39 psychometric domain scores and learning preferences

2. **Knowledge State Scan** → Checks mastery level for all concepts you've studied

3. **Prerequisite Analysis** → For each concept you haven't mastered:
   - Counts how many prerequisites you've completed
   - Calculates "readiness score" (0-1)

4. **Psychometric Adjustment** → Modifies readiness based on your profile:

   | Your Profile | Effect on Recommendations |
   |--------------|---------------------------|
   | High anxiety | Lower readiness for difficult concepts |
   | High openness | Higher readiness for abstract concepts |
   | High conscientiousness | Ready for longer learning paths |

5. **Zone Partitioning** → Concepts are sorted into zones:

   ```
   ┌─────────────────────────────────────────────────────────────────────────┐
   │                                                                          │
   │    ┌───────────────────────────────────────────────────────────────┐    │
   │    │                                                               │    │
   │    │    ┌─────────────────────────────────────────────────────┐   │    │
   │    │    │                                                     │   │    │
   │    │    │    ┌───────────────────────────────────────────┐   │   │    │
   │    │    │    │                                           │   │   │    │
   │    │    │    │     MASTERED CONCEPTS                     │   │   │    │
   │    │    │    │     (Can do independently)                │   │   │    │
   │    │    │    │     Readiness > 0.8                       │   │   │    │
   │    │    │    │                                           │   │   │    │
   │    │    │    └───────────────────────────────────────────┘   │   │    │
   │    │    │                                                     │   │    │
   │    │    │         ZONE OF PROXIMAL DEVELOPMENT               │   │    │
   │    │    │         (Can learn with support)                   │   │    │
   │    │    │         Readiness 0.5 - 0.8  ← OPTIMAL TARGET      │   │    │
   │    │    │                                                     │   │    │
   │    │    └─────────────────────────────────────────────────────┘   │    │
   │    │                                                               │    │
   │    │              STRETCH ZONE                                     │    │
   │    │              (Challenging but achievable)                     │    │
   │    │              Readiness 0.3 - 0.5                              │    │
   │    │                                                               │    │
   │    └───────────────────────────────────────────────────────────────┘    │
   │                                                                          │
   │                    TOO HARD (Missing prerequisites)                      │
   │                    Readiness < 0.3                                       │
   │                                                                          │
   └─────────────────────────────────────────────────────────────────────────┘
   ```

6. **Scaffolding Selection** → Based on your profile, selects support strategies:

   | If You Are... | Scaffolding Strategy |
   |---------------|---------------------|
   | Visual learner | `VISUAL_REPRESENTATION` - diagrams, charts |
   | High cognitive complexity | `ANALOGY` - connect to known concepts |
   | Low working memory | `CHUNKING` - break into smaller pieces |
   | High extraversion | `PEER_DISCUSSION`, `COLLABORATIVE` |
   | High conscientiousness | `CHECKLIST`, `TEMPLATE` |
   | Low self-esteem | `WORKED_EXAMPLES`, `HINTS` |

7. **Path Generation** → Creates personalized learning path to your goals

---

## The 39 Psychological Domains

LearnGraph can store 39 psychological dimensions organized into 8 categories. Only 10 affect the study plan today: openness, conscientiousness, extraversion, neuroticism, `learning_styles`, `information_processing`, `self_efficacy`, `cognitive_abilities`, `executive_functions` and `metacognition`.

### Category A: Core Personality (Big Five) - NEO-PI-R Based

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `big_five_openness` | Openness | Receptivity to novel concepts, abstract thinking |
| `big_five_conscientiousness` | Conscientiousness | Self-discipline, goal persistence |
| `big_five_extraversion` | Extraversion | Preference for collaborative vs. solo learning |
| `big_five_agreeableness` | Agreeableness | Response to feedback, peer learning |
| `big_five_neuroticism` | Neuroticism | Stress response, anxiety management needs |

### Category B: Dark Personality - SD3 Based

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `dark_triad_narcissism` | Narcissism | Competitive learning, recognition needs |
| `dark_triad_machiavellianism` | Machiavellianism | Strategic approach to goals |
| `dark_triad_psychopathy` | Psychopathy | Risk-taking in learning challenges |

### Category C: Emotional/Social Intelligence

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `emotional_empathy` | Empathy | Peer learning, perspective-taking |
| `emotional_intelligence` | EQ | Self-regulation, emotional awareness |
| `attachment_style` | Attachment | Trust in learning relationships |
| `love_languages` | Love Languages | Preferred feedback/recognition style |
| `communication_style` | Communication (DISC) | Interaction pattern preferences |

### Category D: Decision Making & Motivation

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `risk_tolerance` | Risk Tolerance | Willingness to try new approaches |
| `decision_style` | Decision Style | Rational vs. intuitive learning |
| `time_orientation` | Time Orientation | Past, present, or future focus |
| `achievement_motivation` | Achievement | Need for accomplishment, goal-setting |
| `self_efficacy` | Self-Efficacy | Belief in own capabilities |
| `locus_of_control` | Locus of Control | Internal vs. external attribution |
| `growth_mindset` | Growth Mindset | Fixed vs. growth beliefs about ability |

### Category E: Values & Wellbeing

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `personal_values` | Values (Schwartz PVQ) | What content resonates |
| `interests` | Interests (RIASEC) | Career/interest alignment |
| `life_satisfaction` | Life Satisfaction | Overall engagement capacity |
| `stress_coping` | Stress Coping | Response to learning challenges |
| `social_support` | Social Support | Support network awareness |
| `authenticity` | Authenticity | Alignment with true self |

### Category F: Cognitive/Learning Styles

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `cognitive_abilities` | Cognitive Style | Verbal, numerical, spatial preferences |
| `creativity` | Creativity | Divergent thinking, originality |
| `learning_styles` | Learning Styles (VARK) | Visual, auditory, reading, kinesthetic |
| `information_processing` | Info Processing | Deep vs. shallow processing |
| `metacognition` | Metacognition | Awareness of own thinking |
| `executive_functions` | Executive Functions | Planning, inhibition, flexibility |

### Category G: Social/Cultural Values

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `social_cognition` | Social Cognition | Theory of mind, perspective-taking |
| `political_ideology` | Political Values | Worldview influence on learning |
| `cultural_values` | Cultural Values (Hofstede) | Individualism, power distance |
| `moral_reasoning` | Moral Reasoning (MFQ) | Ethical framework preferences |
| `work_career_style` | Career Style | Work values, career anchors |

### Category H: Sensory/Aesthetic

| Domain ID | Trait | Educational Relevance |
|-----------|-------|----------------------|
| `sensory_processing` | Sensory Sensitivity (HSP) | Stimulation tolerance |
| `aesthetic_preferences` | Aesthetic Preferences | Design/presentation preferences |

---

## Knowledge Gap Detection

LearnGraph continuously monitors for four types of knowledge gaps:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        GAP DETECTION ENGINE                                │
│                                                                           │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│   │    MISSING      │  │    PARTIAL      │  │      FORGOTTEN          │  │
│   │                 │  │                 │  │                         │  │
│   │  Never learned  │  │  Started but    │  │  Was mastered but       │  │
│   │  this concept   │  │  not mastered   │  │  memory has decayed     │  │
│   │                 │  │  (< 70%)        │  │                         │  │
│   │  Action:        │  │  Action:        │  │  Action:                │  │
│   │  Full teaching  │  │  Reinforcement  │  │  Quick refresh          │  │
│   └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
│                                                                           │
│                        ┌─────────────────────────┐                        │
│                        │     MISCONCEPTION       │                        │
│                        │                         │                        │
│                        │  Wrong mental model     │                        │
│                        │  needs correction       │                        │
│                        │                         │                        │
│                        │  Action:                │                        │
│                        │  Targeted correction    │                        │
│                        │  with counterexamples   │                        │
│                        └─────────────────────────┘                        │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘
```

### Forgetting Curve (Ebbinghaus)

LearnGraph predicts memory decay using the Ebbinghaus forgetting curve:

```
Retention = e^(-t/S) × 100%

Where:
  t = days since the last review
  S = stability, derived from the review interval
```

```
100% ┤████████████████████████████████████████████████████████████
     │███████████████
 80% ┤              ████████████
     │                         █████████
 60% ┤                                  ███████
     │                                        ██████
 40% ┤                                              █████
     │                                                   ████
 20% ┤                                                       ███
     │                                                          ██████████
  0% ┼───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬───→
     0       1       3       7      14      21      28      45      60   Days

     Illustrative curve. A review falls due when predicted retention reaches
     80% of the mastery at the last review (src/lib/graph/spacing.ts).
```

### Spaced Repetition

Intervals start at 1, 3 and 7 days, then grow exponentially up to 180 days. Weak mastery and harder concepts come back sooner. The example below assumes 85% mastery, before any adjustment for concept difficulty:

```
┌────────────────────────────────────────────────────────────────────────┐
│                    SPACED REPETITION SCHEDULE                          │
│                                                                        │
│   Initial Learning                                                     │
│         │                                                              │
│         ▼                                                              │
│   ┌─────────┐                                                          │
│   │ Day 0   │  First exposure                                          │
│   └────┬────┘                                                          │
│        │                                                               │
│        ▼                                                               │
│   ┌─────────┐                                                          │
│   │ Day 1   │  First review (if remembered → next in 3 days)           │
│   └────┬────┘                                                          │
│        │                                                               │
│        ▼                                                               │
│   ┌─────────┐                                                          │
│   │ Day 4   │  Second review (if remembered → next in 7 days)          │
│   └────┬────┘                                                          │
│        │                                                               │
│        ▼                                                               │
│   ┌─────────┐                                                          │
│   │ Day 11  │  Third review (if remembered → next in ~9 days)          │
│   └────┬────┘                                                          │
│        │                                                               │
│        ▼                                                               │
│   ┌─────────┐                                                          │
│   │ Day 20  │  Fourth review (if remembered → next in ~19 days)        │
│   └─────────┘                                                          │
│                                                                        │
│   Interval grows exponentially with successful reviews                 │
│   Resets to shorter interval if forgotten                              │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Bloom's Taxonomy Integration

Each concept is mapped across six cognitive levels:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        BLOOM'S TAXONOMY                                  │
│                                                                          │
│     Level 6: CREATE                                                      │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Design, construct, develop, formulate, synthesize                │ │
│     │ Example: "Model a real-world situation with linear equations"    │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                     │
│     Level 5: EVALUATE                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Evaluate, critique, justify, assess, defend, judge               │ │
│     │ Example: "Choose the best method for solving this system"        │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                     │
│     Level 4: ANALYZE                                                     │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Analyze, differentiate, organize, deconstruct, attribute         │ │
│     │ Example: "Determine if this equation is linear"                  │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                     │
│     Level 3: APPLY                                                       │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Apply, demonstrate, solve, use, implement, execute               │ │
│     │ Example: "Solve 3x + 5 = 20"                                     │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                     │
│     Level 2: UNDERSTAND                                                  │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Explain, describe, interpret, summarize, classify, compare       │ │
│     │ Example: "Explain why the graph is a straight line"              │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                    ▲                                     │
│     Level 1: REMEMBER                                                    │
│     ┌─────────────────────────────────────────────────────────────────┐ │
│     │ Define, list, recall, identify, name, recognize, reproduce       │ │
│     │ Example: "Define what a linear equation is"                      │ │
│     └─────────────────────────────────────────────────────────────────┘ │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

LearnGraph tracks which Bloom level you've achieved for each concept:
- **Current Level**: What you can do now
- **Target Level**: What you're working toward
- **Progression**: Moving up the hierarchy requires mastering lower levels first

---

## Scaffolding Strategies

Based on your psychometric profile, LearnGraph selects appropriate scaffolding:

### Cognitive Scaffolds

| Strategy | When Used | Implementation |
|----------|-----------|----------------|
| `CHUNKING` | Low working memory | Break content into smaller pieces |
| `ANALOGY` | High cognitive complexity | Connect to familiar concepts |
| `WORKED_EXAMPLES` | Low confidence, beginners | Step-by-step demonstrations |
| `VISUAL_REPRESENTATION` | Visual learners | Diagrams, charts, concept maps |

### Metacognitive Scaffolds

| Strategy | When Used | Implementation |
|----------|-----------|----------------|
| `SELF_EXPLANATION` | High analytical thinking | Prompt to explain reasoning |
| `PREDICTION` | Engagement building | "What do you think happens?" |
| `REFLECTION` | Consolidation | "What did you learn?" |

### Procedural Scaffolds

| Strategy | When Used | Implementation |
|----------|-----------|----------------|
| `CHECKLIST` | High conscientiousness | Step-by-step guides |
| `TEMPLATE` | Structure-seekers | Fill-in-the-blank frameworks |
| `HINTS` | Progressive support | Reveal hints one at a time |

### Social Scaffolds

| Strategy | When Used | Implementation |
|----------|-----------|----------------|
| `PEER_DISCUSSION` | High extraversion | Discussion prompts |
| `EXPERT_MODELING` | Visual/auditory learners | Watch expert demonstrations |
| `COLLABORATIVE` | Group-oriented learners | Pair/group activities |

---

## Data Architecture

LearnGraph stores JSON documents in PostgreSQL through Kysely, with embedded PGlite for local development and tests. The original ordered key schema lives on in each table's `key` column. Every row has an `owner_id`, so each account has an isolated workspace, and deleting the account cascades to its data.

| Table | Key pattern | Holds |
|-------|-------------|-------|
| `learners` | `learner:{userId}` | Learner profile and psychometric scores |
| `knowledge_states` | `state:{userId}:{conceptId}` | Mastery, review dates and misconceptions |
| `concepts` | `concept:{conceptId}` | Concept node: difficulty, Bloom objectives, domain |
| `prerequisite_edges` | `edge:prereq:{from}:{to}` | Prerequisite relationships |
| `related_edges` | `edge:related:{edgeId}` | Related concepts |
| `graph_indexes` | `index:*` | Secondary indexes the engine maintains |
| `japanese_quizzes` | `id` | Graded quiz sessions for `/japanese` |

The schema lives in `migrations/*.sql`. `npm run test:perf` guards store latency on PGlite.

---

## RAG Context Generation

**Status: planned (Roadmap M4).** `getRAGContext` does not exist yet.

When an LLM needs context about a learner, LearnGraph generates optimized RAG context:

```typescript
interface RAGContext {
  // Who is this learner?
  learnerProfile: {
    learningStyle: 'visual' | 'auditory' | 'kinesthetic' | 'reading';
    socialPreference: 'solo' | 'collaborative' | 'mixed';
    cognitiveProfile: {
      workingMemoryEstimate: number;
      attentionSpan: number;
      complexityTolerance: number;
    };
  };

  // What do they know?
  relevantKnowledgeStates: {
    conceptId: string;
    mastery: number;
    bloomLevel: number;
    lastAccessed: Date;
  }[];

  // What should they learn?
  zpd: {
    optimalConcepts: string[];
    scaffoldingNeeded: string[];
  };

  // What are they getting wrong?
  misconceptions: {
    concept: string;
    description: string;
    severity: 'minor' | 'moderate' | 'blocking';
  }[];

  // How should we teach them?
  recommendedScaffolding: ScaffoldingStrategy[];
}
```

**Token Budget**: < 2000 tokens to leave room for the response

---

## Traditional Assessment vs. LearnGraph

| Aspect | Traditional LMS | LearnGraph |
|--------|-----------------|------------|
| **Personalization** | Same content for everyone | Adapts pace, challenge and strategies to a psychometric profile |
| **Recommendations** | Fixed curriculum order | Dynamic ZPD-based paths |
| **Gap Detection** | Manual quizzes only | Continuous monitoring + decay prediction |
| **Scaffolding** | One-size-fits-all | Profile-matched strategies |
| **Review Scheduling** | Manual or none | Automated spaced repetition |
| **AI Integration** | Generic responses | Context-rich personalized tutoring (planned) |
| **Prerequisites** | Course sequences | Concept-level graph relationships |
| **Progress Tracking** | Completion % only | Bloom level + mastery + decay |

---

## Who Benefits?

Some of these depend on planned milestones in the [Roadmap](../Roadmap.md), including AI tutoring, class views and a public API.

### For Learners
- Get AI tutoring that actually knows you
- Never waste time on too-easy or too-hard content
- Automatically review at optimal times
- Receive explanations matched to your learning style

### For Educators
- Understand each student's psychometric profile
- See knowledge gaps across your class
- Get AI teaching assistant that adapts to students
- Focus human attention where it matters most

### For Developers
- Plug any LLM into a rich context layer
- Graph database for educational content
- Typed server functions for all operations, with a public API planned
- Extensible psychometric framework

### For Researchers
- Track learning effectiveness over time
- Correlate psychometrics with outcomes
- Export data for analysis
- Future GNN training support

---

## Quick Start

### 1. Store a Learner
```typescript
await db.setLearnerProfile('user-123', { name: 'Alice' });

await db.updatePsychometricScores('user-123', {
  big_five_openness: { score: 75, confidence: 0.8 },
  learning_styles: { score: 80, confidence: 0.9 },
});

// Derive the learning style and cognitive profile from the scores
await db.computeAndStoreDerivedProfiles('user-123');
```

### 2. Store Concepts with Prerequisites
```typescript
await db.addConcept({ conceptId: 'arithmetic', name: 'Basic Arithmetic', domain: 'mathematics' });
await db.addConcept({ conceptId: 'algebra', name: 'Algebraic Expressions', domain: 'mathematics' });

await db.addEdge({ from: 'arithmetic', to: 'algebra', strength: 'required' });
```

### 3. Track Progress
```typescript
await db.setKnowledgeState('user-123', 'arithmetic', {
  mastery: 90,
  bloomLevel: 4,
  lastAccessed: new Date().toISOString(),
});
```

### 4. Get Recommendations
```typescript
const zpd = await db.computeZPD('user-123');

// zpd.recommendations[0].concept.conceptId === 'algebra'
// zpd.recommendations[0].scaffoldingStrategies, .reasons, .estimatedMasteryTime
```

### 5. Get RAG Context for AI Tutor (planned, Roadmap M4)
```typescript
const context = await db.getRAGContext('user-123', 'explain algebra');

// Pass to LLM:
// "User is a visual learner with high anxiety. They've mastered
// arithmetic (90%) but struggle with word problems. Use diagrams
// and gentle tone. Address their confusion about 'moving terms'..."
```

---

## System Requirements

- **Runtime**: Node.js 22.6+
- **Database**: PostgreSQL via Kysely (embedded PGlite in local dev), originally LevelDB
- **Framework**: TanStack Start + Router on Vite 8, React 19, Better Auth

---

## Implementation Status

| Phase | Status | Description |
|-------|--------|-------------|
| 1 - Core Database | **DONE** | Persistent store and CRUD operations (now PostgreSQL) |
| 2 - Learner Model | **DONE** | 39 psychometric domains, profile management |
| 3 - Knowledge Model | **DONE** | Concept graph, prerequisites, Bloom's taxonomy |
| 4 - ZPD Engine | **DONE** | Zone computation, scaffolding selection |
| 5 - Gap Analysis | **DONE** | Gap detection, forgetting curve, spaced repetition |
| 6 - Content Delivery | Planned (Roadmap M1, M2, M5) | Adaptive content matching, curriculum and assessment generation |
| 7 - RAG Integration | Planned (Roadmap M4) | LLM context generation |
| 8 - GNN Preparation | Future (Roadmap M7) | Neural network training export |

**MVP Complete**: Phases 1-5 deliver personalized "what to learn next" with gap analysis.

---

## Educational Psychology References

1. **Vygotsky, L.S. (1978)** - Mind in Society: Zone of Proximal Development
2. **Bloom, B.S. (1956)** - Taxonomy of Educational Objectives
3. **Ebbinghaus, H. (1885)** - Memory: Forgetting Curve
4. **Bruner, J.S. (1966)** - Scaffolding Theory
5. **Costa & McCrae (1992)** - NEO-PI-R Big Five Personality Inventory
6. **Dweck, C.S. (2006)** - Growth Mindset
7. **Mayer, R.E. (2009)** - Multimedia Learning Principles
8. **SM-2 Algorithm** - SuperMemo Spaced Repetition (inspiration for the review intervals)

---

## API Reference

There is no public REST API yet. The UI calls TanStack Start server functions, each of which requires a signed-in session and only touches that account's data:

- `graphCall({ method, args })` - Runs one whitelisted `EducationGraphDB` method (`src/lib/graph/methods.ts`), with arguments validated in `src/lib/graph/rpc-schemas.ts`
- `seedDemoData()` - Seeds example data into an empty workspace, and the example quiz questions once
- Lesson functions (`src/server/content.functions.ts`) - `getLesson` (content in the learner's preferred order, prerequisites, how the concept is checked, the next step), `logLessonOpened`, and the lesson content editor
- Evidence functions (`src/server/evidence.functions.ts`) - `startConceptQuiz` / `submitConceptQuiz` (graded on the server), `recordStudyOutcome` (self-reports, snoozes), the question bank editor, and `getLearningStats` (retention at review time from the event log)
- `getCurrentUser()` - Returns the session user
- `/api/auth/*` - Better Auth endpoints

See [Complete API Reference](#complete-api-reference).

---

## How Psychometric Data is Gathered

**Status: research design, not implemented.** The text analysis below (see `research/Fine-Tuned-Psychometrics.md`) is not part of this repository. Today, profiles come from questionnaires and manual entry on My Profile.

The design describes a **three-signal hybrid approach** to building learner profiles:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PSYCHOMETRIC DATA GATHERING                           │
│                                                                          │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐ │
│  │   LIWC ANALYSIS    │  │ EMBEDDING SIMILARITY│  │   LLM DEEP        │ │
│  │   (20% weight)     │  │   (30% weight)      │  │   ANALYSIS        │ │
│  │                    │  │                     │  │   (50% weight)    │ │
│  │  Fast word-match   │  │  Semantic matching  │  │                   │ │
│  │  based on          │  │  to validated       │  │  Full semantic    │ │
│  │  linguistic        │  │  trait prototypes   │  │  understanding    │ │
│  │  markers           │  │                     │  │  via on-device AI │ │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘ │
│           │                        │                       │            │
│           └────────────────────────┼───────────────────────┘            │
│                                    │                                     │
│                                    ▼                                     │
│                    ┌───────────────────────────┐                        │
│                    │   COMBINED PROFILE        │                        │
│                    │   39 domain scores        │                        │
│                    │   with confidence levels  │                        │
│                    └───────────────────────────┘                        │
│                                                                          │
│  Alternative Data Sources:                                               │
│  • Traditional assessments (Big Five quiz, VARK, etc.)                  │
│  • Import from other systems (LMS, CRM, assessment platforms)           │
│  • User self-report ("I'm a visual learner")                            │
│  • Behavioral learning (start with defaults, refine over time)          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**No fine-tuned model required** — LearnGraph works without one.

---

## The Vision: Expert Perspectives

LearnGraph was evaluated by three expert perspectives, each bringing a unique lens:

### Engineering Focus (Execution & Speed)
> *"The core concept of combining psychometric profiling, a knowledge graph, and a ZPD engine is fundamentally sound and aligns with a first-principles approach to education."*

**Key insight**: The foundation is done—the real engineering happens in personalization. Move fast, build the simplest working version, then iterate.

### AI Research Focus (Mathematical Elegance)
> *"The true potential lies in whether the ZPD engine and Graph RAG can be rigorously defined as scalable, purely technical problems."*

**Key insight**: Every algorithm must be formalized, scalable, and empirically validated. The 39 psychological domains must become computationally tractable features. If successful, could advance AI's understanding of human cognition.

### Product Vision Focus (User Experience)
> *"LearnGraph has the seeds of something truly revolutionary. The complex engines must become invisible to users."*

**Key insight**: Users should feel *understood and effortlessly guided*, not "processed" by a system. The question to answer: **"What is the one thing the user *feels* when they interact with this?"**

---

## The Three Commandments

All decisions follow these guiding principles:

| Principle | Test | Application |
|-----------|------|-------------|
| **Move Fast** | Can we build it this week? | Prioritize shipping over perfection |
| **Mathematical Elegance** | Will it scale to 100K users? | Every algorithm must be O(n log n) or better |
| **Make Complexity Disappear** | Will users notice (in a bad way)? | Technical language becomes human language |

**Decision Framework:**
- *Should we add this feature?* → Does it ship faster? Is it mathematically sound? Does it simplify the experience?
- *Is this complexity justified?* → Does it block launch? Is Big-O acceptable? Can we hide it completely?

---

## Getting Learner Profiles Into the Graph: Psychometric Data

A critical question: **How does the system know about each learner's personality, learning style, and cognitive profile?**

### Four Ways to Populate the Learner Model

| Approach | Effort | Accuracy | Best For |
|----------|--------|----------|----------|
| **LLM Integration** (Primary) | None for user | High (continuous) | Production systems with AI tutoring |
| **Psychological Assessments** | ~30 min | Highest (validated) | Research, formal education |
| **Manual Entry** | ~5 min | Medium (self-report) | Quick setup, user control |
| **Behavioral Learning** | None | Grows over time | Cold start, implicit inference |

Today the app offers questionnaires and manual entry. LLM integration and behavioral learning are planned.

### Option 1: LLM Integration (Recommended for Production)

**Status: planned (Roadmap M4).** The `/api/learner-profile/update` endpoint below is a design sketch and does not exist yet.

**The Primary Use Case**: Connect LearnGraph to your AI tutor. The LLM periodically updates the learner model based on how the student interacts with the system.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    LLM-DRIVEN PROFILE UPDATES                            │
│                                                                          │
│  Student interacts with AI Tutor                                        │
│              │                                                           │
│              ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  LLM observes:                                                   │    │
│  │  • Response patterns (visual explanations work better)           │    │
│  │  • Struggle indicators (frustration, confusion markers)          │    │
│  │  • Learning speed (fast on math, slow on reading comprehension)  │    │
│  │  • Question types asked (wants examples vs. theory)              │    │
│  │  • Engagement patterns (short sessions, high frequency)          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│              │                                                           │
│              ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  LLM calls LearnGraph API:                                       │    │
│  │                                                                  │    │
│  │  POST /api/learner-profile/update                                │    │
│  │  {                                                               │    │
│  │    "userId": "user-123",                                         │    │
│  │    "updates": {                                                  │    │
│  │      "learning_styles": { "score": 75, "confidence": 0.6 },      │    │
│  │      "big_five_openness": { "score": 68, "confidence": 0.4 }     │    │
│  │    },                                                            │    │
│  │    "source": "llm_inference"                                     │    │
│  │  }                                                               │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│              │                                                           │
│              ▼                                                           │
│  Profile continuously improves → Better personalization → Better        │
│  learning outcomes → More data → Better profile (virtuous cycle)        │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**How to Implement:**
```typescript
// In your LLM tutor, periodically analyze the conversation and update the profile
const profileUpdate = await llm.analyze(`
  Based on this conversation, what can we infer about the learner's:
  - Learning style (visual/auditory/reading/kinesthetic)
  - Anxiety level when facing difficult problems
  - Openness to new concepts
  - Preferred pace

  Return as JSON with scores 0-100 and confidence 0-1.
`);

await fetch('/api/learner-profile/update', {
  method: 'POST',
  body: JSON.stringify({
    userId: currentUser.id,
    updates: profileUpdate,
    source: 'llm_inference'
  })
});
```

### Option 2: Psychological Assessments (Highest Accuracy)

For formal educational settings or research, use validated psychological instruments:

| Assessment | Domains Covered | Time | Confidence |
|------------|----------------|------|------------|
| **Big Five Inventory (BFI-44)** | Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism | 10 min | 0.9 |
| **VARK Questionnaire** | Visual, Auditory, Reading/Writing, Kinesthetic learning styles | 5 min | 0.8 |
| **Motivated Strategies for Learning (MSLQ)** | Self-efficacy, test anxiety, metacognition | 15 min | 0.85 |
| **Growth Mindset Scale** | Fixed vs. growth mindset | 3 min | 0.8 |
| **Test Anxiety Inventory** | Math anxiety, test anxiety | 5 min | 0.85 |

The instruments above are the design reference. The built-in quizzes are shorter.

**Built-in Assessment Flow:**
```
1. Open My Profile, then "How you like to learn", then choose "Take quizzes"
2. Pick a topic; each quiz shows its length
3. Answer on a 5-point agreement scale
4. Choose "Save my answers"; the scores are saved immediately
5. The learning style is recomputed and shown on the page
```

### Option 3: Manual Entry (Quick Setup)

Users or administrators can directly set psychometric scores:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    PROFILE PAGE - MANUAL ENTRY                           │
│                                                                          │
│  Learning Style                                 [Visual ▼]               │
│                                                                          │
│  How do you prefer to learn?                                            │
│  ○ Watching videos and diagrams (Visual)                                │
│  ○ Listening to explanations (Auditory)                                 │
│  ○ Reading text and taking notes (Reading)                              │
│  ● Hands-on practice (Kinesthetic)                                      │
│                                                                          │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                          │
│  Anxiety Level (when learning new things)                               │
│  Low ─────────●───────────────────────────────────────────── High       │
│              30                                                         │
│                                                                          │
│  Openness to Abstract Concepts                                          │
│  Low ───────────────────────────●─────────────────────────── High       │
│                                70                                       │
│                                                                          │
│  [Save Profile]                                                          │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**When to Use:**
- Quick onboarding ("I know I'm a visual learner")
- User wants control over their profile
- Teacher setting up student profiles based on observations
- Testing/development

### Option 4: Behavioral Learning (Start from Defaults)

**Status: planned.** Learning history is not recorded yet (Roadmap M1), so values do not change from behavior today.

Start with default/neutral values and let the system learn from behavior:

```typescript
// Default profile (all neutral)
const defaultProfile = {
  learning_styles: { score: 50, confidence: 0.1 },
  big_five_openness: { score: 50, confidence: 0.1 },
  big_five_neuroticism: { score: 50, confidence: 0.1 },
  // ... all 39 domains at 50 with low confidence
};

// As user interacts, system infers and updates:
// - Completes visual content faster → increase visual learning score
// - Avoids hard challenges → may indicate higher anxiety or lower risk tolerance
// - Asks lots of "why" questions → increase openness score
```

**Confidence Grows Over Time:**
```
Day 1:  learning_styles = { score: 50, confidence: 0.1 }  (default)
Day 7:  learning_styles = { score: 62, confidence: 0.3 }  (some signal)
Day 30: learning_styles = { score: 71, confidence: 0.6 }  (clearer pattern)
Day 90: learning_styles = { score: 75, confidence: 0.8 }  (high confidence)
```

### Hybrid Approach (Recommended)

**Status: design target.**

Combine multiple sources for the best results:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-SOURCE PROFILE BUILDING                         │
│                                                                          │
│  Priority 1: Validated Assessments (if taken)                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Big Five from BFI-44: confidence = 0.9                          │    │
│  │  These scores are "locked" unless user retakes assessment        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              +                                           │
│  Priority 2: User Self-Report (manual entry)                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  "I'm a visual learner" → learning_styles.visual: confidence 0.7 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              +                                           │
│  Priority 3: LLM Inference (ongoing)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Updates domains not covered by assessments or self-report       │    │
│  │  Lower confidence (0.3-0.6), but continuous improvement          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              +                                           │
│  Priority 4: Behavioral Defaults (fill gaps)                            │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Any domain without data starts at 50 with confidence 0.1        │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              =                                           │
│                    COMPLETE 39-DOMAIN PROFILE                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Engine Methods for Profile Management

Called through `graphCall`:

| Method | Purpose |
|--------|---------|
| `getLearnerProfile` | Retrieve the full profile |
| `setLearnerProfile` | Create or update a profile |
| `updatePsychometricScore`, `updatePsychometricScores` | Update one or several scores |
| `computeAndStoreDerivedProfiles` | Recompute learning style and cognitive profile |
| `deleteLearnerProfile` | Delete a learner and their progress |

### Configuration Modes

| Mode on My Profile | Behavior today |
|--------------------|----------------|
| **Just look** | View what is filled in |
| **Automatic** | Selectable, but values do not change yet because inference is not built |
| **Set it myself** | The learner sets values, and the system never changes them |
| **Set, then adjust** | Behaves like "Set it myself" until inference is built |
| **Take quizzes** | Scores come from questionnaires |

---

## Getting Content Into the Graph: Teacher Workflow

A critical question for educators: **How do I get my curriculum into the system?**

### Current State: Manual Entry

Today, teachers would manually define everything through the Admin UI:

1. **Add each concept** via the concept form (name, difficulty 1-10, domain, Bloom level)
2. **Define prerequisites** by connecting concepts (e.g., "algebra" requires "arithmetic")
3. **Set relationships** between related concepts

This is tedious for a full course. A machine learning class might have 50-100 concepts with complex prerequisite chains.

### AI-Assisted Curriculum Ingestion (Phase 6)

**Status: planned (Roadmap M5).**

The system will support AI-powered graph generation from course materials:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AI-ASSISTED GRAPH GENERATION                          │
│                                                                          │
│  Teacher Input:                                                          │
│  "I'm teaching an intro ML course. Topics include:                       │
│   - Linear regression                                                    │
│   - Logistic regression                                                  │
│   - Decision trees                                                       │
│   - Neural networks basics"                                              │
│                                                                          │
│  AI Generates:                                                           │
│  ├── linear_algebra (prerequisite, difficulty: 4)                        │
│  │   └── vectors_matrices (prerequisite, difficulty: 3)                  │
│  ├── statistics_basics (prerequisite, difficulty: 3)                     │
│  ├── linear_regression (difficulty: 5)                                   │
│  │   ├── requires: linear_algebra, statistics_basics                     │
│  ├── logistic_regression (difficulty: 6)                                 │
│  │   ├── requires: linear_regression                                     │
│  ├── decision_trees (difficulty: 5)                                      │
│  │   ├── requires: statistics_basics                                     │
│  ├── neural_networks_basics (difficulty: 7)                              │
│  │   ├── requires: linear_regression                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Three Approaches to Curriculum Entry

| Approach | Teacher Effort | Quality | Best For |
|----------|----------------|---------|----------|
| **Manual Entry** | High | Highest (expert curated) | Small courses, precise control |
| **AI from Syllabus** | Low | Medium (needs review) | Quick setup, large courses |
| **Hybrid** | Medium | High (AI draft → teacher refines) | **Recommended** |

### The Hybrid Workflow (Recommended)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HYBRID CURRICULUM INGESTION                           │
│                                                                          │
│  Step 1: TEACHER INPUT                                                   │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Upload syllabus, lesson plans, textbook chapters, or just       │    │
│  │  describe: "I'm teaching intro data analytics covering Excel,    │    │
│  │  SQL basics, Python pandas, and data visualization"              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Step 2: AI GENERATES DRAFT GRAPH                                        │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Identifies concepts and their Bloom levels                    │    │
│  │  • Infers prerequisite relationships                             │    │
│  │  • Estimates difficulty ratings                                  │    │
│  │  • Suggests related concepts students might need                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Step 3: TEACHER REVIEWS IN VISUAL GRAPH UI                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Drag nodes to adjust relationships                            │    │
│  │  • Click to edit difficulty levels                               │    │
│  │  • Add missing prerequisites                                     │    │
│  │  • Remove incorrect connections                                  │    │
│  │  • Approve or modify AI suggestions                              │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                              │                                           │
│                              ▼                                           │
│  Step 4: SYSTEM LEARNS FROM CORRECTIONS                                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  • Improves future suggestions based on teacher feedback         │    │
│  │  • Builds domain-specific pattern recognition                    │    │
│  │  • Creates reusable curriculum templates                         │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Supported Input Formats

| Input Type | What AI Extracts |
|------------|------------------|
| **Syllabus (PDF/Word)** | Course topics, learning objectives, weekly schedule |
| **Textbook chapters** | Concept hierarchy, difficulty progression |
| **Lesson plans** | Specific skills, prerequisites mentioned |
| **Learning objectives** | Bloom's taxonomy levels, measurable outcomes |
| **Plain text description** | Topic list, inferred relationships |
| **Existing curriculum standards** | State standards, AP frameworks, etc. |

### Example: Math Teacher Workflow

```
Teacher types:
"I teach Algebra 1 to 9th graders. We cover:
- Solving one-step equations
- Solving two-step equations
- Graphing linear equations
- Systems of equations
- Intro to quadratics"

AI generates graph with 15 nodes:
├── number_operations (prerequisite, diff: 2)
├── order_of_operations (prerequisite, diff: 3)
├── variables_and_expressions (diff: 3)
├── one_step_equations (diff: 4)
│   └── requires: variables_and_expressions
├── two_step_equations (diff: 5)
│   └── requires: one_step_equations
├── coordinate_plane (diff: 4)
├── graphing_linear_equations (diff: 6)
│   └── requires: two_step_equations, coordinate_plane
├── systems_of_equations (diff: 7)
│   └── requires: graphing_linear_equations
├── intro_to_quadratics (diff: 6)
│   └── requires: two_step_equations
...

Teacher reviews in graph UI:
- "Actually, graphing_linear_equations should require slope concept"
- Adds "slope" node between coordinate_plane and graphing
- Adjusts difficulty of systems_of_equations from 7 to 8
- Approves the rest

Final graph saved with teacher's expert refinements.
```

### AI-Generated Assessments (Optional Feature)

**Status: planned (Roadmap M1 for graded quizzes, M5 for AI generation).**

When curriculum is imported, the system can **optionally** generate assessments to measure mastery. This feature includes a **toggle switch** to enable/disable it.

#### Assessment Types

| Type | Questions | Purpose | When Used |
|------|-----------|---------|-----------|
| **Quick Check** | 2-3 | Gate progression | Before marking concept "complete" |
| **Mastery Test** | 5-10 | Determine mastery % | After studying concept content |
| **Misconception Probe** | 3-5 | Detect wrong mental models | When errors indicate confusion |
| **Spaced Review** | 2-3 | Verify retention | During spaced repetition reviews |

#### Question Types Supported

| Type | Example |
|------|---------|
| `multiple_choice` | "What is 2x when x=3?" A) 5 B) 6 C) 8 D) 9 |
| `numeric` | "Solve: 3x + 5 = 14. x = ___" |
| `short_answer` | "Define what a linear equation is." |
| `worked_problem` | "Solve step by step: 2x + 3 = 7" |
| `classification` | "Drag each expression to: Linear / Non-linear" |
| `ordering` | "Order the steps for solving this equation" |

#### Toggle Configuration

```typescript
interface AssessmentConfig {
  enabled: boolean;                    // Master toggle (ON/OFF)
  generateOnCurriculumImport: boolean; // Auto-generate when importing
  generateOnConceptCreate: boolean;    // Auto-generate for single concepts
  quickCheckRequired: boolean;         // Must pass to proceed
  masteryThreshold: number;            // % needed to pass (default: 70)
}
```

#### How It Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    ASSESSMENT TOGGLE & FLOW                              │
│                                                                          │
│  Settings: Assessments [ON ✓]                                           │
│                                                                          │
│  When enabled:                                                           │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  1. Teacher imports curriculum                                   │    │
│  │  2. AI generates concepts + prerequisites                        │    │
│  │  3. AI generates Quick Check + Mastery Test for each concept     │    │
│  │  4. Teacher reviews questions (edit/delete/add)                  │    │
│  │  5. Students take assessments → mastery % calculated             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  When disabled:                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │  Concepts created without assessments.                           │    │
│  │  Mastery tracked via self-report or time-on-task.                │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Assessment Impact on System

| Event | System Update |
|-------|---------------|
| Quick Check **passed** | Concept marked complete, unlock next concepts |
| Quick Check **failed** | Flag for review, suggest re-engagement |
| Mastery Test completed | Update `knowledgeState.mastery` with exact % |
| Misconception detected | Add to learner profile for targeted help |
| Spaced review passed | Extend review interval (3 days → 7 days) |
| Spaced review failed | Reset interval, add to priority queue |

---

## Future Vision: Complete System

### Phase 6: Adaptive Content Delivery, AI Curriculum Ingestion & Assessments
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CONTENT MATCHING ENGINE                               │
│                                                                          │
│  For each learner + concept combination:                                │
│                                                                          │
│  1. scoreContentMatch()     → Find best-fit learning materials          │
│  2. buildSessionPlan()      → Structure optimal learning session        │
│  3. determinePresentationStrategy() → Visual? Audio? Interactive?       │
│  4. Adaptive pacing         → Speed up or slow down based on response   │
│  5. Break recommendations   → Cognitive load management                 │
│                                                                          │
│  Target: 70% content match satisfaction, 80% session completion         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    AI CURRICULUM INGESTION ENGINE                        │
│                                                                          │
│  For teachers adding new courses:                                        │
│                                                                          │
│  1. parseCurriculumInput()   → Extract topics from syllabus/text        │
│  2. inferPrerequisites()     → AI determines concept dependencies       │
│  3. estimateDifficulty()     → Rate concepts 1-10 based on complexity   │
│  4. generateBloomLevels()    → Map to Remember/Understand/Apply/etc.    │
│  5. presentForReview()       → Show draft graph for teacher approval    │
│  6. learnFromCorrections()   → Improve future suggestions               │
│                                                                          │
│  Target: 80% of AI-generated edges approved, < 5 min to full course     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    AI ASSESSMENT GENERATION ENGINE                       │
│                                                                          │
│  For measuring actual mastery (toggle-enabled):                         │
│                                                                          │
│  1. generateAssessments()       → Create questions from Bloom levels    │
│  2. generateQuickCheck()        → 2-3 gating questions                  │
│  3. generateMasteryTest()       → 5-10 questions for mastery %          │
│  4. generateMisconceptionProbes()→ Detect wrong mental models           │
│  5. submitAssessment()          → Update knowledge state automatically  │
│                                                                          │
│  Target: 80% AI questions approved, < 2 min teacher review per concept  │
│                                                                          │
│  Toggle: [ON/OFF] - Assessments can be disabled for self-paced mode     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 7: RAG Integration (LLM Augmentation)
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    RAG CONTEXT PIPELINE                                  │
│                                                                          │
│  1. getRAGContext(userId, query)                                        │
│     │                                                                   │
│     ├─► Query-type detection (explanation? practice? review?)           │
│     │                                                                   │
│     ├─► Context aggregation                                             │
│     │   • Learner profile summary                                       │
│     │   • Relevant knowledge states                                     │
│     │   • Active misconceptions                                         │
│     │   • Recommended scaffolding                                       │
│     │                                                                   │
│     ├─► Prompt augmentation with templates                              │
│     │                                                                   │
│     └─► Context optimization (< 2000 tokens)                            │
│                                                                          │
│  Target: Context retrieval < 150ms, 80% feel responses are personalized │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Phase 8: GNN Preparation (Machine Learning)
```
┌─────────────────────────────────────────────────────────────────────────┐
│                    NEURAL NETWORK TRAINING EXPORT                        │
│                                                                          │
│  Learner Features (16-dimensional vector):                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [openness, conscientiousness, extraversion, agreeableness,      │   │
│  │  neuroticism, anxiety, risk_tolerance, growth_mindset,          │   │
│  │  self_efficacy, learning_style_visual, learning_style_auditory, │   │
│  │  learning_style_kinesthetic, metacognition, executive_functions,│   │
│  │  working_memory_estimate, attention_span]                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Concept Features (13-dimensional vector):                              │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ [difficulty_overall, difficulty_cognitive, bloom_level,         │   │
│  │  prerequisite_count, dependent_count, domain_embedding...,      │   │
│  │  avg_time_to_master, common_misconception_count]                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Export format: PyTorch Geometric compatible                            │
│  Validation: All features in [0,1], no NaN values                       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How to Prove It Works

This is the acceptance scenario for personalization. `tests/profile-traits.test.ts` covers the part already built, where profile traits change pace, challenge and strategies.

### The "Different Users, Different Results" Test

Create two learners with opposite profiles:

| Learner A: "Anxious Visual Learner" | Learner B: "Confident Analytical Learner" |
|-------------------------------------|-------------------------------------------|
| Test Anxiety: 90% | Test Anxiety: 10% |
| Openness: 30% | Openness: 90% |
| Learning Style: Visual | Learning Style: Reading/Writing |
| Risk Tolerance: 20% | Risk Tolerance: 80% |
| Self-Efficacy: 25% | Self-Efficacy: 90% |

**With identical knowledge states**, the system produces:

| Output | Learner A (Anxious) | Learner B (Confident) |
|--------|--------------------|-----------------------|
| ZPD Size | Smaller (fewer ready concepts) | Larger (more challenges) |
| Scaffolding | Visual aids, chunking, encouragement | Complex explanations, independent study |
| Learning Path | Smaller steps, more reviews | Larger leaps, fewer reviews |
| Difficulty Curve | Gradual, confidence-building | Steeper, challenge-seeking |

**Pass criteria**: Clear, measurable differences in ALL outputs.

---

## Success Metrics

### Technical Performance

| Metric | Target | Status |
|--------|--------|--------|
| Store write | < 100ms median | Checked by `npm run test:perf` on PGlite |
| Store read | < 30ms median | Checked by `npm run test:perf` on PGlite |
| ZPD computation | < 200ms | Not measured on production Postgres |

### Algorithm Accuracy

These are targets. None has been measured yet.

| Metric | Target |
|--------|--------|
| ZPD classification | 90% concepts in correct zone |
| Gap detection | 90% true positive rate |
| Forgotten detection | 85% based on decay formula |
| Retention at review | 85% post-review mastery |

### User Experience (Phase 7+)

| Metric | Target |
|--------|--------|
| Recommendation relevance | 75%+ feel "personalized to them" |
| Simplicity | 90%+ can explain what system does in one sentence |
| Emotional resonance | Described as "helpful," "understanding," or "magical" |
| Time to first recommendation | < 5 minutes from signup |

---

## Magic Moments

LearnGraph creates specific moments where users realize the system truly knows them:

1. **The "How did it know?" moment** — When the first recommendation addresses a struggle they never explicitly mentioned

2. **The "Finally, someone understands" moment** — When explanations match their learning style perfectly

3. **The "That's exactly what I needed" moment** — When scaffolding strategies feel intuitive, not prescribed

4. **The "I'm actually learning" moment** — When spaced repetition surfaces forgotten concepts at the perfect time

5. **The "I feel seen" moment** — When the system's assessment of their strengths/challenges matches their self-perception

---

## Privacy & Trust

Current state:

- **Isolation** — Each account's data is scoped by `owner_id`
- **Optional profile** — The study plan works without psychometric data
- **User control** — Scores can be edited on My Profile, and learners can be deleted in Manage data
- **Transparency** — Recommendations show their reasons

Not built yet (Roadmap M3): consent for sensitive domains, account deletion in the UI, data export and import, and a privacy policy.

---

## Complete API Reference

There is no public REST API yet. These are the `EducationGraphDB` methods the browser can call through `graphCall` (`src/lib/graph/methods.ts`).

### Core Methods

| Area | Methods |
|------|---------|
| Learners | `listLearnerProfiles`, `getLearnerProfile`, `setLearnerProfile`, `deleteLearnerProfile` |
| Psychometrics | `getPsychometricScores`, `updatePsychometricScore`, `updatePsychometricScores`, `computeAndStoreLearningStyle`, `computeAndStoreCognitiveProfile`, `computeAndStoreDerivedProfiles` |
| Concepts | `listConcepts`, `getConcept`, `addConcept`, `deleteConcept`, `searchConcepts`, `listConceptsByDomain`, `listConceptsByDifficulty`, `listConceptsByBloomLevel` |
| Edges | `listEdges`, `getEdge`, `addEdge`, `deleteEdge`, `getPrerequisites`, `getDependents`, `getPrerequisiteChain`, `getDependentChain`, `listRelatedEdges`, `getRelatedEdges`, `addRelatedEdge`, `deleteRelatedEdge` |
| Knowledge states | `getLearnerKnowledgeStates`, `getKnowledgeState`, `setKnowledgeState`, `deleteKnowledgeState`, `addMisconception` |
| Workspace | `getStats`, `clear` |

### Intelligence Methods

| Method | Description |
|--------|-------------|
| `computeZPD` | Zone of Proximal Development |
| `generateLearningPath` | Personalized learning path |
| `adjustForPsychometrics` | Pace and challenge adjustments from the profile |
| `selectScaffoldingStrategies` | Teaching strategies for a learner and concept |
| `detectGaps` | Knowledge gap detection |
| `predictDecay` | Memory decay prediction |
| `scheduleNextReview` | Next review timing |
| `getReviewQueue` | Prioritized review queue |
| `generateRemediationPlan` | Gap remediation plan |

---

## Educational Psychology Foundation

LearnGraph is built on decades of validated research:

| Theory | Application | Reference |
|--------|-------------|-----------|
| Zone of Proximal Development | Optimal challenge selection | Vygotsky (1978) |
| Bloom's Taxonomy | Cognitive level tracking | Bloom (1956) |
| Forgetting Curve | Memory decay prediction | Ebbinghaus (1885) |
| Scaffolding Theory | Support strategy selection | Bruner (1966) |
| Big Five Personality | Core trait modeling | Costa & McCrae (1992) |
| Growth Mindset | Belief system adaptation | Dweck (2006) |
| Multimedia Learning | Presentation optimization | Mayer (2009) |
| Self-Efficacy | Confidence-based adjustments | Bandura (1977) |
| Multiple Intelligences | Learning style diversity | Gardner (1983) |
| Spaced Repetition | Review scheduling (inspired by SM-2) | Wozniak (1987) |

---

## The Bottom Line

**LearnGraph transforms education from one-size-fits-all to truly personalized.**

Every learner is different. LearnGraph makes that difference visible, measurable, and actionable—enabling any AI to become a tutor that actually knows who it's teaching.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   "What should I learn next?"                                           │
│                                                                          │
│   Before LearnGraph:  [Random guess based on course order]              │
│                                                                          │
│   After LearnGraph:   [Optimal concept based on YOUR mastery,           │
│                        YOUR prerequisites, YOUR anxiety level,          │
│                        YOUR learning style, YOUR forgetting curve,      │
│                        and YOUR cognitive profile]                      │
│                                                                          │
│   That's the difference.                                                │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

*LearnGraph - Making AI tutoring truly personal.*
