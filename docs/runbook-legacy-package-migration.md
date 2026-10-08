# Runbook: ย้ายยอดบรรจุภัณฑ์ระบบเดิมขึ้น prod

สคริปต์: `scripts/migrate-legacy-packages.ts` (ย้าย) และ `scripts/verify-legacy-packages.ts` (ตรวจ, อ่านอย่างเดียว)
Branch: `feature/package-return-receipts`

**ตารางที่ถูกเขียน:** `packages`, `packageasts`, `htrpackages`, `package_return_obligations`, `package_return_receipts`, `package_return_entries`
**อ่านอย่างเดียว:** `materials`, `suppliers`

## ก่อนเริ่ม: สิ่งที่ต้องมีบน server

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| `ast-packages-20261007.sql` | mysqldump 3 ตารางของระบบเดิม (ห้ามใส่ใน repo) |
| `supplier-map.json` | ชื่อบริษัทระบบเดิม → `suppliers.id` สำหรับ 4 ชื่อที่ไม่ตรง (ยังรอยืนยัน) |

วางทั้งสองไฟล์ไว้ในโฟลเดอร์เดียวนอก repo เช่น `/root/pkgmig/in/` และสร้าง `/root/pkgmig/out/` ไว้รับรายงาน

## ทำไมรันสคริปต์ใน container ของ app ไม่ได้

- image ของ app (`Dockerfile` stage `runner`) เป็น Next.js standalone: ไม่มีโฟลเดอร์ `scripts/`, ไม่มี `tsx`, ไม่มี Prisma CLI
- `docker-compose.prod.yml` ไม่เปิด port ของ Postgres ออกนอก container (ไม่มี `ports:` ที่ service `postgres`) — ต่อได้จาก network `ast_net` เท่านั้น

**วิธีที่ใช้:** build stage `builder` ของ Dockerfile เดิมเป็น image ชั่วคราว (มี `node_modules` ครบรวม devDependencies: `tsx`, `prisma`, `pg` และมี `scripts/`) แล้วรันแบบ `docker run --rm` บน network ของ compose ส่ง `DATABASE_URL` ที่ชี้ `postgres:5432` เอง — ไม่ต้องเปิด port ของฐานข้อมูล, container ถูกลบทันทีหลังรัน, ไฟล์ข้อมูลเข้าแบบ read-only

```sh
cd <repo บน server>
export PW=$(grep ^POSTGRES_PASSWORD .env | cut -d= -f2-)      # ตัวแปรเดียวกับที่ compose ใช้
docker network ls | grep ast_net                               # ได้ชื่อจริง เช่น ast-new_ast_net
export NET=<ชื่อ network ที่ได้>
export DBURL="postgresql://postgres:${PW}@postgres:5432/ast_new"
# ทางลัดสำหรับทุกขั้นข้างล่าง
tool() { docker run --rm --network "$NET" -e DATABASE_URL="$DBURL" \
  -v /root/pkgmig/in:/in:ro -v /root/pkgmig/out:/out ast-new-builder:pkgmig "$@"; }
```

`DATABASE_URL` ที่ส่งด้วย `-e` ชนะค่าใน `.env` ที่อาจติดมากับ image (dotenv ไม่ override ค่าที่มีอยู่แล้ว)

## ลำดับขั้นตอน

ลำดับที่ขอมาคือ backup > deploy โค้ด > migration > dry-run > apply > verify > ตรวจหน้าจอ ผมแยก "deploy โค้ด" เป็น 2 จังหวะ: build image ก่อน → รัน migration → ค่อยสลับ app เป็นตัวใหม่
**เหตุผล:** โค้ดใหม่ query คอลัมน์และตารางที่ migration เพิ่ม ถ้าสลับ app ก่อน หน้าคืนบรรจุภัณฑ์จะ error จนกว่า migration จะเสร็จ ส่วนโค้ดเดิมทำงานกับ schema ใหม่ได้ เพราะ migration ทั้งสองตัวเป็นแบบเพิ่มอย่างเดียว

### 0. รวม branch (ทำบนเครื่อง dev)

- merge `fix/material-entry-date-off-by-one` (1 commit: 1f2196c) และ `feature/package-return-receipts` เข้า `main` แล้ว deploy พร้อมกันในรอบเดียว
- สองตัวนี้ไม่ขึ้นต่อกัน: fix branch ไม่มี migration และไม่ได้แก้ไฟล์ที่งานนี้ใช้ ไฟล์ที่ซ้ำกันมีไฟล์เดียวคือ `src/lib/bangkokDate.ts` ซึ่งเนื้อหาเหมือนกันทุกตัวอักษร (ตรวจด้วย `git merge-tree` แล้ว ไม่มี conflict)
- ถ้าจะแยก deploy: ลำดับไหนก็ได้ แต่ deploy รอบเดียวจะมีช่วงหยุดระบบแค่ครั้งเดียว
- ข้อควรระวังของ fix branch เอง: การตรวจ prod หาแถว importDate ที่เพี้ยนไปแล้ว ยังค้างอยู่ (ไม่เกี่ยวกับงานนี้)

### 1. Backup

```sh
mkdir -p /root/pkgmig/backup
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U postgres -Fc ast_new > /root/pkgmig/backup/ast_new_$(date +%Y%m%d_%H%M)_pre_pkgmig.dump
ls -lh /root/pkgmig/backup/                     # ขนาดต้องไม่ใช่ 0 (backup 2026-10-07 ≈ 3.7 MB)
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -l < /root/pkgmig/backup/<ไฟล์>.dump | head -5   # อ่านไฟล์ได้
docker tag $(docker compose -f docker-compose.prod.yml images -q app) ast-new-app:pre-pkgmig    # เก็บ image ตัวเดิมไว้ถอย
```

ถอยกลับ: ไม่ต้อง (ยังไม่ได้แก้อะไร)

### 2. Build image (ยังไม่สลับ app)

```sh
git fetch && git checkout main && git pull
docker compose -f docker-compose.prod.yml build app
docker build --target builder -t ast-new-builder:pkgmig .     # ใช้ cache ของ build ด้านบน
tool npx tsx --version && tool ls scripts/migrate-legacy-packages.ts   # ตรวจว่าใน image มีครบ
```

ถอยกลับ: ไม่ต้อง (app ตัวเดิมยังรันอยู่)

### 3. Migration 2 ตัว

```sh
tool npx prisma migrate status            # ต้องเห็น pending 2 ตัว:
                                          #   20261007090000_add_package_return_receipts
                                          #   20261007120000_legacy_package_columns
tool npx prisma migrate deploy
```

**ถอยกลับ** (ทำได้เฉพาะก่อนขั้น 6 apply และตอนที่ app ยังเป็นตัวเดิม):

```sql
-- docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres ast_new
BEGIN;
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
-- ตัวที่ 1 (ใบคืน) — เฉพาะถ้ายังไม่มีใครบันทึกใบคืน: SELECT count(*) FROM package_return_receipts; ต้องเป็น 0
ALTER TABLE package_return_entries DROP CONSTRAINT "package_return_entries_receiptId_fkey";
DROP INDEX "package_return_entries_receiptId_idx";
ALTER TABLE package_return_entries DROP COLUMN "receiptId";
DROP TABLE package_return_receipts;
DELETE FROM _prisma_migrations WHERE migration_name IN
  ('20261007090000_add_package_return_receipts', '20261007120000_legacy_package_columns');
COMMIT;
```

หรือถ้าไม่แน่ใจ: restore จาก backup ขั้น 1 ก็ได้ เพราะยังไม่มีข้อมูลใหม่

### 4. สลับ app เป็นตัวใหม่

```sh
docker compose -f docker-compose.prod.yml up -d app
docker compose -f docker-compose.prod.yml logs --tail=50 app
```

แนะนำให้แจ้งผู้ใช้**ไม่บันทึกใบคืนบรรจุภัณฑ์**จนกว่าจะจบขั้น 8 (ดู "จุดที่ถอยไม่ได้")

**ถอยกลับ:** `docker tag ast-new-app:pre-pkgmig <ชื่อ image ของ service app>` แล้วรัน `up -d app` อีกครั้ง (schema ใหม่ใช้กับโค้ดเดิมได้)

### 5. Dry-run

```sh
tool npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql \
  --supplier-map=/in/supplier-map.json --report=/out/dryrun
```

ต้องได้:

- `dump rows: {"packages":4390,"packageasts":8058,"htrpackages":82}`
- `unmatched names 0`, `sample "จีน": OK` และไม่มีบริษัทไหนเป็น `FAIL`
- ตัวเลขควรตรงกับ dry-run บน local: ยอดยกมา 8,101 รายการ, ใบคืน 82 ใบ, คืนเกินยอด 1 รายการ (Fenatex) — ตัวเลขอาจขยับได้ ถ้า supplier-map ต่างจาก map ทดสอบ หรือถ้า prod ถูกแก้ไขหลังวันที่ 2026-10-07
- dry-run เขียนจริงในทรานแซกชันแล้ว ROLLBACK ผลข้างเคียงอย่างเดียวคือเลข id ของ obligations และใบคืนจะข้ามไปบางช่วง

ถอยกลับ: ไม่ต้อง

### 6. Apply

```sh
tool npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql \
  --supplier-map=/in/supplier-map.json --report=/out/apply --apply
```

- สคริปต์จะไม่ commit ถ้ายังมีชื่อบริษัทที่จับคู่ไม่ได้ หรือมีบริษัทที่ FAIL
- ถ้ารันซ้ำหลัง commit สคริปต์จะปฏิเสธ (ตารางปลายทางไม่ว่าง)

**ถอยกลับ:**

```sh
tool npx tsx scripts/migrate-legacy-packages.ts --rollback            # ดูว่าจะลบกี่แถว
tool npx tsx scripts/migrate-legacy-packages.ts --rollback --apply
```

ลบเฉพาะสิ่งที่สคริปต์สร้าง (3 ตารางเดิม + ยอดยกมา + ใบคืน/รายการที่มาจาก htrpackages) ใบคืนและยอดค้างที่สร้างในระบบใหม่ไม่ถูกแตะ
ถ้ามีผู้ใช้บันทึกใบคืนที่ไปตัดยอดยกมาแล้ว สคริปต์จะปฏิเสธการ rollback

### 7. Verify

```sh
tool npx tsx scripts/verify-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/supplier-map.json
```

ต้องได้ `copy vs dump: identical` และ `ALL PASS` (exit code 0) ส่วนต่างที่อธิบายได้จะแสดงพร้อมเหตุผล

### 8. ตรวจหน้าจอ

เปิด "บันทึกคืนบรรจุภัณฑ์" → แท็บนำเข้าวัตถุดิบ แล้วเทียบกับ `/root/pkgmig/out/apply/report.md`

| บริษัท | สิ่งที่ต้องเห็น |
|---|---|
| จีน | นำเข้า ณ วันที่ 2026-10-07: กรวยกระดาษ 159,160 · กรวยพลาสติก 10,080 · ไม่ระบุชนิด 26,716 · กระสอบพลาสติก 13,797 · กระสอบไม่ระบุชนิด 1,084 · กล่อง 747 · ต้องส่งคืน/คงค้าง 0 ทุกช่อง (ถ้ามีรับเข้าใหม่หลัง 7 ต.ค. ตัวเลขจะเพิ่มตาม) |
| กังวาลเท็กซ์ไทล์ | ต้องส่งคืน กระบอกพลาสติก 460,909 · ประวัติการคืนมีใบคืนย้อนหลัง |
| Fenatex | คงค้าง 0 · ใบคืนวันที่ 27/05/2026 มีหมายเหตุ "คืนเกินยอดคงค้าง 12" |
| แพรกษาเท็กซ์ไทล์ | นำเข้า กระดาษกั้น 21,362 |

สำหรับ "จีน": ตัวเลขบนจอรวมใบรับเข้าหลังวันตัดยอดด้วย ส่วนเฉพาะยอดระบบเดิมจะตรงกับหน้าจอระบบเดิมเป็นรายกลุ่ม

## จุดที่ถอยไม่ได้

| หลังจาก | ถอยอย่างไร | ถอยไม่ได้เมื่อ |
|---|---|---|
| ขั้น 3 migration | SQL ด้านบน หรือ restore backup | หลังขั้น 6 มีข้อมูลในคอลัมน์ใหม่ → ต้อง rollback สคริปต์ก่อน |
| ขั้น 4 app ใหม่ | สลับกลับ image `pre-pkgmig` | ผู้ใช้บันทึกใบคืนในหน้าใหม่แล้ว โค้ดเดิมไม่มีหน้านี้ แต่ข้อมูลยังอยู่ |
| ขั้น 6 apply | `--rollback --apply` | **ผู้ใช้บันทึกใบคืนที่ไปตัดยอดยกมา** — สคริปต์จะปฏิเสธ ทางเดียวที่เหลือคือ restore backup ขั้น 1 ซึ่งข้อมูลทุกอย่างหลัง backup จะหาย |

**ข้อสรุป:** จุดที่ถอยไม่ได้จริงคือเมื่อมีใบคืนใหม่ตัดยอดยกมาแล้ว ควรทำขั้น 5–8 ต่อเนื่องในช่วงที่ไม่มีคนใช้ และเปิดให้บันทึกใบคืนหลังตรวจหน้าจอผ่านแล้วเท่านั้น

## หลังเสร็จ

```sh
docker image rm ast-new-builder:pkgmig        # image ชั่วคราว
# เก็บ /root/pkgmig/backup และ /root/pkgmig/out ไว้อย่างน้อยจนลูกค้ายืนยันยอด
```
