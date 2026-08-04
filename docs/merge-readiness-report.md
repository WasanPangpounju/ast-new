# Merge Readiness Report: staging/raw-material-improvements → main

_Generated 2026-08-02. Survey only — no merge performed, no files modified._

## TL;DR

- `git fetch origin` confirms local `main` and `staging/raw-material-improvements` are identical to their remote counterparts (up to date).
- **The premise "main has parallel sales/warehouse work staging doesn't know about" does not currently hold.** The merge-base (`03accc5`) is very recent, and `main` has advanced by **exactly one commit** since then — and that commit is itself a material-stock fix, not sales/warehouse.
- All the sales/warehouse-looking commits visible in `git log main --oneline -30` (fabric bill autocomplete, sales order search, PDF layout edits, etc.) predate the fork point and are **shared ancestry** — already present in `staging/raw-material-improvements`'s own history too. They are not a merge risk.
- Only **2 files** were touched on both sides since the merge-base. Both are material-stock-formula related — no sales/warehouse file collisions exist today.

## 1. Merge-base

```
git merge-base main staging/raw-material-improvements
03accc5e1ca9b0cec981746a1323416d351e8d64
"fix: reconcile ใช้ไป summary and เปิดบิลผ้า detail totals for fabric stock"
```

## 2. Commits on `main` that `staging` does not have

```
git log 03accc5..main --oneline
26aef50 fix: pre-aggregate materialrequisitions to stop fan-out in material stock query
```

**Just one commit**, dated 2026-07-29. Category: **material** (stock query correctness), not sales/warehouse.

The commits further back in `git log main --oneline -30` (`03accc5` reconcile fabric stock, `4220e6b` sales order autocomplete, `a7f1ba1` migration column fix, PDF layout edits `248e21f`/`ad30735`/`37c80f4`/etc., `6b51dae`/`98864ba`/`a49501f` delivery-bill autocomplete, `dc78b2b`/`7a30aba` sales order search) all sit **at or before** the merge-base — they are ancestors of both branches, not new parallel work. Categorized for reference:

| Commit | Category | Note |
|---|---|---|
| 03accc5 | material/fabric stock | = merge-base itself |
| 4220e6b, dc78b2b, 7a30aba, 40daf8a, 98864ba, a49501f, 6b51dae | sales/warehouse (autocomplete, search) | shared ancestry, already in staging |
| a7f1ba1 | migration script fix | shared ancestry |
| 8220ee2, 248e21f, ad30735, 37c80f4, 2a4009b, 25294ca, c9e5fb8, 0ab232c, 93ae043, adbd1aa, a2e9024, 4eb3c37, a274a33, 953ba64, 001d5c2, fbc2c48 | UI/PDF layout (sales/warehouse docs) | shared ancestry |

**Action item for the user:** if there is sales/warehouse work "in parallel on main" that you're worried about, it has not landed on `origin/main` yet as of this fetch. Worth confirming with that team whether it's sitting unpushed, on a separate branch, or genuinely not started — otherwise this survey will need to be re-run right before the real merge.

## 3. Files changed by both branches since merge-base (real conflict candidates)

`git diff 03accc5..main --stat` touches only:
```
scripts/compare-stock-formula.ts               (new file, 122 lines)
src/app/api/warehouse/material/stock/route.ts  (17 changed lines)
```

`git diff 03accc5..staging/raw-material-improvements --stat` touches 75 files (full raw-material feature set: schema.prisma, NavLinks.tsx, menus.ts, material forms, package-return feature, etc. — see full list on request).

**Intersection (files at risk of conflicting on merge): exactly these 2 files, both material-stock-formula related.** No shared/common files like `menus.ts`, `NavLinks.tsx`, `package.json`, or `schema.prisma` are touched by both sides this time — `main`'s single commit doesn't reach those.

| File | Risk level | Why |
|---|---|---|
| `src/app/api/warehouse/material/stock/route.ts` | 🟡 Conflicts on merge, but **easy resolution** | Both sides fix the same fan-out bug in the same query. `main` patches the *old* simple query in-place. `staging` fully rewrote the file (pagination, grouped/flat-by-company modes, shared constants from new `src/lib/materialStock.ts`) and its `MATERIAL_STOCK_CTES` already contains the **exact same** `req AS (...)` pre-aggregation fix as `main`'s commit — plus outside-withdrawal netting, return netting, and orphan-requisition handling on top. Staging's version is a strict superset. |
| `scripts/compare-stock-formula.ts` | 🟡 Add/add conflict, but **easy resolution** | File doesn't exist at merge-base — added independently on both branches (git will treat as add/add conflict, not a text conflict). `staging`'s version (`f7f2dc1`, 189 lines) is structurally the same script extended: it renames `fanoutFixed()` → `fanoutFixedReqOnly()` and adds a third `newFormula()` step that layers outside-withdrawal + return netting on top of the same fan-out fix `main` demonstrates. Content is convergent, not contradictory. |

Detailed diffs were inspected for both files (see commands in section 4) — confirmed neither file has logic that *contradicts* the other; staging's version is a proper superset in both cases.

## 4. Commands used (for reproducibility)

```
git fetch origin
git log main --oneline -30
git merge-base main staging/raw-material-improvements
git log 03accc5..main --oneline
git log 03accc5..staging/raw-material-improvements --oneline
git diff 03accc5..main --stat
git diff 03accc5..staging/raw-material-improvements --stat
git diff 03accc5..main -- src/app/api/warehouse/material/stock/route.ts
git diff 03accc5..main -- scripts/compare-stock-formula.ts
git diff 03accc5..staging/raw-material-improvements -- src/app/api/warehouse/material/stock/route.ts
git diff main:scripts/compare-stock-formula.ts staging/raw-material-improvements:scripts/compare-stock-formula.ts
git merge-base --is-ancestor 26aef50 staging/raw-material-improvements   # → not an ancestor, confirms independent authorship
```

## 5. Recommendation

1. **Do not merge directly yet** — even though the conflicts are easy, `route.ts` will show real conflict markers (staging rewrote the whole file structure around the same lines main patched).
2. **Do a dry-run merge on a throwaway branch first**, e.g.:
   ```
   git checkout -b tmp/merge-dry-run staging/raw-material-improvements
   git merge main --no-commit --no-ff
   git status   # inspect conflicts
   git merge --abort   # or: git checkout main && git branch -D tmp/merge-dry-run
   ```
   This will confirm the 2 files above are the only conflicts and let you verify the resolution (keep staging's version of both — it's the superset) without touching `main` or `staging/raw-material-improvements`.
3. **Before the real merge**, re-confirm with whoever owns the sales/warehouse parallel work whether it has been pushed to `main` yet — right now there is no such work visible on `origin/main` beyond the fork point, so either it hasn't landed, or this survey needs to be redone closer to merge time.
4. Resolution for both conflict files, when you do the real merge: take `staging`'s version entirely — it already contains everything `main`'s single commit does, plus more (outside-withdrawal netting, return netting, orphan-requisition handling, pagination). No manual splicing of logic should be needed.
