# สืบสวน: บิลส่งผ้า (fabricouts) หายจากการ migrate MySQL → PostgreSQL หรือไม่

_สืบสวนเท่านั้น 2026-08-20 — อ่านข้อมูลอย่างเดียว 100% ไม่มีการ UPDATE/DELETE/INSERT/migrate ใดๆ ทั้งฝั่ง MySQL (port 3307) และ PostgreSQL ระหว่างการสืบสวน_

**สถานะ: ตรวจสอบครบแล้ว — ไม่พบบิลที่หายไป**

---

## สรุปสั้น (TL;DR)

- เทียบ `fabricouts` (MySQL, 26,304 แถว) กับ `FabricOut` (PostgreSQL, 26,317 แถว) แบบ 1:1 ด้วยคีย์ `id` (คีย์นี้เป็น PK เดียวกันตั้งแต่ migrate ครั้งแรก ยืนยันจาก `scripts/migrate-from-mysql.ts` และ `scripts/sync-from-mysql-upsert.ts` ที่ upsert ด้วย `where: { id: f.id }` เสมอ)
- **ไม่มีแถวไหนใน MySQL ที่หายไปจาก PostgreSQL เลย (missing = 0)**
- **ไม่มีแถวไหนถูก soft-delete ใน PostgreSQL (deletedAt ตั้งไว้) ทั้งที่ยังอยู่ใน MySQL (soft-deleted = 0)**
- **ไม่มีแถวไหนที่ค่า sumYard / fold / vatNo / customerName / fabricStruct ไม่ตรงกันระหว่าง 2 ระบบ (mismatched = 0)**
- ผลรวม `sumYard` ของแถวที่จับคู่ได้ตรงกันเป๊ะ: MySQL = 3,703,770 = PostgreSQL (เฉพาะ id ที่มีทั้ง 2 ฝั่ง)
- PostgreSQL มี 13 แถวที่ไม่มีใน MySQL (id 59586–59598) — **ไม่ใช่ความผิดปกติ**: เป็นบิลของ "บริษัท สมอทองการ์เมนท์ จำกัด" (vatNo A6682) ที่สร้างขึ้นตรงในระบบใหม่เมื่อ 2026-08-17 หลัง sync ครั้งล่าสุด (id ต่อเนื่องจาก id สูงสุดใน MySQL ที่ 59,585 พอดี)

**สรุป: กระบวนการ migrate/sync บิลส่งผ้าทำงานถูกต้องสมบูรณ์ ณ วันที่ตรวจสอบ ไม่พบข้อมูลสูญหาย**

---

## 1. วิธีตรวจสอบ

Script: `scripts/scan-missing-fabricouts.ts` (read-only)

1. เชื่อม MySQL เก่า (`MYSQL_SOURCE_URL` จาก `.env`, port 3307) → `SELECT * FROM fabricouts ORDER BY id ASC`
2. เชื่อม PostgreSQL ใหม่ผ่าน Prisma → `prisma.fabricOut.findMany()`
3. เทียบทีละแถวด้วย `id` (ไม่ใช่ refId/vatNo เพราะ id คือ PK ที่ carry-over 1:1 ตั้งแต่ migrate ครั้งแรก ยืนยันจากโค้ด migrate/sync ทั้งสองสคริปต์)
4. หาแถวที่มีใน MySQL แต่ไม่มีใน PostgreSQL (missing), แถวที่มีแต่ `deletedAt` ถูกตั้ง (soft-deleted), แถวที่มีทั้งคู่แต่ค่าฟิลด์หลักไม่ตรง (mismatched)
5. Group แถว missing ตาม `refId` (1 refId = 1 "บิล"/1 การส่งของ ตาม comment ใน `prisma/schema.prisma` — refId คือ session token ที่รวมทุกม้วนผ้าในบิลเดียวกัน)

รันด้วย: `npx tsx scripts/scan-missing-fabricouts.ts`
ผลลัพธ์เต็มถูกเขียนไปที่ `scripts/exports/missing-fabricouts-report.json`

## 2. ผลลัพธ์

| รายการ | จำนวน |
|---|---|
| แถวใน MySQL fabricouts | 26,304 |
| แถวใน PostgreSQL FabricOut | 26,317 |
| หายไปจาก PostgreSQL ทั้งหมด | **0** |
| มีอยู่แต่ soft-deleted ใน PostgreSQL | **0** |
| มีอยู่ทั้งคู่แต่ค่าไม่ตรงกัน | **0** |
| มีใน PostgreSQL แต่ไม่มีใน MySQL (สร้างใหม่หลัง migrate) | 13 |

Id range: MySQL `7,161–59,585` / PostgreSQL `7,161–59,598` (ต่อเนื่องกันพอดี ไม่มีช่องว่างผิดปกติ)

### 13 แถว "extra" ใน PostgreSQL (ไม่ใช่บิลหาย — เป็นบิลใหม่ที่เข้าตรงระบบใหม่)

ทั้งหมดเป็นม้วนผ้าของบิลเดียว: `refId=33a24bcf-8955-49bb-81e0-f45d110171d3`, vatNo `A6682`, ลูกค้า **บริษัท สมอทองการ์เมนท์ จำกัด (สำนักงานใหญ่)**, ผ้า `TC45 * TC45 / 136 * 80`, วันที่ 2026-08-17, รวม 13 ม้วน — สอดคล้องกับ id ที่ต่อจาก MySQL id สูงสุดพอดี (59,585 → 59,586...) แสดงว่าเป็นบิลที่กรอกในระบบใหม่โดยตรง ไม่เกี่ยวกับการ migrate

## 3. ตรวจสอบเพิ่ม: กรณีอื่นที่ยอดไม่ตรง

ตรวจสอบผลรวม `sumYard` ทั้งระบบ (ไม่ใช่แค่ราย id):

- MySQL: `SUM(sumYard) = 3,703,770` (26,304 แถว)
- PostgreSQL เฉพาะ id ที่มีคู่กับ MySQL: `3,703,770` — **ตรงกันเป๊ะ**
- PostgreSQL ทั้งหมดรวม 13 แถวใหม่: `3,705,228` (ส่วนต่าง 1,458 yard = ผลรวมของ 13 แถวใหม่ ไม่ใช่ความคลาดเคลื่อน)

ไม่พบ mismatch ในฟิลด์ `fold`, `vatNo`, `customerName`, `fabricStruct` เมื่อเทียบทีละแถวเช่นกัน

## 4. ข้อจำกัดของการตรวจสอบนี้

- ตรวจสอบเฉพาะตาราง `fabricouts` (บิลส่งผ้า/delivery invoice) ตามที่ระบุ — ไม่ได้ตรวจ `ast_purchaseorders` (ใบสั่งขาย), `fabricoutdeposits` (มัดจำ), หรือตารางอื่น
- เทียบด้วยคีย์ `id` เท่านั้น — หากมีบิลที่ถูกลบออกจาก MySQL เองไปแล้วก่อนหน้านี้ (ไม่ได้ migrate ตั้งแต่ต้น) จะตรวจไม่พบด้วยวิธีนี้ (แต่ก็ไม่ถือว่า "หายจากการ migrate" เพราะไม่เคยมีใน source ตอน migrate)
- ข้อมูล ณ เวลาที่รัน (2026-08-20) — หากมีการ sync/entry เพิ่มเติมหลังจากนี้ ตัวเลขจะเปลี่ยน

## 5. Script ที่ใช้ (เก็บไว้ใน repo)

`scripts/scan-missing-fabricouts.ts` — read-only, รันซ้ำได้ทุกเมื่อเพื่อตรวจสอบซ้ำ
