# Runbook: ขึ้น prod — แก้/ลบใบรับเข้าแล้วยอดต้องส่งคืนตาม + เปลี่ยนชื่อซัพพลายเออร์

Branch: `feature/material-patch-sync-obligations` (แตกจาก main `44029b7` ซึ่งเป็นรุ่นที่ prod รันอยู่ ตรวจแล้ว 2026-10-09)
**ไม่มี migration** ไม่แก้ข้อมูลเก่า ใช้ตาราง `audit_logs` ที่มีอยู่แล้วเก็บชื่อเดิมของซัพพลายเออร์เมื่อเปลี่ยนชื่อ

**สิ่งที่เปลี่ยน**
- แก้จำนวนพาเลท/กล่อง/กระสอบ/หลอด หรือชื่อบริษัทในใบรับเข้า → ยอดต้องส่งคืนของใบนั้นเปลี่ยนตาม; ถ้าจะต่ำกว่าที่คืนไปแล้ว หรือย้ายบริษัททั้งที่คืนไปแล้ว ระบบไม่ยอมและไม่บันทึกอะไร
- ลบใบรับเข้า → ยอดต้องส่งคืนของใบถูกลบไปด้วย; ถ้ามีการคืนแล้ว ลบไม่ได้
- ฟอร์มแก้ใบรับเข้ากรอก 0 ได้
- เปลี่ยนชื่อซัพพลายเออร์ → ใบรับเข้าเก่ายังนับเป็นของบริษัทนั้น; ไม่ยอมเปลี่ยนชื่อถ้าชื่อเดิมซ้ำกับซัพพลายเออร์อื่น หรือชื่อใหม่เป็นของรายอื่นอยู่แล้ว

วิธีอ่านเหมือน runbook รอบก่อน: ทุกกล่องคือคำสั่งเดียว, ใต้กล่องมี **ต้องเห็น** ถ้าไม่ตรงให้หยุด, รันบน server เป็น root จาก `/home/deploy/ast-new` ยกเว้นขั้น "เครื่องคุณ"

## 0. Merge และ push (เครื่องคุณ)

```sh
git fetch origin
```

```sh
git rev-parse --short origin/main
```

ต้องเห็น: `44029b7` ถ้าไม่ใช่ให้หยุด

```sh
git switch main
```

```sh
git merge --ff-only feature/material-patch-sync-obligations
```

ต้องเห็น: `Fast-forward`

```sh
git log --oneline 44029b7..HEAD
```

ต้องเห็น: เฉพาะ commit ของ branch นี้ (ยอดต้องส่งคืนตามใบรับเข้า, ชื่อซัพพลายเออร์, ฟอร์มกรอก 0, runbook นี้)

```sh
git diff --name-only 44029b7 HEAD -- prisma/migrations
```

ต้องเห็น: ว่าง

```sh
npx vitest run
```

ต้องเห็น: `Tests  44 passed (44)`

```sh
git push origin main
```

## 1. Backup (server)

```sh
cd /home/deploy/ast-new
```

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc ast_new > /root/pkgmig/backup/ast_new_pre_matsync.dump
```

```sh
ls -lh /root/pkgmig/backup/ast_new_pre_matsync.dump
```

ต้องเห็น: ขนาดหลาย MB ไม่ใช่ 0

```sh
docker inspect --format '{{.Config.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)" > /root/pkgmig/app-image.txt
```

```sh
docker tag "$(docker inspect --format '{{.Image}}' "$(docker compose -f docker-compose.prod.yml ps -q app)")" ast-new-app:pre-matsync
```

```sh
docker image ls ast-new-app:pre-matsync
```

ต้องเห็น: 1 แถว

## 2. Pull และ build

```sh
git pull --ff-only origin main
```

(ถ้าเจ้าของ repo เป็น `deploy` ใช้ `sudo -u deploy git pull --ff-only origin main`) ต้องเห็น: `Updating 44029b7..<hash>` และ `Fast-forward`

```sh
test -f src/lib/material-obligation-sync.ts && test -f src/lib/supplier-names.ts && echo READY
```

ต้องเห็น: `READY`

```sh
docker compose -f docker-compose.prod.yml build app
```

ต้องเห็น: build จบโดยไม่มี error (app ตัวเดิมยังรันอยู่)

## 3. สลับ app

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

**ถอยกลับ** (ไม่มี migration ข้อมูลไม่ต้องย้อน):

```sh
docker tag ast-new-app:pre-matsync "$(cat /root/pkgmig/app-image.txt)"
```

```sh
docker compose -f docker-compose.prod.yml up -d --no-build app
```

## 4. ตรวจ (อ่านอย่างเดียว)

ชื่อบริษัทในใบรับเข้าที่ไม่ตรงกับรายชื่อซัพพลายเออร์ (ยอดนำเข้าของชื่อเหล่านี้ไม่ถูกนับในหน้าคืนบรรจุภัณฑ์):

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -c 'SELECT m."supplierName", count(*) AS slips, min(m."createdAt")::date AS first, max(m."createdAt")::date AS last FROM materials m WHERE m."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM suppliers s WHERE s.name = m."supplierName" AND s.deleted_at IS NULL) GROUP BY 1 ORDER BY 2 DESC;'
```

ต้องเห็น (สำเนา prod 2026-10-07): 1 แถว `บริษัท เอกรัตน์อุตสาหกรรมสิ่งทอ จำกัด | 1 | 2026-07-17 | 2026-07-17` ถ้ามีชื่ออื่นเพิ่ม ให้ส่งรายชื่อมาดู (ยังไม่ต้องแก้อะไร)

## 5. ตรวจหน้าจอ

| หน้า | ทำอะไร | ต้องเห็น |
|---|---|---|
| บันทึกคืนบรรจุภัณฑ์ → แพรกษาเท็กซ์ไทล์ | เปิดดูเฉย ๆ | ตัวเลขทุกแถวเท่ากับก่อนขึ้นระบบ (ไม่มีการเปลี่ยนข้อมูล) |
| ประวัติการนำเข้า | เปิดแก้ใบใดก็ได้ แล้ว**ปิดโดยไม่บันทึก** | ฟอร์มเปิดได้ปกติ ช่องพาเลท/กล่อง/กระสอบพิมพ์ 0 ได้ |
| ซัพพลายเออร์ | เปิดแก้รายการใดก็ได้ แล้ว**ปิดโดยไม่บันทึก** | ฟอร์มเปิดได้ปกติ |

ไม่ต้องทดลองแก้หรือลบใบจริงบน prod — ทดสอบครบแล้วบนสำเนา (`test-material-patch-obligations.ts` 31 ข้อ, `test-supplier-rename.ts` 14 ข้อ)

ผ่านแล้วแจ้งผู้ใช้ตามข้อความแจ้งผู้ใช้ และยกเลิกข้อห้ามแก้จำนวนบรรจุภัณฑ์ในใบรับเข้าเก่า

## หลังเสร็จ

เก็บ `/root/pkgmig/backup/ast_new_pre_matsync.dump` ไว้จนใช้งานจริงไปสักระยะ

---

## ข้อความแจ้งผู้ใช้

> **เรื่อง: การแก้ไขและลบใบรับเข้า กับยอดบรรจุภัณฑ์ที่ต้องส่งคืน**
>
> ตั้งแต่วันนี้ เมื่อแก้หรือลบใบรับเข้า ยอดบรรจุภัณฑ์ที่ต้องส่งคืนของใบนั้นจะเปลี่ยนตามให้ทันที ไม่ต้องแก้ซ้ำที่หน้าบันทึกคืนบรรจุภัณฑ์
>
> **แก้จำนวนพาเลท กล่อง กระสอบ หรือหลอด**
> - ยอดที่ต้องส่งคืนของใบนั้นจะเท่ากับจำนวนใหม่ในใบ
> - ถ้าบรรจุภัณฑ์ของใบนั้นคืนไปแล้วบางส่วน จะแก้ให้น้อยกว่าที่คืนไปแล้วไม่ได้ ระบบจะแจ้งว่าคืนไปแล้วเท่าไร ให้ยกเลิกใบคืนที่ผิดก่อน แล้วจึงแก้ใบรับเข้า
> - ใส่ 0 ได้ เมื่อใบนั้นไม่มีบรรจุภัณฑ์ชนิดนั้นจริง
> - ใบรับเข้าจากระบบเดิม ถ้าแก้จำนวนลด ยอดต้องส่งคืนจะลดตาม แต่ถ้าแก้เพิ่ม ยอดต้องส่งคืนจะไม่เพิ่มเกินยอดที่ระบบเดิมบันทึกไว้
>
> **แก้ชื่อบริษัทในใบรับเข้า**
> - ยอดที่ต้องส่งคืนจะย้ายไปอยู่กับบริษัทใหม่
> - ถ้าใบนั้นคืนบรรจุภัณฑ์ให้บริษัทเดิมไปแล้ว จะเปลี่ยนบริษัทไม่ได้ ให้ยกเลิกใบคืนก่อน
>
> **ลบใบรับเข้า**
> - ถ้ายังไม่เคยคืนบรรจุภัณฑ์ของใบนั้นเลย ลบได้ และยอดที่ต้องส่งคืนของใบนั้นจะหายไปด้วย
> - ถ้าคืนไปแล้ว ไม่ว่าคืนครบหรือคืนบางส่วน จะลบไม่ได้ ให้ยกเลิกใบคืนที่เกี่ยวข้องก่อน
>
> **เปลี่ยนชื่อซัพพลายเออร์**
> - ใบรับเข้าเก่าที่ใช้ชื่อเดิมยังนับเป็นของบริษัทนั้นเหมือนเดิม
> - เปลี่ยนชื่อไม่ได้ ถ้ามีซัพพลายเออร์อีกรายการใช้ชื่อเดียวกันอยู่ หรือชื่อใหม่ซ้ำกับซัพพลายเออร์รายอื่น
>
> ข้อห้ามแก้จำนวนบรรจุภัณฑ์ในใบรับเข้าเก่าที่แจ้งไปก่อนหน้า ยกเลิกแล้ว แก้ได้ตามปกติ
