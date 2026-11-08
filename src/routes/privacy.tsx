/**
 * "How your data is handled" (Roadmap M3): what this software stores and
 * does, in plain words. Every statement here must be true of the code; when a
 * feature changes, change this page with it. Public (readable before sign-up).
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-titles';

export const Route = createFileRoute('/privacy')({
  head: () => pageHead('/privacy'),
  component: PrivacyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-foreground">{children}</div>
    </section>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background px-4 py-10 sm:px-8">
      <Link to="/" className="text-sm font-medium text-primary hover:underline">
        ← LearnGraph
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-foreground">How your data is handled</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This page describes what the LearnGraph software stores and does. Whoever runs this copy of LearnGraph (the
        operator) may add terms of their own.
      </p>

      <Section title="What is stored">
        <ul className="list-disc space-y-1 pl-5">
          <li>Your account: name, email address and a hash of your password (never the password itself).</li>
          <li>
            Your sign-ins: for each signed-in browser, when the sign-in expires, and the IP address and browser details
            (user agent) it came from. Asking for a password reset stores a token that works for one hour.
          </li>
          <li>
            Your workspace: learners, concepts and prerequisites, progress on each concept and where it came from
            (quiz or self-report), quiz answers and results, lesson material, and an activity log of answers, reviews,
            postponed reviews, lessons opened and questions put to the AI tutor (the topic and kind of question, and
            which answer you preferred when comparing, but not the text of the question or the answers).
          </li>
          <li>Learning-style answers you choose to give on My Profile.</li>
          <li>
            AI drafts you review under Admin: what Claude proposed, what you saved, and whether you approved, edited or
            discarded it.
          </li>
          <li>Read-only API keys you create, stored only as a hash.</li>
        </ul>
      </Section>

      <Section title="Who can see it">
        <p>
          Everything in a workspace belongs to one account and is only shown to that account when signed in. Other
          accounts cannot read it. The operator of this copy has access to the database it runs on.
        </p>
        <p>
          If the operator has set up email, password-reset and confirmation emails are sent through Resend, which then
          handles your email address and the message.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          LearnGraph sets sign-in cookies and nothing else: the session itself, and a signed copy of it that saves a
          database lookup for up to five minutes. There are no advertising or analytics cookies and no third-party
          trackers. To slow down password guessing and account spam, requests to the sign-in service (signing in,
          signing up, password resets and the like) are counted per IP address for one to ten minutes.
        </p>
        <p>
          The browser also remembers a few display choices on your device, such as an open menu, the learner you picked
          or a session length.
        </p>
      </Section>

      <Section title="AI services">
        <p>
          LearnGraph sends nothing to AI services on its own. “Ask an AI tutor” shows you a short brief that you can
          copy yourself. If you choose to ask Claude on a lesson page with your own Anthropic API key, your question and
          that brief go to Anthropic under your key; LearnGraph uses the key for that request only and does not store it
          (your browser keeps it only if you tick “Remember”). A read-only API key lets a tool you choose fetch the same
          brief; you can revoke it at any time. The brief never contains your answers to personality or values
          questionnaires.
        </p>
        <p>
          Under Admin, Claude can also draft a curriculum or quiz questions, once you turn this on. Each draft request
          sends what it needs to Anthropic under your own key in the same way: the course description or PDF you give
          it, or the concept and its existing questions. A draft is added to your curriculum or quiz bank only when
          you approve it; your decision on each draft is kept, as listed above.
        </p>
      </Section>

      <Section title="Personal topics">
        <p>
          My Profile only asks about topics the study plan uses. Other topics, some of them personal (feelings and
          relationships, values and beliefs, difficult traits), stay hidden unless you agree to see them, and you can
          remove your answers to them at any time.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          On My Profile, “Delete my account” removes your account and everything in your workspace from the database
          straight away. You can also delete single learners, concepts and progress under Manage data. Copies in backups
          made by the operator are outside what the software controls.
        </p>
        <p>
          On My Profile, “Your data” downloads one learner’s progress as a spreadsheet (CSV), or that learner’s profile
          and progress as a file (JSON) that can be imported again under Manage data. The file is made in your browser
          from your own data; nothing is uploaded. There is no single download of a whole workspace yet.
        </p>
      </Section>
    </main>
  );
}
