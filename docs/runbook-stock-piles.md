# Runbook: กองผ้า (stock piles) — deploy ขึ้น prod

งาน: สต็อกผ้าสร้างกองเองได้ (คีย์ผ้าเข้าสต็อก), ย้ายล็อตระหว่างกอง, เปิดบิลผ้า/จัดการบิล → ตัดสต็อก เลือกกองได้

## สรุปก่อนเริ่ม

- **Migration 1 ตัว:** `20261017090000_add_stock_piles` — แบบเพิ่มอย่างเดียว: ตารางใหม่ `stock_piles` + คอลัมน์ `stock_pile_id` (ว่างได้) ใน `stockfabrics` และ `fabricouts` + index + foreign key
- **ข้อมูลเดิมไม่ถูกแก้:** ทุกแถวเดิมได้ `stock_pile_id = NULL` = กองหลัก ซึ่งจัดกลุ่มแบบเดิมทุกประการ (ทดสอบบน dev แล้ว: หน้าสต็อกผ้าและการค้นหาสต็อก ให้ผลตรงกับโค้ด main เดิมทุกกลุ่ม ทุกตัวกรอง)
- **โค้ดเดิมทำงานกับ schema ใหม่ได้** (คอลัมน์ใหม่ว่างได้ทั้งหมด) จึงรัน migration ก่อน แล้วค่อยสลับ app — ถ้าต้องถอย สลับ image กลับอย่างเดียวพอ ไม่ต้องย้อน migration
- **ลำดับ:** backup → pull + build → migration → สลับ app → ตรวจ → เก็บกวาด
- ใช้วิธีเดียวกับ `runbook-legacy-package-migration.md`: build stage `builder` เป็น image ชั่วคราว แล้วรัน `prisma migrate deploy` ผ่าน `scripts/legacy-packages/tool.sh` (ไม่ต้องเปิด port, รหัสผ่านไม่อยู่ใน command line)

## 1. Backup (server)

```sh
cd /home/deploy/ast-new
```

```sh
mkdir -p /root/pkgmig/backup /root/pkgmig/in /root/pkgmig/out
```

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc ast_new > /root/pkgmig/backup/ast_new_pre_stockpiles.dump
```

```sh
ls -lh /root/pkgmig/backup/ast_new_pre_stockpiles.dump
```

ต้องเห็น: ขนาดหลาย MB ไม่ใช่ 0

```sh
docker inspect --format '{{.Config.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)" > /root/pkgmig/app-image.txt
```

```sh
docker tag "$(docker inspect --format '{{.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)")" ast-new-app:pre-stockpiles
```

```sh
docker image ls ast-new-app:pre-stockpiles
```

ต้องเห็น: 1 แถว

## 2. Pull และ build

```sh
git pull --ff-only origin main
```

(ถ้าเจ้าของ repo เป็น `deploy` ใช้ `sudo -u deploy git pull --ff-only origin main`) ต้องเห็น: `Fast-forward`

```sh
test -f prisma/migrations/20261017090000_add_stock_piles/migration.sql && test -f src/app/api/warehouse/stock/piles/route.ts && echo READY
```

ต้องเห็น: `READY`

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

ต้องเห็น: `1`

## 3. Migration

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate status
```

ต้องเห็น: `Following migration have not yet been applied:` ตามด้วยชื่อนี้ **ชื่อเดียว** (คำสั่งจบด้วย exit code 1 เมื่อมี migration ค้าง ถือว่าปกติ)

```
20261017090000_add_stock_piles
```

ถ้ามีชื่ออื่นค้างด้วย ให้หยุด

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate deploy
```

ต้องเห็น: `All migrations have been successfully applied.`

```sh
sh scripts/legacy-packages/tool.sh npx prisma migrate status
```

ต้องเห็น: `Database schema is up to date!`

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -c "SELECT (SELECT count(*) FROM stock_piles) AS piles, (SELECT count(*) FROM stockfabrics WHERE stock_pile_id IS NOT NULL) AS stock_in_piles, (SELECT count(*) FROM fabricouts WHERE stock_pile_id IS NOT NULL) AS bills_in_piles;"
```

ต้องเห็น: `0 | 0 | 0`

**ถอยกลับ (ถ้าจำเป็น ก่อนสลับ app):** ไม่ต้องทำอะไร — app ตัวเดิมยังรันอยู่และไม่ใช้คอลัมน์ใหม่

## 4. สลับ app

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

```sh
docker compose -f docker-compose.prod.yml logs --tail=30 app
```

ต้องเห็น: `Ready in ...` ไม่มี `Error`

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
```

ต้องเห็น: `200`

**ถอยกลับ** (schema ใหม่ใช้กับโค้ดเดิมได้ ไม่ต้องย้อน migration):

```sh
docker tag ast-new-app:pre-stockpiles "$(cat /root/pkgmig/app-image.txt)"
```

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

## 5. ตรวจหน้าจอ

1. **สต็อกผ้า** — จำนวน "ทั้งหมด N กลุ่ม" และตัวเลขผลิต/ใช้ไป/คงเหลือ ต้องเท่ากับก่อน deploy (ยังไม่มีกองที่สร้างเอง)
2. **คีย์ผ้าเข้าสต็อก** — มีช่อง "กองผ้า" ค่าเริ่มต้น "กองหลัก" คีย์ผ้าแบบเดิมได้ตามปกติ
3. ทดลองบนผ้าทดสอบ (หรือผ้าจริงที่ต้องการแยกกอง):
   - กรอกโครงสร้าง/ลาย/หน้ากว้าง/ลูกค้า → "+ สร้างกองใหม่" → ตั้งชื่อ → คีย์หลา → บันทึก
   - สต็อกผ้า: เห็นแถวใหม่มีป้าย "กอง: ชื่อ"
   - รายละเอียดของกองหลัก → ติ๊กล็อต → "ย้ายไปกองอื่น" → เลือกกอง → ยืนยัน
   - เปิดบิลผ้า: ช่อง "ตัดจากสต็อก" มีป้าย "กอง: ชื่อ" ให้เลือก
   - จัดการบิล → ตัดสต็อก: เลือกกอง / กองหลัก ได้ และ "ใช้ไป" ย้ายตาม
4. **รายงาน** สรุปสต็อก / ความเคลื่อนไหวสต็อก — ตัวเลขเท่าเดิม (รายงานรวมทุกกองตาม โครงสร้าง/ลาย/หน้ากว้าง เหมือนเดิม)

ประวัติการย้ายกองอยู่ใน `audit_logs` (`table_name = 'stockfabrics'`, `field_name = 'stockPile'`, `record_key` = refId ของล็อต)

## หลังเสร็จ

```sh
rm -f /root/pkgmig/db.env
```

(ไฟล์นี้มีรหัสผ่านแบบ encode อยู่ ลบทันทีที่เสร็จ)

```sh
docker image rm ast-new-builder:pkgmig
```

(image ชั่วคราว — `COPY . .` ใน stage builder คัดลอก `.env` ของ server เข้าไปด้วย จึงไม่ควรเก็บไว้)

เก็บ `ast_new_pre_stockpiles.dump` และ tag `ast-new-app:pre-stockpiles` ไว้จนกว่าผู้ใช้ยืนยันว่าใช้งานได้ แล้วค่อยลบ:

```sh
docker image rm ast-new-app:pre-stockpiles
```

## ถ้าต้องการถอด schema ออกทั้งหมด (ไม่จำเป็นปกติ)

ทำได้เฉพาะตอนที่ยังไม่มีใครสร้างกอง (`stock_piles` ว่าง) และสลับ app กลับเป็นตัวเดิมแล้วเท่านั้น:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM stock_piles) > 0 THEN RAISE EXCEPTION 'มีกองผ้าแล้ว ห้ามถอด — ใช้ restore backup'; END IF;
END $$;
ALTER TABLE stockfabrics DROP CONSTRAINT stockfabrics_stock_pile_id_fkey;
ALTER TABLE fabricouts DROP CONSTRAINT fabricouts_stock_pile_id_fkey;
DROP INDEX stockfabrics_stock_pile_id_idx;
DROP INDEX fabricouts_stock_pile_id_idx;
ALTER TABLE stockfabrics DROP COLUMN stock_pile_id;
ALTER TABLE fabricouts DROP COLUMN stock_pile_id;
DROP TABLE stock_piles;
DELETE FROM _prisma_migrations WHERE migration_name = '20261017090000_add_stock_piles';
COMMIT;
SQL
```

ต้องเห็น: `COMMIT` บรรทัดสุดท้าย
