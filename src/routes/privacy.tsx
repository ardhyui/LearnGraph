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
            Your workspace: learners, concepts and prerequisites, progress on each concept and where it came from
            (quiz or self-report), quiz answers and results, lesson material, and an activity log of answers, reviews,
            postponed reviews and lessons opened.
          </li>
          <li>Learning-style answers you choose to give on My Profile.</li>
          <li>Read-only API keys you create, stored only as a hash.</li>
        </ul>
      </Section>

      <Section title="Who can see it">
        <p>
          Everything in a workspace belongs to one account and is only shown to that account when signed in. Other
          accounts cannot read it. The operator of this copy has access to the database it runs on.
        </p>
      </Section>

      <Section title="Cookies and tracking">
        <p>
          LearnGraph sets a sign-in session cookie and nothing else. There are no advertising or analytics cookies and
          no third-party trackers. To slow down password guessing, sign-in attempts are counted per IP address for a
          few minutes.
        </p>
        <p>The browser also remembers a few display choices (such as an open menu or a session length) on your device.</p>
      </Section>

      <Section title="AI services">
        <p>
          LearnGraph does not send your data to any AI service. “Ask an AI tutor” shows you a short brief that you can
          copy yourself. A read-only API key lets a tool you choose fetch the same brief; you can revoke it at any time.
          The brief never contains your answers to personality or values questionnaires.
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
        <p>Downloading all of your data is not available yet.</p>
      </Section>
    </main>
  );
}
