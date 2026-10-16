# Runbook: รวมชื่อลูกค้าที่ต่างกันแค่เว้นวรรค (prod)

ตัวอย่าง: `บริษัท เอ็มเคเคเท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)` (ชื่อเก่าในข้อมูลยุคระบบเดิม) → `บริษัท เอ็ม เค เค เท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)` (ชื่อในทะเบียนลูกค้า)

**ไม่มี migration และไม่ต้อง build app ใหม่** เป็นการแก้ข้อมูลด้วย SQL อย่างเดียว: `scripts/customer-name-unify/unify.sql` และ `rollback.sql`

**สิ่งที่เปลี่ยน**
- ชื่อลูกค้าใน 6 คอลัมน์: `stockfabrics.customer`, `fabricouts.customerName`, `fabricouts.stockCustomer`, `fabricoutdeposits.customerName`, `ast_purchaseorders.customerName`, `ast_bill_of_structures.customerName`
- ตัดสินชื่อที่ถูกต้องของแต่ละกลุ่มดังนี้:
  - มีชื่อนี้ในทะเบียนลูกค้า (`customers`) 1 รายการ → ใช้ชื่อในทะเบียน
  - ไม่มีในทะเบียน → ใช้ตัวสะกดที่ใช้บ่อยที่สุด
  - มีในทะเบียนตั้งแต่ 2 รายการ → **ข้าม** ไม่แก้กลุ่มนั้น เพราะต้องให้คนตัดสินว่าลูกค้าซ้ำหรือไม่
- ไม่แก้ทะเบียนลูกค้า `customers` และไม่แตะ `receiveName` (ชื่อผู้รับ)
- ค่าเดิมทุกแถวถูกเก็บในตาราง `customer_name_unify_bak_20261016` ใช้สำหรับ rollback
- **ผลที่ผู้ใช้จะเห็น:** บิลเก่าที่สั่งพิมพ์ซ้ำจะขึ้นชื่อใหม่ หน้ารายงานและช่องค้นหาลูกค้าจะเห็นชื่อเดียว

วิธีอ่าน: ทุกกล่องคือคำสั่งเดียว ใต้กล่องมี **ต้องเห็น** ถ้าไม่ตรงให้หยุด รันบน server เป็น root จาก `/home/deploy/ast-new`

**ลำดับ:** ดึงโค้ด > backup > dry-run (ตรวจรายชื่อ) > apply > ตรวจหน้าจอ

## 1. ดึงโค้ด

```sh
git pull --ff-only origin main
```

```sh
ls scripts/customer-name-unify/
```

ต้องเห็น: `rollback.sql  unify.sql`

## 2. Backup

```sh
mkdir -p /root/custunify
```

```sh
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc ast_new > /root/custunify/ast_new_pre_custunify.dump
```

```sh
ls -lh /root/custunify/ast_new_pre_custunify.dump
```

ต้องเห็น: ขนาดไฟล์ใกล้เคียง backup รอบก่อน ไม่ใช่ 0

## 3. Dry-run (ไม่แก้อะไร)

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 < scripts/customer-name-unify/unify.sql
```

ต้องเห็น:
- ตาราง **1. Variant sets** ให้อ่านทีละบรรทัด คอลัมน์ `canonical` คือชื่อที่จะใช้ และ `spellings` คือตัวสะกดทั้งหมดที่เจอพร้อมจำนวนแถว ใน dev เจอ 3 ชุด:
  - `บริษัท เอ็ม เค เค เท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)` (customers) ← `บริษัท เอ็มเคเคเท็กซ์ไทล์ ...`
  - `A E C` (most used) ← `AEC`
  - `คุณศิพนันท์ (ทองไทย)` (customers) ← `คุณศิพนันท์(ทองไทย)`
- ถ้ามีบรรทัดที่ `canonical` ไม่ใช่ชื่อที่ต้องการ หรือ `source` ขึ้น `SKIP` **ให้หยุด** แล้วส่งผลให้ Claude ดูก่อน
- บรรทัดสุดท้ายต้องเห็น `DRY-RUN only — nothing changed`

## 4. Apply

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 -v apply=1 < scripts/customer-name-unify/unify.sql
```

ต้องเห็น:
- `total_rows_to_change` เท่ากับตอน dry-run
- ตาราง **3. After apply** ว่าง (ถ้ามีกลุ่ม SKIP กลุ่มนั้นจะขึ้นตรงนี้ ซึ่งเป็นเรื่องปกติ)
- `backup_rows` = `total_rows_to_change`
- บรรทัดสุดท้าย `APPLIED`

ถ้าเห็น `ERROR: relation "customer_name_unify_bak_20261016" already exists` แปลว่าเคย apply ไปแล้ว ไม่มีอะไรถูกแก้ซ้ำ

ตรวจซ้ำด้วย dry-run อีกครั้ง:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 < scripts/customer-name-unify/unify.sql | grep -A2 total_rows
```

ต้องเห็น: `0`

## 5. ตรวจหน้าจอ

- สต็อกผ้า ค้นหา `#7255` → 1 แถว ชื่อ `บริษัท เอ็ม เค เค เท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)` ผลิต 60 / 6,424, ใช้ไป 56 / 6,026, คงเหลือ 4 / 398 (ตัวเลขต้องเท่าเดิม)
- เปิดบิลผ้า ค้นหาลูกค้า `AEC` / `A E C` → เจอบิลเก่าภายใต้ชื่อเดียว

## ถอยกลับ

แบบนี้คืนเฉพาะชื่อที่ถูกแก้ ข้อมูลอื่นที่บันทึกหลัง apply ไม่หาย:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -v ON_ERROR_STOP=1 < scripts/customer-name-unify/rollback.sql
```

ต้องเห็น: `not_restored` = `0` และ `ROLLED BACK`

ถ้า rollback.sql ใช้ไม่ได้ ให้ restore `/root/custunify/ast_new_pre_custunify.dump` แต่ข้อมูลที่บันทึกหลัง backup จะหาย

## หลังจากนี้

เก็บ dump และตาราง `customer_name_unify_bak_20261016` ไว้จนลูกค้ายืนยันว่าชื่อถูกต้อง แล้วค่อยลบ:

```sh
docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres -d ast_new -c 'DROP TABLE customer_name_unify_bak_20261016;'
```
