# Runbook: ย้ายยอดบรรจุภัณฑ์ระบบเดิมขึ้น prod

สคริปต์: `scripts/migrate-legacy-packages.ts` (ย้าย) และ `scripts/verify-legacy-packages.ts` (ตรวจ, อ่านอย่างเดียว)
Branch: `feature/package-return-receipts` + `fix/material-entry-date-off-by-one` ขึ้นพร้อมกันผ่าน `main` (ทาง A ที่เลือก 2026-10-08)

**ตารางที่ถูกเขียน:** `packages`, `packageasts`, `htrpackages`, `package_return_obligations`, `package_return_receipts`, `package_return_entries`
**อ่านอย่างเดียว:** `materials`, `suppliers`

## วิธีอ่าน runbook นี้

- ทุกกล่องคำสั่งมี **คำสั่งเดียว** คัดลอกไปวางได้ทั้งกล่อง (กล่องที่มีหลายบรรทัดคือคำสั่งเดียวที่ยาว เช่น heredoc)
- ใต้กล่องมี **ต้องเห็น** ถ้าไม่ตรง ให้หยุดและอย่าไปขั้นถัดไป
- รันบน server เป็น root ด้วย bash **จากโฟลเดอร์ repo** (โฟลเดอร์ที่มี `docker-compose.prod.yml` และ `.env`) ยกเว้นขั้นที่เขียนว่า "เครื่องคุณ"
- ไม่มีคำสั่งไหนพิมพ์หรือแสดงรหัสผ่าน รหัสผ่านถูกอ่านจาก `.env` ของ server เท่านั้น

## ทำไมรันสคริปต์ใน container ของ app ไม่ได้ และรันอย่างไรแทน

- image ของ app (`Dockerfile` stage `runner`) เป็น Next.js standalone: ไม่มีโฟลเดอร์ `scripts/`, ไม่มี `tsx`, ไม่มี Prisma CLI
- `docker-compose.prod.yml` ไม่เปิด port ของ Postgres (ไม่มี `ports:` ที่ service `postgres`) ต่อได้จาก network `*_ast_net` เท่านั้น
- **วิธีที่ใช้:** build stage `builder` ของ Dockerfile เดิมเป็น image ชั่วคราว `ast-new-builder:pkgmig` (มี `tsx`, `prisma`, `pg`, `scripts/`) แล้วรันทีละคำสั่งผ่าน `scripts/legacy-packages/tool.sh` ซึ่งทำ `docker run --rm` บน network ของ compose ต่อ Postgres ที่ host `postgres:5432` ไม่ต้องเปิด port, container ถูกลบทันทีหลังรัน, ไฟล์ข้อมูลเข้าแบบ read-only
- **รหัสผ่าน:** `scripts/legacy-packages/db-env.mjs` อ่าน `POSTGRES_PASSWORD` จาก `.env` ทาง stdin แล้วเขียน `/root/pkgmig/db.env` (สิทธิ์ 600) ที่มี `DATABASE_URL` แบบ URL-encode แล้ว (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`) `tool.sh` ส่งไฟล์นี้ให้ container ด้วย `--env-file` รหัสผ่านจึงไม่อยู่ใน command line, ไม่อยู่ใน shell history และไม่เห็นใน `ps`
  - ถ้ารหัสผ่านมี `$` สคริปต์จะหยุด เพราะ compose ตีความ `$` ใน `.env` ค่าจริงอาจไม่ตรงกับที่เขียน ต้องตรวจเอง
- ทดสอบบน local แล้ว (2026-10-08): รหัสผ่าน `p@ss:w/rd#1 x` แบบไม่ใส่ quote / single quote / double quote ได้ URL เดียวกัน, `pg` และ `prisma migrate` ต่อได้; ถ้าไม่ encode `prisma migrate` จะ error `P1013 invalid port number`

---

## ขั้นเตรียม

### P1. ส่งไฟล์ขึ้น server (เครื่องคุณ)

```sh
ssh root@206.81.0.211 'mkdir -p /root/pkgmig/in /root/pkgmig/out /root/pkgmig/backup && chmod 700 /root/pkgmig'
```

ต้องเห็น: ไม่มี error

```sh
scp ~/project/ast-backups/ast-packages-20261007.sql ~/project/ast-backups/legacy-supplier-map-20261008.json root@206.81.0.211:/root/pkgmig/in/
```

ต้องเห็น: ส่งครบ 2 ไฟล์ ไม่มี error

### P2. ตรวจไฟล์บน server

```sh
sha256sum /root/pkgmig/in/*
```

ต้องเห็น 2 บรรทัดนี้ตรงทุกตัวอักษร:

```
b62a97b5e421632b6423209b3ff4147a0570225d0dbc39da92c5590ed0a7c6f7  /root/pkgmig/in/ast-packages-20261007.sql
b3b5284ffb17d2550af865b2723aaa98b4fc1213392263c77858ef79b4758657  /root/pkgmig/in/legacy-supplier-map-20261008.json
```

### P3. ไปที่โฟลเดอร์ repo และตรวจ `.env`

```sh
cd /home/deploy/ast-new
```

(ทุกคำสั่งต่อจากนี้รันจากโฟลเดอร์นี้ ถ้าเปิด ssh ใหม่ให้ `cd` มาที่นี่ก่อน)

```sh
git log -1 --format='%h %s'
```

ต้องเห็น: `5c2bda4 fix: place inch mark right after the fabric width number on print` (รุ่นที่ prod รันอยู่ ตรวจแล้ว 2026-10-08) ถ้าไม่ใช่ให้หยุด เพราะการตรวจทั้งหมดในขั้น 0 อิงจากรุ่นนี้

```sh
ls docker-compose.prod.yml .env
```

ต้องเห็น: ทั้งสองไฟล์ ไม่มี `No such file`

```sh
grep -cE '^[[:space:]]*(export[[:space:]]+)?POSTGRES_PASSWORD[[:space:]]*=' .env
```

ต้องเห็น: `1` (นับบรรทัดเท่านั้น ไม่แสดงค่า)

```sh
docker network ls --format '{{.Name}}' | grep '_ast_net$'
```

ต้องเห็น: 1 บรรทัด เช่น `ast-new_ast_net`

---

## ลำดับขั้นตอน

ลำดับที่ขอมาคือ backup > deploy โค้ด > migration > dry-run > apply > verify > ตรวจหน้าจอ ผมแยก "deploy โค้ด" เป็น 2 จังหวะ: build image ก่อน → รัน migration → ค่อยสลับ app เป็นตัวใหม่
**เหตุผล:** โค้ดใหม่ query คอลัมน์และตารางที่ migration เพิ่ม ถ้าสลับ app ก่อน หน้าคืนบรรจุภัณฑ์จะ error จนกว่า migration จะเสร็จ ส่วนโค้ดเดิมทำงานกับ schema ใหม่ได้ เพราะ migration ทั้งสองตัวเป็นแบบเพิ่มอย่างเดียว

### 0. รวม branch เข้า main และ push (เครื่องคุณ)

**ทาง A: ขึ้นทุกอย่างพร้อมกันผ่าน `main`** ผลตรวจ 2026-10-08 ที่ใช้ตัดสิน:

- prod รัน `5c2bda4` = `main` = `origin/main` (ยืนยันด้วย `git log -1` บน server) และฐานข้อมูล prod มี migration ครบทั้ง 30 ตัวของ main (จาก backup 2026-10-07) ดังนั้นสิ่งที่ขึ้นรอบนี้คือ commit ด้านล่างเท่านั้น ไม่มีงานอื่นของ main ติดไปด้วย
- `feature/package-return-receipts` แตกจาก `5c2bda4` พอดี → merge เข้า main แบบ fast-forward
- `fix/material-entry-date-off-by-one` แตกจาก `f7716ea` (เก่ากว่า) → merge commit 1 ตัว ไม่มี conflict ไฟล์ที่ซ้ำกันมีแค่ `src/lib/bangkokDate.ts` ซึ่งเหมือนกันทุกตัวอักษร
- ลอง merge ทั้งสองบน branch ชั่วคราวแล้ว: vitest 9/9 ผ่าน, `tsc` error 20 ตัวเท่ากับ main เดิม (ของเดิมทั้งหมด ไม่มีใหม่), `next build` ผ่าน
- migration ที่ prod ยังไม่มี: **2 ตัว** ของงานบรรจุภัณฑ์ทั้งคู่ (ขั้น 3) fix branch และ main ไม่มี migration ใหม่
- **ไม่มีงาน UI Phase 2** ในชุดนี้ ถ้าคำสั่งตรวจด้านล่างเห็น commit อื่นนอกจากรายการ ให้หยุด

commit ที่จะขึ้น (10 ตัว = งานบรรจุภัณฑ์ 7 + runbook 1 + fix 1 + merge commit 1):

```
3ec37fb feat: legacy-style supplier package return with summary table and return receipts
31a9f09 feat: split sack returns into plastic, jute and unspecified
fd716e3 feat: show legacy import subtypes and paper bar from packageasts in package return summary
ba8782e feat: migrate legacy packaging tables with carried-forward balances and receipts
e953815 docs: prod runbook for the legacy package migration
27ed9d8 feat: carried-forward obligations follow the import's current company
dd5281a docs: runbook reads the prod DB password from .env, URL-encoded, never on the command line
(runbook) docs: runbook for deploy option A (everything via main)
1f2196c fix: pin material importDate to Bangkok calendar date to stop off-by-one shift
(merge)   Merge branch 'fix/material-entry-date-off-by-one'
```

รันจากโฟลเดอร์ repo บนเครื่องคุณ (`~/project/ast-new`):

```sh
git fetch origin
```

```sh
git rev-parse --short origin/main
```

ต้องเห็น: `5c2bda4` ถ้าไม่ใช่ แปลว่ามีคน push เข้า main หลังตรวจ ให้หยุดและตรวจใหม่

```sh
git switch main
```

```sh
git merge --ff-only origin/main
```

ต้องเห็น: `Already up to date.`

```sh
git merge --ff-only docs/runbook-option-a
```

ต้องเห็น: `Fast-forward` (branch นี้คือ `feature/package-return-receipts` + commit runbook นี้)

```sh
git merge --no-ff fix/material-entry-date-off-by-one -m "Merge branch 'fix/material-entry-date-off-by-one'"
```

ต้องเห็น: `Merge made by the 'ort' strategy.` ไม่มี `CONFLICT`

```sh
git rev-list --count 5c2bda4..HEAD
```

ต้องเห็น: `10`

```sh
git log --oneline 5c2bda4..HEAD
```

ต้องเห็น: 10 บรรทัดตรงกับรายการด้านบน ไม่มี commit ของงานอื่น (เช่น UI Phase 2)

```sh
git diff --name-only 5c2bda4 HEAD -- prisma/migrations
```

ต้องเห็น: ไฟล์ของ 2 โฟลเดอร์นี้เท่านั้น `20261007090000_add_package_return_receipts` และ `20261007120000_legacy_package_columns`

```sh
npx vitest run
```

ต้องเห็น: `Tests  9 passed (9)`

```sh
git push origin main
```

ต้องเห็น: `5c2bda4..<hash>  main -> main`

ถ้าพบปัญหาก่อน push: `git reset --hard origin/main` (บน main ในเครื่องคุณ ยังไม่มีอะไรขึ้น server)

ข้อควรระวังของ fix branch เอง: การตรวจ prod หาแถว importDate ที่เพี้ยนไปแล้ว ยังค้างอยู่ เป็นงานแยก ไม่ขวางรอบนี้

### 1. Backup (server)

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc ast_new > /root/pkgmig/backup/ast_new_pre_pkgmig.dump
```

ต้องเห็น: ไม่มีข้อความ (ถ้าไฟล์ชื่อนี้มีอยู่แล้วจะถูกเขียนทับ — ถ้าเคยเริ่มไปแล้วรอบหนึ่ง ให้ย้ายไฟล์เดิมออกก่อน)

```sh
ls -lh /root/pkgmig/backup/ast_new_pre_pkgmig.dump
```

ต้องเห็น: ขนาดหลาย MB (backup 2026-10-07 ≈ 3.7 MB) ไม่ใช่ 0

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -l < /root/pkgmig/backup/ast_new_pre_pkgmig.dump | grep -c 'TABLE DATA'
```

ต้องเห็น: ตัวเลขประมาณ `39` (จำนวนตารางใน backup 2026-10-07) ถ้าได้ 0 หรือ error แปลว่า backup อ่านไม่ได้

```sh
docker inspect --format '{{.Config.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)" > /root/pkgmig/app-image.txt
```

```sh
cat /root/pkgmig/app-image.txt
```

ต้องเห็น: ชื่อ image ของ app เช่น `ast-new-app` (ใช้ตอนถอยขั้น 4)

```sh
docker tag "$(docker inspect --format '{{.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)")" ast-new-app:pre-pkgmig
```

```sh
docker image ls ast-new-app:pre-pkgmig
```

ต้องเห็น: 1 แถว tag `pre-pkgmig` (image ตัวที่รันอยู่ตอนนี้ เก็บไว้ถอย)

ถอยกลับ: ไม่ต้อง (ยังไม่ได้แก้อะไร)

### 2. Build image และเตรียมการต่อฐานข้อมูล (ยังไม่สลับ app)

```sh
stat -c '%U' .git
```

ต้องเห็น: ชื่อเจ้าของ repo (`root` หรือ `deploy`) ใช้เลือกคำสั่งถัดไป

```sh
git pull --ff-only origin main
```

(ใช้เมื่อเจ้าของคือ `root` ถ้าเป็น `deploy` ให้ใช้คำสั่งนี้แทน: `sudo -u deploy git pull --ff-only origin main` เพื่อไม่ให้ไฟล์ใน repo กลายเป็นของ root)

ต้องเห็น: `Updating 5c2bda4..<hash>` และ `Fast-forward`

```sh
git rev-list --count 5c2bda4..HEAD
```

ต้องเห็น: `10` (ตรงกับขั้น 0)

```sh
git log --oneline 5c2bda4..HEAD
```

ต้องเห็น: 10 บรรทัดเดียวกับขั้น 0 ไม่มี commit ของงานอื่น ถ้าไม่ตรงให้หยุด (ยังไม่ได้ build อะไร app ตัวเดิมยังรันอยู่) และย้อน repo ด้วย `git reset --hard 5c2bda4`

```sh
git merge-base --is-ancestor 1f2196c HEAD && test -f scripts/legacy-packages/tool.sh && echo READY
```

ต้องเห็น: `READY` (มีทั้ง fix branch และงานนี้)

```sh
docker compose -f docker-compose.prod.yml build app
```

ต้องเห็น: build จบโดยไม่มี error (app ตัวเดิมยังรันอยู่)

```sh
docker build --target builder -t ast-new-builder:pkgmig .
```

ต้องเห็น: build จบโดยไม่มี error (ใช้ cache ของ build ด้านบน จึงเร็ว)

```sh
install -m 600 /dev/null /root/pkgmig/db.env
```

```sh
docker run --rm -i ast-new-builder:pkgmig node scripts/legacy-packages/db-env.mjs < .env > /root/pkgmig/db.env
```

ต้องเห็น: ไม่มีข้อความ ถ้ามีข้อความขึ้นต้นด้วย `db-env:` ให้หยุดและแก้ตามข้อความ

```sh
grep -c '^DATABASE_URL=postgresql://postgres:[^@]*@postgres:5432/ast_new$' /root/pkgmig/db.env
```

ต้องเห็น: `1` (ยืนยันว่ามี `@` เหลือตัวเดียวคือตัวคั่น host แปลว่า `@` ในรหัสผ่านถูก encode แล้ว)

```sh
stat -c '%a' /root/pkgmig/db.env
```

ต้องเห็น: `600`

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น (ตัวเลขของ materials / obligations อาจมากกว่านี้ถ้ามีรับเข้าใหม่):

```
"database": "ast_new", "user": "postgres",
"materials": 4471, "packages": 0, "packageasts": 0, "htrpackages": 0,
"package_return_obligations": 159, "package_return_receipts": "no table", "package_return_entries": 0
```

ถ้าเห็น `db-check: FAILED — password authentication failed` แปลว่ารหัสใน `.env` ไม่ตรงกับฐานข้อมูล ให้หยุด

```sh
sh scripts/legacy-packages/tool.sh npx tsx --version
```

ต้องเห็น: `tsx v4...`

ถอยกลับ: ไม่ต้อง (app ตัวเดิมยังรันอยู่)

### 3. Migration 2 ตัว

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate status
```

ต้องเห็น: `Following migrations have not yet been applied:` ตามด้วยสองชื่อนี้เท่านั้น (คำสั่งนี้จบด้วย exit code 1 เมื่อมี migration ค้าง ถือว่าปกติ)

```
20261007090000_add_package_return_receipts
20261007120000_legacy_package_columns
```

ถ้ามีชื่ออื่นค้างด้วย ให้หยุด

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate deploy
```

ต้องเห็น: `All migrations have been successfully applied.` และรายชื่อ 2 ตัวข้างบน

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate status
```

ต้องเห็น: `Database schema is up to date!`

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `"package_return_receipts": 0` (ไม่ใช่ `"no table"` แล้ว) ค่าอื่นเท่าเดิม

**ถอยกลับ** (ทำได้เฉพาะก่อนขั้น 6 apply และตอนที่ app ยังเป็นตัวเดิม — คำสั่งเดียว):

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM package_return_receipts) > 0 THEN RAISE EXCEPTION 'มีใบคืนแล้ว ห้ามถอย migration — ใช้ restore backup'; END IF;
END $$;
ALTER TABLE htrpackages DROP CONSTRAINT IF EXISTS "htrpackages_receiptId_fkey";
DROP INDEX IF EXISTS "htrpackages_receiptId_key", "package_return_obligations_legacyRef_category_key",
  "packageasts_ref_id_packageStatus_idx", "packages_materialId_idx";
ALTER TABLE htrpackages DROP COLUMN "palletSteel", DROP COLUMN "palletWood", DROP COLUMN "partition", DROP COLUMN "receiptId",
  DROP COLUMN "spoolCPaper", DROP COLUMN "spoolCPlastic", DROP COLUMN "spoolPaper", DROP COLUMN "spoolPlastic";
ALTER TABLE package_return_obligations DROP COLUMN "legacyRef";
ALTER TABLE packageasts DROP COLUMN box, DROP COLUMN "boxType", DROP COLUMN emp, DROP COLUMN "packageStatus", DROP COLUMN pallet,
  DROP COLUMN "palletType", DROP COLUMN partition, DROP COLUMN "partitionType", DROP COLUMN ref_id, DROP COLUMN sack,
  DROP COLUMN "sackType", DROP COLUMN spool, DROP COLUMN "spoolType", DROP COLUMN "supplierName";
ALTER TABLE packages DROP COLUMN "legacyDate", DROP COLUMN "materialId";
ALTER TABLE package_return_entries DROP CONSTRAINT "package_return_entries_receiptId_fkey";
DROP INDEX "package_return_entries_receiptId_idx";
ALTER TABLE package_return_entries DROP COLUMN "receiptId";
DROP TABLE package_return_receipts;
DELETE FROM _prisma_migrations WHERE migration_name IN
  ('20261007090000_add_package_return_receipts', '20261007120000_legacy_package_columns');
COMMIT;
SQL
```

ต้องเห็น: `COMMIT` บรรทัดสุดท้าย และ `migrate status` กลับมาแสดง 2 ตัวค้างเหมือนเดิม
หรือถ้าไม่แน่ใจ: restore จาก backup ขั้น 1 ก็ได้ เพราะยังไม่มีข้อมูลใหม่

### 4. สลับ app เป็นตัวใหม่

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

ต้องเห็น: `Container ...-app-1  Started` (หรือ `Recreated`)

```sh
docker compose -f docker-compose.prod.yml ps app
```

ต้องเห็น: STATUS เป็น `Up ...`

```sh
docker compose -f docker-compose.prod.yml logs --tail=30 app
```

ต้องเห็น: `Ready in ...` และไม่มี `Error`

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
```

ต้องเห็น: `200`

แนะนำให้แจ้งผู้ใช้**ไม่บันทึกใบคืนบรรจุภัณฑ์**จนกว่าจะจบขั้น 8 (ดู "จุดที่ถอยไม่ได้")

**ถอยกลับ** (schema ใหม่ใช้กับโค้ดเดิมได้):

```sh
docker tag ast-new-app:pre-pkgmig "$(cat /root/pkgmig/app-image.txt)"
```

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

ต้องเห็น: app กลับมา `Up` และหน้า `/login` ตอบ `200`

### 5. Dry-run

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json --report=/out/dryrun
```

ต้องเห็น (ตรงกับ dry-run บน local 2026-10-08):

```
mode: DRY-RUN  db: postgresql://postgres:***@postgres:5432/ast_new
dump rows: {"packages":4390,"packageasts":8058,"htrpackages":82}
after: {..."legacy_obligations":8101,"new_receipts":82,"new_entries":1708,"materials":4471}
pairing: 4029 paired, 361 packages-only (untyped), unpaired return rows: 0
receipts 82, entries 1708, over-returns 1, unmatched names 0
sample "จีน": OK
```

- รายชื่อบริษัททั้งหมดเป็น `PASS` ยกเว้น 6 บริษัทนี้ที่เป็น `PASS (อธิบายได้)`: กังวาลเท็กซ์ไทล์, เควินซาน, จงสถิตย์, แพรกษาเท็กซ์ไทล์, LP. (ตีเกลียว), Fenatex — ต้องไม่มี `FAIL`
- บรรทัดสุดท้าย: `DRY RUN — rolled back, nothing changed`
- `materials` อาจมากกว่า 4471 ถ้ามีรับเข้าใหม่ ตัวเลขอื่นควรตรง ถ้าไม่ตรงให้หยุดและส่ง `/root/pkgmig/out/dryrun/report.md` มาดู
- ผลข้างเคียงอย่างเดียว: เลข id ของ obligations และใบคืนจะข้ามไปบางช่วง

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `packages`, `packageasts`, `htrpackages` ยังเป็น `0` และ `package_return_obligations` ยังเท่ากับขั้น 3

ถอยกลับ: ไม่ต้อง

### 6. Apply

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json --report=/out/apply --apply
```

ต้องเห็น: ตัวเลขเหมือนขั้น 5 ทุกบรรทัด และบรรทัดสุดท้าย `APPLIED — committed`

- สคริปต์จะไม่ commit ถ้ายังมีชื่อบริษัทที่จับคู่ไม่ได้ หรือมีบริษัทที่ FAIL (จะจบด้วย `not committed: ...`)
- ถ้ารันซ้ำหลัง commit สคริปต์จะปฏิเสธ (`already migrated`)

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `packages 4390`, `packageasts 8058`, `htrpackages 82`, `package_return_receipts 82`, `package_return_obligations` = ค่าขั้น 3 + 8101 (เช่น 159 + 8101 = 8260)

**ถอยกลับ:**

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --rollback
```

ต้องเห็น: `rows deleted: {...packages: 4390...}` และ `dry run — nothing changed (add --apply to commit the rollback)`

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --rollback --apply
```

ต้องเห็น: `ROLLBACK APPLIED (committed)` แล้ว `db-check` กลับเป็นค่าขั้น 3

ลบเฉพาะสิ่งที่สคริปต์สร้าง (3 ตารางเดิม + ยอดยกมา + ใบคืน/รายการที่มาจาก htrpackages) ใบคืนและยอดค้างที่สร้างในระบบใหม่ไม่ถูกแตะ
ถ้ามีผู้ใช้บันทึกใบคืนที่ไปตัดยอดยกมาแล้ว สคริปต์จะปฏิเสธ (`rollback refused: ...`)

### 7. Verify

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/verify-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json
```

ต้องเห็น:

- บรรทัดแรก `copy vs dump: identical`
- `over-returns clamped:` มีรายการเดียวคือ Fenatex พาเลท 12
- `sample "จีน": OK`
- บรรทัดสุดท้าย `ALL PASS`
- `unmatched legacy names:` จะมี 7 ชื่อ (เช่น `จีน (DAIYIN)`, `อินเดีย (SP)`) ถือว่าปกติ เพราะไม่มียอดต้องส่งคืนหรือใบคืนเลย

```sh
echo $?
```

(วางทันทีหลังคำสั่ง verify) ต้องเห็น: `0`

### 8. ตรวจหน้าจอ

เปิด "บันทึกคืนบรรจุภัณฑ์" → แท็บนำเข้าวัตถุดิบ แล้วเทียบกับ `/root/pkgmig/out/apply/report.md`

| บริษัท | สิ่งที่ต้องเห็น |
|---|---|
| จีน | นำเข้า ณ วันที่ 2026-10-07: กรวยกระดาษ 159,160 · กรวยพลาสติก 10,080 · ไม่ระบุชนิด 26,716 · กระสอบพลาสติก 13,797 · กระสอบไม่ระบุชนิด 1,084 · กล่อง 747 · ต้องส่งคืน/คงค้าง 0 ทุกช่อง (ถ้ามีรับเข้าใหม่หลัง 7 ต.ค. ตัวเลขจะเพิ่มตาม) |
| กังวาลเท็กซ์ไทล์ | ต้องส่งคืน กระบอกพลาสติก 460,909 · ประวัติการคืนมีใบคืนย้อนหลัง |
| Fenatex | คงค้าง 0 · ใบคืนวันที่ 27/05/2026 มีหมายเหตุ "คืนเกินยอดคงค้าง 12" |
| แพรกษาเท็กซ์ไทล์ | นำเข้า กระดาษกั้น 21,362 · ต้องส่งคืน กระดาษกั้น 21,362 (รวม 55 จากใบรับเข้า 1218) |
| จงสถิตย์ | ต้องส่งคืน กระดาษกั้น 0 · พาเลทเหล็ก 0 (ย้ายไปแพรกษาตามใบรับเข้า 1218) |

สำหรับ "จีน": ตัวเลขบนจอรวมใบรับเข้าหลังวันตัดยอดด้วย ส่วนเฉพาะยอดระบบเดิมจะตรงกับหน้าจอระบบเดิมเป็นรายกลุ่ม

**ตรวจ fix วันที่นำเข้า (`1f2196c`, ไม่เขียนข้อมูล):** เปิด "ประวัติการนำเข้าวัตถุดิบ" เลือกรายการใดก็ได้ กดแก้ไข แล้ว**ปิดโดยไม่บันทึก** — วันที่ในฟอร์มต้องตรงกับวันที่ในตาราง (ก่อน fix ฟอร์มแสดงเร็วไป 1 วัน)

ผ่านแล้วจึงแจ้งผู้ใช้ว่าบันทึกใบคืนได้

## จุดที่ถอยไม่ได้

| หลังจาก | ถอยอย่างไร | ถอยไม่ได้เมื่อ |
|---|---|---|
| ขั้น 3 migration | SQL ในขั้น 3 หรือ restore backup | หลังขั้น 6 มีข้อมูลในคอลัมน์ใหม่ → ต้อง rollback สคริปต์ก่อน |
| ขั้น 4 app ใหม่ | สลับกลับ image `pre-pkgmig` | ผู้ใช้บันทึกใบคืนในหน้าใหม่แล้ว โค้ดเดิมไม่มีหน้านี้ แต่ข้อมูลยังอยู่ |
| ขั้น 6 apply | `--rollback --apply` | **ผู้ใช้บันทึกใบคืนที่ไปตัดยอดยกมา** — สคริปต์จะปฏิเสธ ทางเดียวที่เหลือคือ restore backup ขั้น 1 ซึ่งข้อมูลทุกอย่างหลัง backup จะหาย |

**ข้อสรุป:** จุดที่ถอยไม่ได้จริงคือเมื่อมีใบคืนใหม่ตัดยอดยกมาแล้ว ควรทำขั้น 5–8 ต่อเนื่องในช่วงที่ไม่มีคนใช้ และเปิดให้บันทึกใบคืนหลังตรวจหน้าจอผ่านแล้วเท่านั้น

## หลังเสร็จ

```sh
rm -f /root/pkgmig/db.env
```

(ไฟล์นี้มีรหัสผ่านแบบ encode อยู่ ลบทันทีที่เสร็จ)

```sh
docker image rm ast-new-builder:pkgmig
```

(image ชั่วคราว — `COPY . .` ใน stage builder คัดลอก `.env` ของ server เข้าไปด้วย จึงไม่ควรเก็บไว้)

เก็บ `/root/pkgmig/backup` และ `/root/pkgmig/out` ไว้อย่างน้อยจนลูกค้ายืนยันยอด

## หมายเหตุ: DATABASE_URL ของ app

`docker-compose.prod.yml` ประกอบ `DATABASE_URL` ของ app จาก `${POSTGRES_PASSWORD}` ตรง ๆ โดยไม่ encode ทดสอบแล้วว่ารหัสที่มีแค่ `@` ยังใช้ได้ (ตัวแยก URL ใช้ `@` ตัวสุดท้ายเป็นตัวคั่น host) แต่ถ้ารหัสมี `:` `/` `#` `?` หรือ `%` URL จะเพี้ยน (ทดสอบ `p@ss:w/rd#1 x` แบบไม่ encode กับ Prisma CLI แล้วได้ error `P1013`) งานนี้ไม่ได้แก้ส่วนนั้น เพราะ app บน prod ทำงานอยู่แล้ว
