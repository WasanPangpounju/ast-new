# Runbook: รอบแก้ยอดยกมาบรรจุภัณฑ์ตามหลัก "ต้องส่งคืนต้องไม่เกินนำเข้า" (2026-10-09)

ต่อจากรอบแรก (`docs/runbook-legacy-package-migration.md` ซึ่ง apply บน prod ไปแล้ว) รอบนี้ **ไม่มี migration ใหม่** แก้เฉพาะโค้ดและข้อมูลยอดยกมา

**สิ่งที่เปลี่ยน**
- สคริปต์ย้ายข้อมูลยกยอดต้องส่งคืนของระบบเดิมตามหลักที่ลูกค้ายืนยัน 2026-10-09 ดังนี้
  - ก) ต้องจับคู่กับใบรับเข้าที่ยังมีอยู่ได้
  - ข) ยอดอยู่กับบริษัทปัจจุบันของใบรับเข้านั้น
  - ค) จำนวนต่อใบ ต่อกลุ่ม ไม่เกินจำนวนใน material
  - ง) จัดชนิดย่อยด้วยหลักเดียวกับฝั่งนำเข้า
- verify เทียบกับหน้าจอระบบเดิมตามชื่อบริษัท (รวมบั๊กกระบอกพลาสติกของหน้าเดิม) และ FAIL ถ้ามีช่องไหนต้องส่งคืนหรือคงค้างเกินนำเข้า
- ปุ่ม "ยกเลิก" ของใบคืนที่ย้ายมาจากระบบเดิมถูกล็อก ทั้งหน้าจอและ API

**ตารางที่ถูกเขียน:** เหมือนรอบแรก (`packages`, `packageasts`, `htrpackages`, `package_return_obligations`, `package_return_receipts`, `package_return_entries`) อ่านอย่างเดียว: `materials`, `suppliers`

**ลำดับ:** ตรวจว่าไม่มีใบคืนใหม่ > backup > deploy โค้ด > rollback > dry-run > apply > verify > ตรวจหน้าจอ

วิธีอ่านเหมือนรอบแรก: ทุกกล่องคือคำสั่งเดียว, ใต้กล่องมี **ต้องเห็น** ถ้าไม่ตรงให้หยุด, รันบน server เป็น root จาก `/home/deploy/ast-new` ยกเว้นขั้นที่เขียนว่า "เครื่องคุณ" ไม่มีคำสั่งไหนแสดงรหัสผ่าน

---

## F0. ก่อนเริ่ม

- ผู้ใช้หยุดบันทึกใบคืนบรรจุภัณฑ์ (แจ้งแล้ว 2026-10-09) และงดแก้จำนวนบรรจุภัณฑ์หรือบริษัทในใบรับเข้าเก่า จนกว่าจะจบขั้น F8
- แคปหน้าจอ "บันทึกคืนบรรจุภัณฑ์" ของ **แพรกษาเท็กซ์ไทล์ มาดีสปินนิ่ง กังวาลเท็กซ์ไทล์** ไว้ก่อน ใช้เทียบในขั้น F8 (ค่าหลัง = ค่าก่อน + ส่วนต่างในตาราง F8)
- ไฟล์ `/root/pkgmig/in/ast-packages-20261007.sql` และ `legacy-supplier-map-20261008.json` ยังอยู่จากรอบแรก

```sh
sha256sum /root/pkgmig/in/*
```

ต้องเห็น 2 บรรทัดเดิม:

```
b62a97b5e421632b6423209b3ff4147a0570225d0dbc39da92c5590ed0a7c6f7  /root/pkgmig/in/ast-packages-20261007.sql
b3b5284ffb17d2550af865b2723aaa98b4fc1213392263c77858ef79b4758657  /root/pkgmig/in/legacy-supplier-map-20261008.json
```

## F1. ตรวจว่าไม่มีใบคืนใหม่ที่ไปตัดยอดยกมา (server)

```sh
cd /home/deploy/ast-new
```

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -Atc 'SELECT count(*) FROM package_return_entries e JOIN package_return_obligations o ON o.id = e."obligationId" WHERE o."legacyRef" IS NOT NULL AND (e."receiptId" IS NULL OR e."receiptId" NOT IN (SELECT "receiptId" FROM htrpackages WHERE "receiptId" IS NOT NULL));'
```

ต้องเห็น: `0` ถ้าได้มากกว่า 0 ให้หยุด (มีใบคืนที่บันทึกในระบบใหม่ตัดยอดยกมาแล้ว rollback จะถูกปฏิเสธ ต้องตกลงวิธีจัดการก่อน)

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -Atc 'SELECT count(*) FROM package_return_receipts r WHERE r."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM htrpackages h WHERE h."receiptId" = r.id);'
```

ต้องเห็น: `0` (ไม่มีใบคืนที่สร้างในระบบใหม่เลย ตามที่ยืนยัน 2026-10-09) ถ้าไม่ใช่ 0 ให้หยุดและส่งตัวเลขมาดู

## F2. Backup (server)

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc ast_new > /root/pkgmig/backup/ast_new_pre_pkgfix.dump
```

ต้องเห็น: ไม่มีข้อความ

```sh
ls -lh /root/pkgmig/backup/ast_new_pre_pkgfix.dump
```

ต้องเห็น: ขนาดหลาย MB และใหญ่กว่า `ast_new_pre_pkgmig.dump` ของรอบแรก (มียอดยกมาแล้ว)

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -l < /root/pkgmig/backup/ast_new_pre_pkgfix.dump | grep -c 'TABLE DATA'
```

ต้องเห็น: ตัวเลขใกล้เคียงรอบแรก (ประมาณ 39) ถ้าได้ 0 หรือ error แปลว่า backup อ่านไม่ได้

```sh
docker inspect --format '{{.Config.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)" > /root/pkgmig/app-image.txt
```

```sh
docker tag "$(docker inspect --format '{{.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)")" ast-new-app:pre-pkgfix
```

```sh
docker image ls ast-new-app:pre-pkgfix
```

ต้องเห็น: 1 แถว (image ที่รันอยู่ตอนนี้ เก็บไว้ถอย)

## F3. Deploy โค้ด

### F3.1 รวม branch เข้า main และ push (เครื่องคุณ)

```sh
git fetch origin
```

```sh
git rev-parse --short origin/main
```

ต้องเห็น: `7ebe2f2` (main ที่ขึ้น prod รอบแรก) ถ้าไม่ใช่ให้หยุด

```sh
git switch main
```

```sh
git merge --ff-only fix/legacy-package-principle
```

ต้องเห็น: `Fast-forward`

```sh
git log --oneline 7ebe2f2..HEAD
```

ต้องเห็น: เฉพาะ commit ของ branch `fix/legacy-package-principle` (หลักต้องส่งคืนไม่เกินนำเข้า, ล็อกใบคืนระบบเดิม, runbook นี้) ไม่มีงานอื่น

```sh
git diff --name-only 7ebe2f2 HEAD -- prisma
```

ต้องเห็น: ว่าง (ไม่มี migration หรือ schema ใหม่)

```sh
npx vitest run
```

ต้องเห็น: `Tests  28 passed (28)` (ทดสอบบนเครื่องผม 2026-10-09)

```sh
git push origin main
```

### F3.2 build และสลับ app (server)

```sh
git pull --ff-only origin main
```

(ถ้าเจ้าของ repo เป็น `deploy` ใช้ `sudo -u deploy git pull --ff-only origin main`) ต้องเห็น: `Updating 7ebe2f2..<hash>` และ `Fast-forward`

```sh
grep -c 'planCarryForward' scripts/legacy-packages/lib.ts
```

ต้องเห็น: ตัวเลขมากกว่า 0 (โค้ดรอบนี้อยู่บน server แล้ว)

```sh
docker compose -f docker-compose.prod.yml build app
```

```sh
docker build --target builder -t ast-new-builder:pkgmig .
```

ต้องเห็น: build ทั้งสองจบโดยไม่มี error

```sh
install -m 600 /dev/null /root/pkgmig/db.env
```

```sh
docker run --rm -i ast-new-builder:pkgmig node scripts/legacy-packages/db-env.mjs < .env > /root/pkgmig/db.env
```

ต้องเห็น: ไม่มีข้อความ

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `"packages": 4390, "packageasts": 8058, "htrpackages": 82, "package_return_receipts": 82, "package_return_entries": 1708` และ `package_return_obligations` = 8101 + จำนวนยอดค้างของใบรับเข้าใหม่ จดค่านี้ไว้ (เรียกว่า **N**)

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

```sh
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/login
```

ต้องเห็น: `200`

ถอยกลับ: `docker tag ast-new-app:pre-pkgfix "$(cat /root/pkgmig/app-image.txt)"` แล้ว `docker compose -f docker-compose.prod.yml up -d --no-build app` (ยังไม่ได้แก้ข้อมูล)

## F4. Rollback ยอดยกมาของรอบแรก

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --rollback
```

ต้องเห็น:

```
rows deleted: {
  package_return_entries: 1708,
  package_return_receipts: 82,
  package_return_obligations: 8101,
  htrpackages: 82,
  packageasts: 8058,
  packages: 4390
}
dry run — nothing changed (add --apply to commit the rollback)
```

ถ้าเห็น `rollback refused: ...` ให้หยุด (มีใบคืนใหม่ตัดยอดยกมา ตรงข้ามกับผล F1)

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --rollback --apply
```

ต้องเห็น: ตัวเลขเดียวกัน และ `ROLLBACK APPLIED (committed)`

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `packages`, `packageasts`, `htrpackages`, `package_return_receipts`, `package_return_entries` เป็น `0` และ `package_return_obligations` = N − 8101

**จากจุดนี้ถึงจบ F6 หน้าคืนบรรจุภัณฑ์จะไม่มียอดยกมา** ทำ F5 และ F6 ต่อทันที

ถอยกลับ: restore `/root/pkgmig/backup/ast_new_pre_pkgfix.dump` (ยังไม่มีข้อมูลใหม่หลัง backup เพราะผู้ใช้หยุดบันทึก)

## F5. Dry-run

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json --report=/out/fix-dryrun
```

ต้องเห็น (ตรงกับ dry-run บนสำเนา local 2026-10-09):

```
dump rows: {"packages":4390,"packageasts":8058,"htrpackages":82}
after: {..."legacy_obligations":8089,"new_receipts":82,"new_entries":1706,...}
pairing: 4029 paired, 361 packages-only, unpaired return rows: 0
carry: 3888 legacy rows → 8089 obligations; dropped {"ใบรับเข้าถูกลบในระบบเดิม":8,"หาใบรับเข้าไม่พบ":4}; capped 33 (material × group); moved company 6; linked by time 265
receipts 82, entries 1706, over-returns 1, unmatched ใบคืน names 0
ต้องส่งคืน/คงค้าง > นำเข้า: 0 cells (0 not allowed)
sample "จีน" (2026-10-07): OK
sample "บริษัท แพรกษาเท็กซ์ไทล์ จำกัด" (2026-10-09): OK
sample "บริษัท มาดีสปินนิ่ง" (2026-10-09): OK
sample "บริษัท กังวาลเท็กซ์ไทล์ จำกัด" (2026-10-09): OK
```

- 15 บริษัทเป็น `PASS (อธิบายได้)`: กรุงไทยเมล่อน, กังวาลเท็กซ์ไทล์, กังวาลสปินนิ่ง, กั๋ว จวิน เท็กซ์ไทล์ (ไทยแลนด์), เควินซาน, จงสถิตย์, ไทยคูราโบ, ไทยรุ่งเท็กซ์ไทล์, พิพัฒนกิจเท็กซ์ไทล์, แพรกษาเท็กซ์ไทล์, มาดีสปินนิ่ง, อินโดไทยซินเทติคซ์, เอส แอล การทอ, LP. (ตีเกลียว), Fenatex ที่เหลือ `PASS` ต้องไม่มี `FAIL`
- บรรทัดสุดท้าย `DRY RUN — rolled back, nothing changed`
- ถ้า `ต้องส่งคืน/คงค้าง > นำเข้า` ไม่ใช่ 0 หรือ `capped` ไม่ใช่ 33 แปลว่ามีการแก้ใบรับเข้าเก่าหลัง 2026-10-07 ให้หยุดและส่ง `/root/pkgmig/out/fix-dryrun/report.md` มาดู

## F6. Apply

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/migrate-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json --report=/out/fix-apply --apply
```

ต้องเห็น: ตัวเลขเหมือน F5 ทุกบรรทัด และบรรทัดสุดท้าย `APPLIED — committed`
(สคริปต์ไม่ commit ถ้ามีบริษัท FAIL, มีช่องต้องส่งคืนเกินนำเข้า, ตัวอย่างหน้าจอไม่ตรง หรือมีชื่อที่จับคู่ไม่ได้ — จะจบด้วย `not committed: ...`)

```sh
sh scripts/legacy-packages/tool.sh node scripts/legacy-packages/db-check.mjs
```

ต้องเห็น: `packages 4390`, `packageasts 8058`, `htrpackages 82`, `package_return_receipts 82`, `package_return_entries 1706`, `package_return_obligations` = N − 8101 + 8089 (= N − 12)

ถอยกลับ: `--rollback` แล้ว `--rollback --apply` (เหมือน F4) แล้ว restore `ast_new_pre_pkgfix.dump` ถ้าต้องการกลับไปเป็นยอดยกมาของรอบแรก

## F7. Verify

```sh
sh scripts/legacy-packages/tool.sh npx tsx scripts/verify-legacy-packages.ts --dump=/in/ast-packages-20261007.sql --supplier-map=/in/legacy-supplier-map-20261008.json
```

ต้องเห็น:

```
copy vs dump: identical
...
over-returns clamped: [{"supplier":"Fenatex Co.,Ltd.","htrId":224,"field":"พาเลท","bucket":"พาเลท","qty":12}]
sample "จีน" (legacy screen 2026-10-07): OK
sample "บริษัท แพรกษาเท็กซ์ไทล์ จำกัด" (legacy screen 2026-10-09): OK
sample "บริษัท มาดีสปินนิ่ง" (legacy screen 2026-10-09): OK
sample "บริษัท กังวาลเท็กซ์ไทล์ จำกัด" (legacy screen 2026-10-09): OK
ต้องส่งคืน/คงค้าง > นำเข้า: none

ALL PASS
```

ใต้ `PASS (อธิบายได้) บริษัท กังวาลเท็กซ์ไทล์ จำกัด` จะเห็นช่องกระบอกพลาสติกแยก เช่น `ต้องส่งคืน / หลอด กระบอก พลาสติก: legacy 463753 new 460909 — บั๊กกระบอกพลาสติกของหน้าเดิม (ต้องส่งคืนนับจากแถวนำเข้า) −960, ไม่มีใบรับเข้า (ไม่ยกมา) −1884` ถือว่าปกติ

```sh
echo $?
```

(วางทันทีหลัง verify) ต้องเห็น: `0`

ตรวจยอดยกมาของ 3 บริษัทโดยตรง (ไม่ขึ้นกับใบรับเข้าใหม่):

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -c "SELECT s.name AS company, o.category, COALESCE(o.variant, '-') AS variant, sum(o.\"qtyDue\") AS due, sum(o.\"qtyReturned\") AS returned FROM package_return_obligations o JOIN suppliers s ON s.id = o.\"supplierId\" WHERE o.\"legacyRef\" IS NOT NULL AND s.name IN ('บริษัท แพรกษาเท็กซ์ไทล์ จำกัด', 'บริษัท มาดีสปินนิ่ง', 'บริษัท กังวาลเท็กซ์ไทล์ จำกัด') GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;"
```

ต้องเห็น 18 แถวนี้ (due / returned):

| บริษัท | category | variant | due | returned |
|---|---|---|---|---|
| กังวาลเท็กซ์ไทล์ | SACK | - | 3437 | 3437 |
| กังวาลเท็กซ์ไทล์ | SACK | plastic | 64788 | 32128 |
| กังวาลเท็กซ์ไทล์ | SPOOL | - | 41420 | 0 |
| กังวาลเท็กซ์ไทล์ | SPOOL | spoolC_plastic | 460909 | 274200 |
| กังวาลเท็กซ์ไทล์ | SPOOL | spool_paper | 75580 | 23795 |
| กังวาลเท็กซ์ไทล์ | SPOOL | spool_plastic | 242820 | 134335 |
| มาดีสปินนิ่ง | PALLET | wood | 418 | 0 |
| มาดีสปินนิ่ง | SPOOL | spoolC_plastic | 91240 | 0 |
| มาดีสปินนิ่ง | SPOOL | spool_plastic | 1400 | 0 |
| มาดีสปินนิ่ง | PAPER_BAR | - | 4738 | 0 |
| แพรกษาเท็กซ์ไทล์ | PALLET | - | 142 | 0 |
| แพรกษาเท็กซ์ไทล์ | PALLET | steel | 1667 | 455 |
| แพรกษาเท็กซ์ไทล์ | PALLET | wood | 58 | 5 |
| แพรกษาเท็กซ์ไทล์ | SACK | - | 578 | 578 |
| แพรกษาเท็กซ์ไทล์ | SACK | plastic | 11363 | 3073 |
| แพรกษาเท็กซ์ไทล์ | SPOOL | - | 45980 | 0 |
| แพรกษาเท็กซ์ไทล์ | SPOOL | spool_plastic | 630174 | 184620 |
| แพรกษาเท็กซ์ไทล์ | PAPER_BAR | - | 21362 | 5226 |

## F8. ตรวจหน้าจอ

เปิด "บันทึกคืนบรรจุภัณฑ์" → แท็บนำเข้าวัตถุดิบ เลือกบริษัททีละตัว

**แพรกษาเท็กซ์ไทล์** — ค่าก่อนแก้คือรูปแคป prod 2026-10-09 12:20 (ถ้ามีรับเข้าใหม่หลังจากนั้น ให้ใช้ค่าก่อน + ส่วนต่าง)

| แถว | กรวยกระดาษ | กรวยพลาสติก | หลอดไม่ระบุชนิด | กระสอบพลาสติก | กระสอบไม่ระบุชนิด | พาเลทไม้ | พาเลทเหล็ก | พาเลทไม่ระบุชนิด | กระดาษกั้น |
|---|---|---|---|---|---|---|---|---|---|
| นำเข้า (ไม่เปลี่ยน) | 255 | 642,791 | 59,197 | 12,205 | 719 | 70 | 1,745 | 193 | 21,362 |
| ต้องส่งคืน | 0 | **642,791** (−300) | **45,980** (−1,782) | 12,205 | **578** (−119) | 58 | **1,667** (−1) | 142 | 21,362 |
| คืนแล้ว | 0 | 184,620 | 0 | **3,073** (+119) | **578** (−119) | 5 | 455 | 0 | 5,226 |
| คงค้าง | 0 | **458,171** (−300) | **45,980** (−1,782) | **9,132** (−119) | 0 | 53 | **1,212** (−1) | 142 | 16,136 |

**มาดีสปินนิ่ง** — ค่าหลัง = ค่าก่อน (แคปใน F0) + ส่วนต่าง

| แถว | หลอดไม่ระบุชนิด | พาเลทไม้ | พาเลทไม่ระบุชนิด | ช่องอื่น |
|---|---|---|---|---|
| ต้องส่งคืน | −75 (ยอดยกมาเหลือ 0) | −327 (ยอดยกมาเหลือ 418) | −1 (ยอดยกมาเหลือ 0) | ไม่เปลี่ยน |
| คืนแล้ว | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่เปลี่ยน |
| คงค้าง | −75 | −327 | −1 | ไม่เปลี่ยน |

พาเลทไม้ ต้องส่งคืน ต้องไม่เกินนำเข้าพาเลทไม้ (ก่อนแก้ 745 เกินนำเข้า 435)

**กังวาลเท็กซ์ไทล์** — ค่าหลัง = ค่าก่อน (แคปใน F0) + ส่วนต่าง; ส่วนยอดยกมาอย่างเดียวต้องได้ตามคอลัมน์ขวา

| แถว | หลอดไม่ระบุชนิด | กระสอบพลาสติก | กระสอบไม่ระบุชนิด | ช่องอื่น | ยอดยกมาอย่างเดียว (รวมกลุ่ม) |
|---|---|---|---|---|---|
| ต้องส่งคืน | −1,758 | ไม่เปลี่ยน | −161 | ไม่เปลี่ยน | หลอด 820,729 · กระสอบ 68,225 |
| คืนแล้ว | ไม่เปลี่ยน | +161 | −161 | ไม่เปลี่ยน | กรวยกระดาษ 23,795 · กรวยพลาสติก 134,335 · กระบอกพลาสติก 274,200 · กระสอบรวม 35,565 (ตรงกับหน้าจอระบบเดิม) |
| คงค้าง | −1,758 | −161 | ไม่เปลี่ยน (0) | ไม่เปลี่ยน | หลอด 388,399 · กระสอบ 32,660 |

กระบอกพลาสติก ต้องส่งคืน ยังเป็น 460,909 (หน้าจอระบบเดิมแสดง 463,753 เพราะบั๊กของหน้าเดิม 960 และใบรับเข้าที่ถูกลบในระบบเดิม 1,884 — อธิบายไว้ในเอกสารลูกค้าแล้ว)

**ทุกบริษัท:** ไม่มีช่องที่ ต้องส่งคืน หรือ คงค้าง มากกว่า นำเข้า

**ใบคืนระบบเดิม:** ในประวัติการคืน แถวที่หมายเหตุขึ้นต้นด้วย "ย้ายจากระบบเดิม" ต้องแสดง "ระบบเดิม" แทนปุ่ม "ยกเลิก"

ผ่านแล้วจึงแจ้งผู้ใช้ว่าบันทึกใบคืนได้ (ยังงดแก้จำนวนบรรจุภัณฑ์หรือบริษัทในใบรับเข้าเก่า จนกว่างาน A จะขึ้น)

## หลังเสร็จ

```sh
rm -f /root/pkgmig/db.env
```

```sh
docker image rm ast-new-builder:pkgmig
```

เก็บ `/root/pkgmig/backup/ast_new_pre_pkgfix.dump` และ `/root/pkgmig/out/fix-*` ไว้จนลูกค้ายืนยันยอด

## จุดที่ถอยไม่ได้

| หลังจาก | ถอยอย่างไร | ถอยไม่ได้เมื่อ |
|---|---|---|
| F3 app ใหม่ | สลับกลับ image `pre-pkgfix` | — (โค้ดเดิมใช้ข้อมูลใหม่ได้ ไม่มี migration) |
| F4 rollback | restore `ast_new_pre_pkgfix.dump` | มีคนบันทึกข้อมูลอื่นหลัง backup (restore จะลบทิ้ง) |
| F6 apply | `--rollback --apply` แล้ว apply ใหม่ | ผู้ใช้บันทึกใบคืนที่ไปตัดยอดยกมาแล้ว |
