# เปรียบเทียบระบบ "วัตถุดิบ" (Raw Materials): Laravel เดิม vs Next.js ใหม่

> เอกสารนี้สร้างจากการอ่านโค้ดจริง (read-only) ในทั้งสองโปรเจกต์ ณ วันที่ 2026-07-10
> - โปรเจกต์เดิม: `C:\Users\Friendly Dev\project\ast-laravel-clean` (Laravel + MySQL)
> - โปรเจกต์ใหม่: `C:\Users\Friendly Dev\project\ast-new` (Next.js + **PostgreSQL ผ่าน Prisma**)

## ⚠️ ข้อแก้ไขสมมติฐานสำคัญ

โจทย์ระบุว่าโปรเจกต์ใหม่เป็น "NoSQL" แต่จากการตรวจสอบ `prisma/schema.prisma`, `prisma.config.ts`, และ `src/lib/prisma.ts` พบว่าโปรเจกต์ใหม่ใช้ **Prisma ORM 7 กับ PostgreSQL** (ผ่าน `@prisma/adapter-pg`) ไม่ใช่ฐานข้อมูล NoSQL แบบ document store (ไม่มี Mongoose/Firestore/MongoDB ใดๆ ในโค้ด) ดังนั้นเป็นการย้ายจาก **MySQL (Laravel/Eloquent) ไป PostgreSQL (Prisma)** ซึ่งทั้งคู่เป็นระบบ relational — ไม่ใช่ relational→document อย่างที่โจทย์สันนิษฐาน ส่วน "ข้อควรระวังการ migrate ไป NoSQL" ด้านล่างจึงปรับเป็นข้อควรระวังทั่วไปสำหรับการย้าย schema ระหว่างสอง RDBMS ที่ต่างกันมาก (schema แบบ ad-hoc ไม่มี FK → schema แบบมี FK/soft-delete/type ที่เข้มงวดขึ้น) แทน

หมายเหตุ: `package.json` ของโปรเจกต์ใหม่มี `mysql2` เป็น dependency แต่ใช้เฉพาะใน `scripts/migrate-from-mysql.ts` ซึ่งเป็นสคริปต์ one-time migration จาก MySQL เดิม ไม่ได้ใช้ runtime

---

## 1. ภาพรวมโครงสร้างตาราง/โมเดล

| โดเมน | Laravel (MySQL) | Next.js (Prisma/Postgres) | หมายเหตุ |
|---|---|---|---|
| รับวัตถุดิบเข้า (import) | `materials` | `Material` (`materials`) | คงชื่อ/concept เดิม |
| สต็อกคงเหลือ | `materialstocks` (แทบว่างเปล่า, ใช้เป็น in-memory DTO เท่านั้น ไม่เคย persist) | `MaterialStock` (stub ว่างเปล่า, ไม่ถูกใช้จริง) + คำนวณสดผ่าน raw SQL ที่ `/api/warehouse/material/stock` | ทั้งสองระบบ "ไม่เก็บ stock เป็นตาราง" จริง — คำนวณสดทุกครั้ง แต่สูตรคำนวณต่างกัน (ดูหัวข้อ 3) |
| เบิกใช้ภายใน (production) | `materialstores` | `MaterialRequisition` (`materialrequisitions`) | เปลี่ยนชื่อ table/model |
| ส่งออกภายนอก (subcontract) | `material_outsides` | `MaterialOutside` (`material_outsides`) | คงชื่อ table เดิม |
| คืนวัตถุดิบเข้าสต็อก | ❌ ไม่มีตารางแยก (ไม่มี concept "คืน" อย่างเป็นทางการ) | `MaterialReturn` (`material_returns`) | **ฟีเจอร์ใหม่ทั้งหมด** ไม่มีในระบบเดิม |
| พนักงาน/ผู้ดูแลวัตถุดิบ | `empmaterials` | `MaterialCoordinator` (`materialcoordinators`) | เปลี่ยนชื่อ, ระบบใหม่ยังไม่มี route ใช้งานจริง |
| บรรจุภัณฑ์ (spool/sack/box/pallet คืนซัพพลายเออร์) | `packages`, `packageasts`, `packageoutsides`, `astpackageoutsides` (4 ตาราง ผูกกันหลวมๆ ด้วย string `ref_id`) | ❌ ไม่พบในรายงาน (มี field ประเภทบรรจุภัณฑ์ใน UI form แต่ **ไม่ถูกส่งไปยัง API/DB**) | Gap สำคัญ — ดูหัวข้อ 4 |

---

## 2. เปรียบเทียบโครงสร้างฟิลด์ (field-by-field)

### 2.1 ตารางหลัก: `materials` (Laravel) vs `Material` (Next.js)

| ฟิลด์ | Laravel `materials` | Next.js `Material` | ต่างกันอย่างไร |
|---|---|---|---|
| id | bigint PK | Int PK autoincrement | เหมือนกันในเชิง concept |
| lot | `string(100)` not null | `String` not null | เหมือนกัน |
| yarnType | `longText` not null | `String` not null | เหมือนกัน (แต่ Laravel ใช้ longText ซึ่งเกินความจำเป็นสำหรับข้อความสั้นๆ) |
| supplierName | `string(100)` not null | `String` not null | **ยังคงเป็น plain string ทั้งคู่** ไม่ใช่ FK ไปยังตาราง supplier ในทั้งสองระบบ (ดูหัวข้อ 5) |
| supplierId | `string(100)` not null | ❌ ไม่มี field นี้ | Next.js ตัด field นี้ทิ้ง — เหลือแค่ supplierName |
| emp | `string(100)` not null | `String?` optional | เปลี่ยนจาก required → optional |
| createDate | `string(255)` free-text (**ไม่ใช่ date type จริง**) | ❌ ไม่มี field นี้แยก — ใช้ `createdAt DateTime` (auto) แทน | **ปรับปรุงสำคัญ**: Laravel เก็บวันที่เป็น string เปล่าๆ (ไม่มี validation ว่าเป็นวันที่จริง), Next.js ใช้ DateTime จริง |
| spool / pallet / box / sack | `string(100)` ทุกตัว (เก็บตัวเลขเป็น string!) | `spool: Int` (required), `pallet/box/sack: Int?` (optional) | **แก้ type bug สำคัญ** — เดิมเก็บตัวเลขเป็น string ต้อง `preg_replace` ล้างขยะก่อนคำนวณทุกครั้ง (ยืนยันในโค้ด `materialstockController::getStockList1()`) ใหม่เป็น Int จริง |
| weight_p_sum / weight_kg_sum | `string(100)` | `weightPSum: Float?` / `weightKgSum: Float` (required) | แก้ type เป็น Float, kg เปลี่ยนเป็น required (สำคัญกว่า p/lbs) |
| weight_p_package / weight_kg_package | `string(100)` | `weightPPackage: Float?` / `weightKgPackage: Float` (required) | เหมือนด้านบน |
| weight_p_net / weight_kg_net | `string(100)` | `weightPNet: Float?` / `weightKgNet: Float` (required) | เหมือนด้านบน |
| average_p / average_kg | `string(100)` | `averageP: Float?` / `averageKg: Float?` | แก้ type เป็น Float, ทั้งคู่ optional |
| importStatus | `string(100)` not null (ไม่มี default) | `String` not null, **default `"pending"`** | ⚠️ **กับดักความหมาย**: field นี้ชื่อดูเหมือน status แต่จริงๆ เก็บเลขที่ใบส่งสินค้า/invoice (เช่น "85046032") สืบทอดมาจาก Laravel ตรงๆ — Next.js ใส่ default `"pending"` เข้าไปซึ่ง**อาจทำให้เข้าใจผิดว่าเป็น workflow status จริง** ทั้งที่ยังเก็บความหมายเดิม ต้องระวังมาก (ดูบันทึกความจำโปรเจกต์เดิมเรื่องนี้ด้วย) |
| note | ❌ ไม่มี | `String?` | field ใหม่ |
| soft delete | ❌ ไม่มีเลยทั้งระบบ (hard delete เท่านั้น) | ✅ `deletedAt DateTime?` ทุกตาราง | **ปรับปรุงสำคัญ** |
| timestamps | `created_at`/`updated_at` | `createdAt`/`updatedAt` | เหมือนกัน |

### 2.2 ความสัมพันธ์ (Relationships)

| ด้าน | Laravel | Next.js |
|---|---|---|
| Model-level relations | **ไม่มีเลย** — ทุก Eloquent model เป็นแค่ `$fillable` array ไม่มี `belongsTo`/`hasMany` ใดๆ (ยืนยันด้วย grep ทั้ง `app/Models/`) | มี relation จริงใน Prisma schema: `Material.requisitions/outsides/returns` (one-to-many) และ `MaterialOutside/MaterialReturn/MaterialRequisition.materialId → Material.id` (FK ชัดเจน, nullable) |
| Foreign key ระดับ DB | **ไม่มี FK constraint จริงเลย** ในทุกตาราง material — `ref_id`, `package_status` เป็นแค่ string/id เปล่าๆ ที่ผูกกันด้วย convention เท่านั้น | มี FK จริง (`materialId Int?`) แต่**เป็น nullable และ resolve แบบ "เดา" ฝั่ง server** (ดูหัวข้อ 3) ไม่ใช่ FK ที่บังคับจาก client |
| Supplier link | `supplierName`/`supplierId` เป็น string ล้วน ไม่ผูกกับตาราง `suppliers` | `supplierName` ยังเป็น string ล้วนเหมือนเดิม — **ไม่ได้แก้ gap นี้** แม้ Prisma schema มี `Supplier` model และแม้แต่ `Package.supplierId → Supplier` เป็น relation จริงในที่อื่นของ schema เดียวกัน (แสดงว่าทีมรู้วิธีทำ FK ให้ supplier แต่ไม่ได้ทำกับ Material) |

---

## 3. Business logic: มีในระบบเดิมแต่ยังไม่มี/ต่างในระบบใหม่ (Gap)

| # | Business logic เดิม (Laravel) | สถานะในระบบใหม่ | ระดับความเสี่ยง |
|---|---|---|---|
| 1 | **การคำนวณสต็อกคงเหลือหักลบ 3 ทาง**: `materials` (รับเข้า) − `materialstores` (เบิกใช้ภายใน) − `material_outsides` (ส่งออกภายนอก) ในฟังก์ชัน `getStockList1()` | API `/api/warehouse/material/stock` **หักลบเฉพาะ `materialrequisitions` (เบิกใช้ภายใน) เท่านั้น — ไม่ได้หักลบ `material_outsides` หรือบวกคืน `material_returns`** | 🔴 **สูง** — ตัวเลขสต็อกคงเหลือในระบบใหม่จะสูงเกินจริง เพราะไม่นับของที่ส่งออกไปนอกแล้ว และไม่นับของที่คืนกลับมา ควรแก้สูตรให้ครบ 4 ทาง (รับเข้า − เบิกใช้ − ส่งออก + คืน) |
| 2 | **บรรจุภัณฑ์ (packaging) แบบ track คืนซัพพลายเออร์**: ทุกครั้งที่รับ/ส่งวัตถุดิบ จะสร้างระเบียน `packages`/`packageasts`/`packageoutsides`/`astpackageoutsides` คู่กันเพื่อติดตามว่าต้องคืน spool/sack/box/pallet กี่ชิ้นให้ซัพพลายเออร์ | ❌ **ไม่มี logic นี้เลย** ในระบบใหม่ — มี field ประเภทบรรจุภัณฑ์ (`palletType`, `sackType`, `spoolType`, `paperBar`) ใน UI form (`MaterialCreateForm.tsx`) แต่**ไม่ถูกส่งไป API/DB** (มี checkbox `returnPallet/Box/Sack/Spool/PaperBar` ใน `MaterialOutside` แต่เป็นแค่ boolean flag ไม่มีตาราง track จำนวนคงค้าง) | 🔴 **สูง** — เป็น business process จริงของโรงงาน (ยืมบรรจุภัณฑ์จากซัพพลายเออร์แล้วต้องคืน) ถ้าไม่ track จะสูญเสียข้อมูลนี้ไปทั้งหมด |
| 3 | **Lot-level allocation logic** (`materialstoreController::lotData()`) — ตอนเบิกวัตถุดิบ ระบบจะกระจายจำนวนที่เบิกไปตาม lot ต่างๆ ตามสัดส่วน average price/weight ของแต่ละ lot | ไม่พบ logic การกระจาย lot อัตโนมัติ — client ต้องระบุ `lot` เองตรงๆ ใน request (มี autocomplete `/api/warehouse/material/lots` ช่วยแต่ไม่ใช่ auto-allocation) | 🟡 กลาง — ถ้าธุรกิจยังต้องการ auto-split ตาม lot ควรเพิ่ม logic นี้กลับมา |
| 4 | **Multi-row form submission** (`materialstoreController@store`, branch `save`) — เบิกวัตถุดิบหลาย yarnType/lot ในฟอร์มเดียวแล้วบันทึกพร้อมกัน | Next.js มี `createManyAndReturn` สำหรับ **entry** (รับเข้า) แต่ไม่ชัดเจนจากรายงานว่า requisition/outside/return route รองรับ bulk multi-row หรือไม่ (schema ที่อ่านมาเป็นแบบ single-object ต่อ request) | 🟡 กลาง — ควรตรวจสอบ UI ของหน้าที่เกี่ยวข้อง (git log บอกว่ามีหน้า "เพิ่มรายการก่อนแล้วบันทึกทีเดียว" สำหรับ requisition ซึ่งอาจ handle ฝั่ง client แล้ววน POST ทีละรายการ) |
| 5 | **การค้นหาข้าม field แบบ combo** — แม้ Laravel เขียนไว้เป็น comment ว่าตั้งใจให้ค้นหาได้หลาย field พร้อมกัน แต่โค้ดจริงเป็น if/elseif (bug, ใช้ได้ทีละ field) | Next.js's `q` param ใช้ single free-text ค้นหาข้าม field (`lot`/`yarnType`/`supplierName`/`emp`) ด้วย `contains` — **ครอบคลุมกว่าของเดิมจริง** (ของเดิมมี bug อยู่แล้ว) | ✅ ระบบใหม่ดีกว่า ไม่ใช่ gap |
| 6 | Employee/coordinator picker (`empData()`, ตาราง `empmaterials`) ใช้เลือกพนักงานตอนเบิกวัตถุดิบ | มี `MaterialCoordinator` model ใน schema แต่**ไม่มี API route ใช้งานจริง** ตามรายงาน | 🟡 กลาง — model มีแล้วแต่ยังไม่ wire ต่อ |

---

## 4. Business logic: มีในระบบใหม่แต่ไม่มีในระบบเดิม (สิ่งที่ดีขึ้น)

| # | ฟีเจอร์ใหม่ | รายละเอียด |
|---|---|---|
| 1 | **Soft delete ทุกตาราง** | `deletedAt` field + ทุก query กรอง `deletedAt: null` — ของเดิม hard delete ล้วนๆ เสี่ยงข้อมูลหายถาวร |
| 2 | **การคืนวัตถุดิบเข้าสต็อก (`MaterialReturn`)** | Concept ใหม่ทั้งหมด ของเดิมไม่มีทางบันทึก "คืนของ" อย่างเป็นทางการเลย |
| 3 | **Type ที่ถูกต้อง** | ตัวเลข/น้ำหนักเป็น `Int`/`Float` จริง แทน `string` ทั้งหมดในเดิม — ลด bug จากการต้อง `preg_replace` ล้างข้อมูลก่อนคำนวณ |
| 4 | **Autocomplete endpoints แยกเฉพาะ** (`/lots`, `/suppliers`, `/yarn-types`) | ของเดิมใช้ groupBy ในหน้า create/edit เท่านั้น ไม่มี API endpoint แยกสำหรับ autocomplete |
| 5 | **Zod validation ฝั่ง server ครบทุก endpoint** | ของเดิมใช้ `$request->validate()` inline, บาง endpoint (เช่น `materialstoreController@store` branch `save`, `MaterialOutsideController@update`) **ไม่มี validation เลย** เป็น dead/commented code |
| 6 | **Pagination มาตรฐาน** (`page`, `limit` max 100) ทุก list endpoint | ของเดิมใช้ `take(10)` แบบ hardcode ไม่มี pagination จริง |
| 7 | **materialId auto-resolution แบบมี FK จริง** | แม้จะยัง "เดา" อยู่ (ดู gap) แต่อย่างน้อยมี foreign key column จริงที่ query join ได้ ต่างจากเดิมที่ผูกกันด้วย string ref_id เปล่าๆ ไม่มี constraint |
| 8 | **หน้า UI สำหรับ traceability เพิ่มเติม**: field `emp`, `pallet`, `box`, `sack`, `weight_p`, `average` ถูกเพิ่มกลับเข้ามาอย่างมีโครงสร้างชัดเจนกว่า (ตาม git log `c7363be`) |

---

## 5. ข้อควรระวังในการ Migrate ข้อมูล (MySQL → PostgreSQL/Prisma)

เนื่องจากระบบใหม่เป็น **Postgres relational** ไม่ใช่ NoSQL อย่างที่โจทย์ตั้งสมมติฐานไว้ ข้อควรระวังจึงเป็นเรื่อง **schema migration ระหว่าง RDBMS ที่มี data quality ต่างกันมาก** มากกว่าเรื่อง relational→document:

1. **Type casting จาก string → Int/Float จะพังถ้าข้อมูลเดิมสกปรก**
   ทุกฟิลด์ตัวเลข (`spool`, `weight_*`, `average_*`) ในตาราง `materials`, `materialstores`, `material_outsides` เดิมเป็น `string(100)` และโค้ดเดิมเองต้อง `preg_replace('/[^0-9.]/','', ...)` ก่อนใช้งาน — แปลว่า**มีข้อมูลขยะปนอยู่จริงในฐานข้อมูลเดิม** (เว้นวรรค, ตัวอักษร, comma คั่นหลักพัน ฯลฯ) ต้อง sanitize/validate ทุกแถวก่อน insert เข้า Postgres มิฉะนั้น migration script จะ throw หรือ insert ค่าผิด

2. **`importStatus` ต้องไม่ตีความเป็น workflow status**
   ทั้งสองระบบเก็บ field นี้เป็น invoice/lot reference (string) ไม่ใช่ enum status — แต่ Next.js schema ใส่ `default "pending"` ซึ่งเป็นชื่อ status ทั่วไป เสี่ยงให้ dev ในอนาคตเข้าใจผิดและ filter ด้วยค่าเช่น `'completed'`/`'approved'` (ดูบันทึกความจำ `project_material_importstatus.md`) — ควร**เขียน comment ชัดเจนใน schema** หรือพิจารณาเปลี่ยนชื่อ field ให้สื่อความหมายจริง (เช่น `invoiceRef`) ก่อนที่ field จะถูกใช้ผิดทางมากขึ้น

3. **createDate (string) → createdAt (DateTime): รูปแบบวันที่ไม่แน่นอน**
   `materials.createDate` เดิมเป็น free-text string ไม่มีการบังคับ format วันที่ ต้องตรวจสอบ/แปลงทุกค่าก่อน parse เป็น `DateTime` (เช่น รูปแบบไทย พ.ศ. vs ค.ศ., dd/mm/yyyy vs mm/dd/yyyy, ค่าว่าง/null) มิฉะนั้นข้อมูลวันที่นำเข้าจะผิดเพี้ยนทั้งหมด

4. **ไม่มี FK จริงในข้อมูลเดิม → เสี่ยง orphan record ตอนสร้าง FK ใหม่**
   ระบบเดิมผูกความสัมพันธ์ (`ref_id`, `package_status`) ด้วย string/id ที่ไม่มี constraint บังคับ ระหว่าง migrate ไปสู่ schema ใหม่ที่มี `materialId Int?` (FK จริง) ต้อง**ตรวจสอบว่าทุก child record ยังหา parent เจอ** (join ด้วย yarnType/supplierName/lot ตาม pattern ที่ระบบใหม่ใช้อยู่) มิฉะนั้นจะเหลือ orphaned `MaterialOutside`/`MaterialRequisition`/`MaterialReturn` ที่ `materialId` เป็น null ซึ่งกระทบสูตรคำนวณสต็อกที่ join ผ่าน FK นี้

5. **บรรจุภัณฑ์ (packages/packageasts/packageoutsides/astpackageoutsides) ยังไม่มีปลายทางในระบบใหม่**
   ถ้าข้อมูล 4 ตารางนี้มีมูลค่าทางธุรกิจ (ยอดค้างคืนบรรจุภัณฑ์ให้ซัพพลายเออร์) ต้อง**ตัดสินใจก่อน migrate** ว่าจะ (ก) สร้าง schema ใหม่รองรับ หรือ (ข) เก็บเป็น historical archive เฉยๆ ไม่ให้หายไปเงียบๆ

6. **สูตรคำนวณสต็อกต่างกัน (ดูหัวข้อ 3 ข้อ 1) — ห้าม migrate ตัวเลข "สต็อกคงเหลือ" ตรงๆ**
   เพราะทั้งสองระบบไม่เก็บ stock เป็นตัวเลขจริง (คำนวณสดทั้งคู่) จึงไม่มี "แถวสต็อก" ให้ migrate โดยตรง — แต่ต้องมั่นใจว่า**ข้อมูลดิบ (materials/materialstores/material_outsides ทั้งหมด) ถูก migrate ครบ 100%** ก่อน เพราะสต็อกฝั่งใหม่จะคำนวณจากข้อมูลดิบเหล่านี้ทันที และต้อง**แก้สูตร stock API ให้หัก material_outsides และบวก material_returns ด้วย** (gap ข้อ 1) ก่อนเปิดใช้งานจริง มิฉะนั้นตัวเลขสต็อกจะผิดตั้งแต่วันแรก

7. **`Materialoutside` class-name typo bug ในระบบเดิม**
   โค้ด `MaterialOutsideController@store` (branch `searchwithdraw`) อ้างอิง class `Materialoutside` (ตัว o เล็ก) ที่ไม่มีอยู่จริง — เป็น dead/broken code path ที่ไม่เคยถูกเรียกใช้งานจริงในโปรดักชัน (มิฉะนั้นจะ fatal error) จึงไม่ต้อง treat เป็น business logic ที่ต้องย้าย แต่ควรระวังอย่าเข้าใจผิดว่าเป็น feature จริงที่ขาดหายไป

8. **Supplier ยังเป็น denormalized string ทั้งสองระบบ**
   นี่ไม่ใช่ gap ที่เกิดจาก migration แต่เป็น debt ที่สืบทอดมา — หากต้องการ data quality ที่ดีขึ้นจริง ควรพิจารณาแปลง `supplierName` เป็น FK ไปยัง `Supplier.id` ตอน migrate (คล้ายที่ `Package.supplierId` ทำอยู่แล้วในระบบใหม่) แทนที่จะ copy string ตรงๆ ต่อไป

---

## 6. สรุปสั้น

- โครงสร้างข้อมูลฝั่งใหม่ปรับปรุงเรื่อง **type safety** (string→Int/Float), **soft delete**, และเพิ่ม **MaterialReturn** ที่ไม่มีมาก่อน — เป็นก้าวที่ดีขึ้นชัดเจน
- **Gap ที่ต้องแก้ก่อน production**: (1) สูตรคำนวณสต็อกยังไม่หัก `material_outsides`/`material_returns`, (2) ไม่มี logic ติดตามบรรจุภัณฑ์คืนซัพพลายเออร์เลย, (3) `importStatus` เสี่ยงถูกเข้าใจผิดเป็น workflow status
- โจทย์เข้าใจผิดว่าระบบใหม่เป็น NoSQL — จริงๆ เป็น Postgres/Prisma (relational) จึงไม่มีประเด็น relational→document ที่แท้จริง แต่ยังมีความเสี่ยงเรื่อง data quality ระหว่าง migrate ตามที่สรุปในหัวข้อ 5
