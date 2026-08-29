# Backup & recovery

This is a real, runnable backup/restore plan (`scripts/backup.sh` /
`scripts/restore.sh`), not a description of one — both are round-trip
verified: a fresh backup was restored into a separate database and its
row counts matched the source exactly. What's below is honest about what
these scripts do and don't cover, and what you still need to configure at
the infrastructure level.

## What the scripts do

- **`npm run db:backup`** (`scripts/backup.sh`) runs `pg_dump` against
  `DATABASE_URL` in Postgres's custom format (`-Fc`): compressed, and
  restorable selectively or in parallel with `pg_restore`. It's a single
  consistent snapshot — `pg_dump` runs inside one transaction, so a backup
  never captures a half-applied write. Output goes to `./backups/` by
  default (`BACKUP_DIR` to change it), named
  `blue_collar_<UTC timestamp>.dump`. Backups older than
  `BACKUP_RETENTION_DAYS` (default 30) in that directory are pruned after
  each successful run.
- **`npm run db:restore -- <file> [--yes]`** (`scripts/restore.sh`) runs
  `pg_restore --clean --if-exists` against `DATABASE_URL`, dropping and
  recreating objects from the dump. **Destructive** — it overwrites
  whatever is currently in the target database. It prompts for
  confirmation unless you pass `--yes` (for scripted/CI use). It always
  masks the connection string before printing anything, so credentials
  never end up in a terminal transcript or CI log by accident.

Both read `DATABASE_URL` from the environment, falling back to `.env` if
unset — same convention as the rest of the app.

## What this does NOT cover

- **Point-in-time recovery (PITR).** A `pg_dump` snapshot only restores to
  the moment it was taken — anything written after the last backup and
  before a failure is lost. True PITR needs continuous WAL archiving,
  which is a database-server feature, not something a dump script can
  provide. If your Postgres is on a managed provider (Railway, RDS, Neon,
  Supabase, etc.), turn on that provider's built-in
  automated-backups/PITR feature — it already does continuous WAL
  archiving correctly and is what should back RPO below zero-ish, not this
  script. Treat `scripts/backup.sh` as a portable, provider-independent
  safety net on top of that, not a replacement for it.
- **Application file storage.** Documents and daily-report photos are
  stored as Postgres `Bytes` columns (an explicit MVP simplification —
  see the schema comments on `Document`/`DailyReportPhoto`), so they ARE
  included in every `pg_dump`. If a future phase moves them to an object
  store (S3, R2, etc.), that store needs its own backup/versioning policy
  — this plan won't cover it anymore at that point.
- **Automated scheduling.** The scripts are the mechanism; wiring them to
  a schedule is an infrastructure choice made where the app is actually
  deployed (see below) — not something to bake into the app itself.

## Recovery targets

- **RPO (Recovery Point Objective) — how much data you can afford to
  lose:** with `scripts/backup.sh` on a daily schedule, up to ~24 hours.
  If that's not tight enough, either back up more often (the script has no
  inherent frequency limit) or turn on your Postgres provider's
  continuous-WAL/PITR feature, which drives RPO down to seconds.
- **RTO (Recovery Time Objective) — how long recovery takes:** dominated
  by `pg_restore` time on the dump, which scales with data size. On the
  seeded demo dataset it's a few seconds; measure it on a
  production-sized copy before quoting a real number, and re-measure
  periodically as the dataset grows.

## Scheduling backups

Pick whichever matches how the app is actually deployed:

**Railway** — add a second, cron-scheduled service in the same project
pointed at this repo, with a custom start command of
`bash scripts/backup.sh` and `DATABASE_URL` set to the same value as the
main service (Railway cron services: Settings → Cron Schedule). Push the
resulting dump to an S3-compatible bucket rather than leaving it on
ephemeral service storage — Railway's own automated Postgres backups are
still the primary PITR safety net; this is the portable secondary copy.

**GitHub Actions** (works regardless of host) — a scheduled workflow:

```yaml
name: Database backup
on:
  schedule:
    - cron: "0 8 * * *" # daily, 08:00 UTC
  workflow_dispatch: {}
jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - run: bash scripts/backup.sh
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
      - name: Upload to S3-compatible storage
        run: aws s3 cp ./backups/ "s3://$BACKUP_BUCKET/" --recursive
        env:
          BACKUP_BUCKET: ${{ secrets.BACKUP_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

(Runners are ephemeral — the upload step is what makes the backup durable;
without it the dump disappears when the job ends.)

## Restoring — the actual runbook

1. Identify the backup file to restore from (by timestamp in the
   filename, or the most recent one in your durable storage).
2. Confirm `DATABASE_URL` points at the database you actually intend to
   overwrite. This is the single most dangerous step — `restore.sh` masks
   the connection string when it prints it specifically so you can verify
   the host/database name without ever seeing the password, but it
   doesn't know which environment "should" be intended. Double-check
   before typing `restore`.
3. Run `npm run db:restore -- ./backups/blue_collar_<timestamp>.dump` and
   confirm the prompt.
4. Verify: run `npx prisma migrate status` (schema should already match,
   since the dump includes it) and spot-check row counts on a couple of
   key tables against what you expect.
5. If restoring into a live production database after an incident, take a
   fresh backup of the (broken) current state first — `npm run db:backup`
   — before restoring over it, in case the restore itself needs to be
   undone.

## Testing this plan

A backup/recovery plan nobody has ever restored from is not a tested
plan. This one was: a backup of the seeded demo database was restored
into a separate throwaway database and its `Company`/`Job`/`User` row
counts were confirmed to match the source exactly before that throwaway
database was dropped. Re-run that same check
(`db:backup` → `db:restore` into a scratch database → compare row counts)
periodically, and definitely after any schema migration, since a restore
that silently fails or produces a subtly wrong result is worse than no
backup at all — it gives false confidence.
