# Testing a backup restore

Roadmap M3 asks for one production backup to be restored and checked. This page
is the procedure. It needs access to the production database (decision D7), so
the operator runs it. Plan for about 30 minutes.

The restored copy holds everyone's personal data. Keep it private and delete it
when you are done (step 6).

## 1. Take or pick a backup

- **Managed Postgres** (Vercel Postgres, Neon, Supabase, RDS…): use the
  provider's backup or point-in-time restore. Restore it **into a new database
  or branch**, never over production, and skip to step 3.
- **Plain Postgres**: take a dump.

  ```bash
  pg_dump --format=custom --no-owner --file learngraph.dump "$DATABASE_URL"
  ```

## 2. Restore into a new, empty database

```bash
createdb learngraph_restore_test        # or create one in your provider's console
export RESTORED_DATABASE_URL=postgres://…/learngraph_restore_test
pg_restore --no-owner --dbname "$RESTORED_DATABASE_URL" learngraph.dump
```

## 3. Compare it with production

Both connections are read-only. The check only reads table names, applied
migrations and row counts.

```bash
SOURCE_DATABASE_URL="$DATABASE_URL" RESTORED_DATABASE_URL="$RESTORED_DATABASE_URL" \
  node scripts/compare-databases.mjs
```

It prints each table's row count in both databases and ends with
`Restore check passed` or `Restore check failed`. It fails when:

- a table or an applied migration is missing; or
- a table that has rows in production comes back empty.

Counts that moved on since the backup are listed as notes, because production
keeps changing.

## 4. Run the app against the copy

Use a fresh clone, not the folder a live service runs from. Leave the email
settings out, so the copy can never email real users.

```bash
DATABASE_URL="$RESTORED_DATABASE_URL" BETTER_AUTH_SECRET=<the production secret> \
  RESEND_API_KEY= EMAIL_FROM= npm run build
DATABASE_URL="$RESTORED_DATABASE_URL" BETTER_AUTH_SECRET=<the production secret> \
  RESEND_API_KEY= EMAIL_FROM= npm run preview
```

`npm run build` also applies any pending migrations to the copy. That is what
a deploy would do to production after a restore.

## 5. Check it by hand

Open the preview URL and sign in with your own account. Then check that:

- the Dashboard and Gap Analysis show your learners and progress;
- My Profile shows your answers;
- the Status page's Learning measures count your activity.

## 6. Record the result and clean up

- Note the date, how old the backup was, and the result in `Roadmap.md` (M3,
  the backup item) and in the log in `docs/ROADMAP.md`.
- Drop the copy (`dropdb learngraph_restore_test`, or delete the branch or
  database in your provider) and delete `learngraph.dump`.
