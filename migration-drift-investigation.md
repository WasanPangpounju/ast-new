# Migration Drift Investigation

Date: 2026-07-25
Branch: `investigate/migration-drift`
Scope: 3 pending migrations reported by `prisma migrate status` against the local dev DB (`ast_new` @ localhost:5432). **No database-modifying commands were run.** All findings below come from read-only queries (`information_schema`, `_prisma_migrations`) and `git log`/`git show`.

## TL;DR

All three migrations are pending for **different reasons**, and one of them (`commission_to_string`) is not a simple "just resolve it" case — it has a live type mismatch between the DB and the app code. There's also a **blocking issue bigger than the 3 migrations**: `prisma migrate dev`/`deploy` currently refuses to run at all because an unrelated, already-tracked migration is stuck in a FAILED state. See [0. Blocking issue](#0-blocking-issue-found-along-the-way) — fix this first regardless of what you decide for the 3 migrations.

| Migration | Tracked in git? | DB already has the change? | Category |
|---|---|---|---|
| `add_material_return` | ✅ yes (committed 2026-05-20, before the `*.sql` gitignore rule existed) | ✅ yes, table matches exactly | History not synced |
| `add_return_packaging_to_outside` | ✅ yes (same as above) | ✅ yes, all 7 columns match exactly | History not synced |
| `commission_to_string` | ❌ **no** — never committed on *any* branch | ✅ yes, DB columns are already `text` | History not synced **+ schema.prisma/generated client not updated (active bug risk)** |

---

## 0. Blocking issue found along the way

`prisma migrate status` exits non-zero and reports:

```
The last common migration is: 20260520054205_add_bill_no_to_purchaseorders
The migrations have not yet been applied: [the 3 migrations]
The migration from the database are not found locally: 20260725060523_add_package_return_tracking
```

Querying `_prisma_migrations` directly shows why `20260520054205_add_bill_no_to_purchaseorders` — a migration that **is** committed to git and was previously applied successfully back in May — has a row with `started_at: 2026-07-23T04:23:30Z`, `finished_at: null`, `applied_steps_count: 0`, and this error in `logs`:

```
Database error code: 42701
ERROR: column "bill_no" of relation "ast_purchaseorders" already exists
```

So two days ago (2026-07-23), something tried to re-run this migration and it failed because the `bill_no` column was already physically present in the DB. Prisma now considers its migration history to be in a **failed state**, which blocks any further `prisma migrate dev`/`deploy` until it's resolved (`prisma migrate resolve --rolled-back` or `--applied`).

This is the same pattern as all 3 migrations below (DB schema ahead of Prisma's bookkeeping) — it's just that this one is tracked in git and already reflected correctly in `schema.prisma`, so it's a pure history-sync problem with no code-side ambiguity. Worth resolving alongside the 3 migrations, but it's not one of the 3 you asked about so I'm not making the call on it here — flagging it because nothing else will apply until it's dealt with.

**Working theory tying this together:** the dev DB looks like it was reseeded/restored at some point from a schema dump that was *ahead* of the `_prisma_migrations` bookkeeping table it was restored alongside — i.e. the table structures (bill_no column, material_returns table, return-packaging columns, commission-as-text) came along for the ride, but the corresponding rows in `_prisma_migrations` didn't. That would explain why every one of these migrations shows the DB already matching, with no recorded history for it.

### Also found: a 4th, completely separate drift case (FYI, not part of your 3)

`_prisma_migrations` has a row for `20260725060523_add_package_return_tracking` — applied **today** at 06:13 UTC, with `applied_steps_count: 0` and empty `logs` (the signature of `prisma migrate resolve --applied`, not an actual `migrate dev` run). This migration folder does not exist anywhere in `prisma/migrations/` on disk, and isn't on `main`. It **does** exist, fully committed, on local branch `feature/package-return-tracking` (commits `0c612c2` and `eee9bac`). The DB already has the corresponding tables (`package_return_obligations`, `package_return_entries`) matching that branch's `schema.prisma` exactly.

Notably, commit `eee9bac` on that branch is titled *"fix: add missing migration.sql (was silently blocked by overly broad `*.sql` gitignore)"* and narrows `.gitignore` from `*.sql` to `/*.sql` — **this is the exact same bug** that's currently causing `commission_to_string` to be untracked on this branch (see §3). It was already diagnosed and fixed once, just not on `main`/this branch yet.

Not asking you to act on this one since it's outside the 3 you named, but it explains the "migration from the database not found locally" line in `migrate status` output, and it's evidence the `.gitignore` fix should probably be cherry-picked/merged into `main` regardless of what happens with `commission_to_string`.

---

## 1. `add_material_return` (20260520092908)

**What it does:** Creates `material_returns` table (returnId, lot, yarnType, supplierName, spool, weightReturn, materialId → FK to `materials`, note, returnDate, timestamps) — 1 CREATE TABLE + 1 ADD FOREIGN KEY.

**Git tracking:** ✅ Tracked. Committed 2026-05-20, i.e. before the `*.sql` gitignore rule was added (2026-05-24, commit `edda7c2`). Nothing to explain here — this one was never at risk of being silently ignored.

**DB reality:** Table already exists in `ast_new`, and its columns match the migration.sql exactly, column-for-column (`id, returnId, lot, yarnType, supplierName, spool, weightReturn, materialId, note, returnDate, createdAt, updatedAt, deletedAt`). → **Category: already exists, history not synced.**

**schema.prisma:** Already has `model MaterialReturn` (`prisma/schema.prisma:502`) mapped to `material_returns`, matching the DB and the migration 1:1. No code is unaware of this table.

**Verdict:** Clean case. The migration, the schema, and the DB all agree — only Prisma's `_prisma_migrations` bookkeeping is missing the row. This is a **pure history-resolve case**: `prisma migrate resolve --applied 20260520092908_add_material_return` (do not re-run — the table already exists and re-running would fail exactly like the `bill_no` migration did). No team conversation needed; nobody's behavior depends on this being "unapplied."

---

## 2. `add_return_packaging_to_outside` (20260520093724)

**What it does:** Adds 7 columns to `material_outsides`: `paymentComment`, `recipient`, `returnBox`, `returnPallet`, `returnPaperBar`, `returnSack`, `returnSpool`, `usageNote`.

**Git tracking:** ✅ Tracked. Same story as #1 — committed 2026-05-20, before the `*.sql` gitignore rule existed.

**DB reality:** All columns already present on `material_outsides` with matching types/defaults (booleans default `false`, text columns nullable). → **Category: already exists, history not synced.**

Side note, not part of this migration: `material_outsides` also has `box`, `pallet`, `paperBar`, `sack` (integer) columns that this migration doesn't create — those came from the separate `add_package_return_tracking` migration mentioned in §0.

**schema.prisma:** All 7 fields are present on the model (`prisma/schema.prisma:487-494`), matching the DB.

**Verdict:** Same as #1 — clean, pure history-resolve case. `prisma migrate resolve --applied 20260520093724_add_return_packaging_to_outside`. No team conversation needed.

---

## 3. `commission_to_string` (20260723000000)

**What it does:**
```sql
ALTER TABLE "ast_purchaseorders" ALTER COLUMN "commission" TYPE TEXT USING "commission"::text;
ALTER TABLE "ast_bill_of_structures" ALTER COLUMN "commission" TYPE TEXT USING "commission"::text;
```
Converts `commission` from Float to TEXT on both tables.

**Git tracking:** ❌ **Untracked, and never committed on any branch, ever** (confirmed via `git log --all -- "**/20260723000000*"` — zero hits, not even a deleted/rewritten commit). Cause: the repo's `.gitignore` has a blanket `*.sql` rule (added 2026-05-24, commit `edda7c2`, "chore: add *.sql to gitignore, remove sql from tracking"), which silently swallows every `migration.sql` file created after that date — this migration was created 2026-07-23, so it was never even a candidate for `git add`. `git status` shows it as `!! ` (ignored), not as an ordinary untracked file, which is why it wouldn't show up in a normal `git status` scan without `--ignored`.

This is **not** a one-off mistake — it's the second time this exact failure mode has bitten this migrations folder. Branch `feature/package-return-tracking` hit the identical problem with its own migration and fixed the gitignore rule (`*.sql` → `/*.sql`, root-only) in commit `eee9bac`. That fix has not been merged/cherry-picked into `main` yet, so it's still live here.

**DB reality:** Both columns are **already** `text` type in the dev DB. Sampled all non-null values in both tables — every single one is a plain numeric string (`'0'`, etc.), no actual text content yet. → **Category: already exists, history not synced** — but with a catch (next point).

**schema.prisma / generated client:** ⚠️ **Still `Float?`** on both `AstPurchaseOrder.commission` (`prisma/schema.prisma:132`) and `AstBillOfStructure.commission` (`prisma/schema.prisma:653`) — on this branch, on `main`, and even on `feature/package-return-tracking`. The generated Prisma client (`src/generated/prisma/client/schema.prisma`) also still says `Float?`. **This field was never changed to String anywhere in the codebase — only the raw DB column and this orphaned migration file exist.**

**Active risk:** `src/app/api/sales/orders/route.ts` (and 3 other call sites) does `commission: commission ? parseFloat(commission) : null` before every Prisma write, because the code still believes this is a numeric field. Since Prisma generates its queries based on `schema.prisma`'s declared type (`Float`) rather than the DB's actual column type, and the actual Postgres column is `text`, writes to `commission` are at real risk of failing at the SQL level (type mismatch between the float8-typed bind parameter Prisma emits and the `text` column) — I did not test this directly since it would require a write, per your instructions, but it's consistent with the evidence and worth verifying carefully before touching anything. 14 files reference `commission` in `src/` (route handlers + sales order pages), all built assuming a number.

**Verdict — this one needs a decision, not a mechanical resolve:**
1. This looks like an abandoned in-progress change: someone manually `ALTER TABLE`'d the dev DB to `text` (probably to prototype letting commission hold non-numeric values, e.g. "negotiable" or a % string), generated the migration file to formalize it, but never finished — never updated `schema.prisma`, never regenerated the client, never updated the `parseFloat` call sites, and never committed any of it.
2. Before doing anything: find out *why* this change was started (check with whoever's been touching `ast_purchaseorders`/sales orders recently — `git log` shows commits like `a7f1ba1`, `03accc5` touching migration/fabric-yarn mapping around the same window) — was this intentional and paused, or a stray local experiment that should be discarded?
3. If it's intentional and should proceed: this needs `schema.prisma` updated to `String?` on both models, `prisma generate` re-run, the 4 `parseFloat(commission)` call sites in `orders/route.ts` reworked, the migration.sql committed (after fixing `.gitignore`), and *then* `prisma migrate resolve --applied` (since the DB column is already converted). That's a real code change, not just an ops command.
4. If it's not wanted: the DB column should be converted back to `double precision` (a real migration, reversing the `USING` cast — safe right now since all values are still plain numeric strings, but this gets harder the longer it's left as-is and someone starts storing non-numeric text) and the orphaned migration folder deleted.
5. Either way — **talk to the team before doing anything here.** This is the one of the three where "just sync the history" is not enough on its own.

---

## Recommended next steps (nothing executed)

1. **`add_material_return`** — safe to `prisma migrate resolve --applied` once you're ready; no discussion needed.
2. **`add_return_packaging_to_outside`** — same, safe to `prisma migrate resolve --applied`; no discussion needed.
3. **`commission_to_string`** — do not resolve yet. Confirm intent with the team first (see above), then either finish the change properly (schema + client + call sites + commit) or revert the DB column.
4. **Unblock `prisma migrate` entirely** — resolve the FAILED `20260520054205_add_bill_no_to_purchaseorders` record (`--rolled-back` if you want to reapply cleanly, or `--applied` since the column is already there) before anything else will run.
5. **Fix `.gitignore` on this branch/main** — port the `*.sql` → `/*.sql` narrowing from `feature/package-return-tracking` (commit `eee9bac`) so this doesn't silently eat migration files a third time.
6. Once `.gitignore` is fixed, `git add` the `commission_to_string` migration folder (assuming §3 resolves toward "keep it") so it's no longer local-only.
