# แผน Resync ข้อมูลระบบวัตถุดิบจาก Laravel (128.199.238.141)

_สำรวจเท่านั้น 2026-08-02 — ยังไม่ได้รันคำสั่งใดๆ ที่แตะ DB จริง (local หรือ MySQL ต้นทาง), ไม่ได้เปิด SSH tunnel_

---

## 1. ตารางที่เป็น "ระบบวัตถุดิบ" (จาก schema.prisma จริง)

ยืนยันจาก `prisma/schema.prisma` ทั้งไฟล์ (835 บรรทัด) — ตารางที่อยู่ใต้ section `// ─── MATERIALS ───` (บรรทัด 413-579) บวก `PACKAGE RETURNS` (บรรทัด 737-823) ซึ่งเป็นส่วนขยายของ material domain (ผูก FK ตรงกับ `materials`/`material_outsides`):

| Model | Table (Postgres) | MySQL ต้นทาง | สถานะการ sync ปัจจุบัน |
|---|---|---|---|
| `Material` | `materials` | `materials` (4,136 แถว ณ 2026-05-01) | ✅ sync อยู่แล้ว |
| `MaterialRequisition` | `materialrequisitions` | `materialstores` (30,819 แถว — ตารางใหญ่สุด) | ✅ sync อยู่แล้ว แต่มี field หาย (ดูข้อ 2) |
| `MaterialOutside` | `material_outsides` | `material_outsides` (152-164 แถว, คงชื่อ table เดิม) | ❌ **ไม่เคย sync เลย** |
| `MaterialCoordinator` | `materialcoordinators` | `empmaterials` (0 แถว ณ 2026-05-01) | ✅ sync อยู่แล้ว (แต่ MySQL มี 0 แถว ก็จะได้ 0 แถวเหมือนเดิม) |
| `MaterialReturn` | `material_returns` | ❌ **ไม่มีต้นทาง MySQL** — ฟีเจอร์ใหม่ทั้งหมด ไม่มี concept "คืนวัตถุดิบ" ในระบบเดิม | N/A — backfill ไม่ได้ |
| `PackageReturnObligation` | `package_return_obligations` | ❌ ไม่มีต้นทาง MySQL โดยตรง (ฟีเจอร์ใหม่) | N/A — backfill ไม่ได้ |
| `PackageReturnEntry` | `package_return_entries` | ❌ ไม่มีต้นทาง MySQL | N/A — backfill ไม่ได้ |
| `MaterialStock` | `materialstocks` | `materialstocks` (0 แถวทั้งคู่ — stub ว่างเปล่า ไม่เคยถูกใช้จริง) | ไม่ต้องสนใจ |

**ตารางที่เจอเพิ่มนอกจากที่คุณคาดไว้:**
- `PackageReturnObligation`/`PackageReturnEntry` — ไม่ได้อยู่ในลิสต์ที่ถามมา แต่ผูก FK ตรงกับ `materials`/`material_outsides` (`materialId`, `materialOutsideId`) ต้อง TRUNCATE พร้อมกัน ไม่งั้น FK constraint จะกันไม่ให้ลบ `materials`
- `MaterialStock` (`materialstocks`) — stub เปล่า ไม่มี field อะไรนอกจาก id/timestamp ทั้งสองระบบไม่เคย populate จริง ไม่ต้องทำอะไรเป็นพิเศษ

**ตารางที่ดูคล้ายวัตถุดิบแต่ "ห้ามแตะ" เพราะจริงๆ เป็นระบบซื้อขาย/คลังสินค้า:**
- `Package` (`packages`), `PackageAst` (`packageasts`), `HtrPackage` (`htrpackages`) — มาจาก MySQL `packages`/`packageasts`/`htrpackages` ซึ่งเป็นระบบบรรจุภัณฑ์เดิมที่ผูกกับ `Supplier` (ฝั่งซื้อขาย) ไม่ใช่ material — และจาก grep โค้ดจริงพบว่า **ไม่มีที่ไหนใน API เรียกใช้ 3 model นี้เลย** (unused stub เหมือนกัน) → ไม่เกี่ยวกับรอบ resync นี้ ไม่ต้องแตะ
- `AstPurchaseOrder`, `FabricAst`, `FabricAstStructure`, `FabricOut`, `StockFabric`, `AstBillOfStructure`, `Production`, `Inventory`, `OrderDeadline`, `OrderShipped`, `Customer`, `Supplier`, `Coordinator`, `FabricReturn` — ทั้งหมดนี้คือระบบซื้อขาย/คลังผ้า **ห้ามแตะเด็ดขาดในรอบนี้**

---

## 2. อ่าน `scripts/sync-from-mysql.ts` ทั้งไฟล์ — สรุปผล

### 2.1 Sync ครบตามข้อ 1 ไหม?
**ไม่ครบ** — script query จาก MySQL แค่ 2 ตารางฝั่งวัตถุดิบ: `materials` (บรรทัด 88) และ `materialstores` (บรรทัด 89) แล้ว insert ลง `materials`/`materialrequisitions`/`materialcoordinators` (จาก `empmaterials`, บรรทัด 87)

**`material_outsides` ไม่ถูก query จาก MySQL เลยสักบรรทัดเดียว** — ยืนยันตรงกับที่คุณสงสัย ที่แย่กว่านั้นคือ comment ในบรรทัด 118-120 ของ script เขียนไว้ว่า:
```
// - orderdeadlines, ordershippeds, fabricimports, productions, inventories,
//   ast_bill_of_structures, material_outsides, material_returns, packages
//   เป็นตาราง PG-only (ไม่มีใน MySQL) → รักษาข้อมูล
```
**Comment นี้ผิดสำหรับ `material_outsides`** — จริงๆ MySQL มีตาราง `material_outsides` อยู่ (คงชื่อเดิมด้วยซ้ำ ดู `comparison-raw-material.md` บรรทัด 22: "ส่งออกภายนอก (subcontract) | `material_outsides` | `MaterialOutside`") เข้าใจผิดว่าเป็น PG-only เหมือน `material_returns`/`packages` (ซึ่งถูกต้องว่าเป็น PG-only จริง) — นี่คือ root cause ของช่องโหว่

### 2.2 Sync แบบไหน — เพิ่ม หรือ เต็ม?
`scripts/sync-from-mysql.ts` **เป็น "sync เต็ม" อยู่แล้ว** (TRUNCATE ทุกตารางในลิสต์ก่อน insert ใหม่ทั้งหมด, ไม่ใช้ upsert — ดู header comment บรรทัด 4-7 และโค้ดจริงบรรทัด 116-161) → **ไม่ต้องปรับโหมด** ตรงกับที่ต้องการสำหรับรอบ backfill นี้อยู่แล้ว

(มีอีกไฟล์คู่กัน `scripts/sync-from-mysql-upsert.ts` ที่เป็นโหมด incremental/upsert — ไม่ใช่ตัวที่จะใช้รอบนี้ แต่มี field-mapping bug เดียวกันทุกจุดกับตัว full-sync เพราะ copy โค้ดกันมา ถ้าจะแก้ควรแก้ทั้งคู่ให้ตรงกันเพื่อไม่ให้ bug กลับมาอีกตอนใช้ incremental sync ครั้งต่อไป)

### 2.3 Field ที่หาย/map ผิด — ต้องแก้ก่อน backfill รอบนี้

| จุด | ปัญหา | ผลกระทบ |
|---|---|---|
| `MaterialRequisition.yarnType`/`.supplierName`/`.lot` (บรรทัด 420-433) | Script คำนวณ `matLookup` เพื่อ resolve `materialId` เท่านั้น (บรรทัด 409-419) แต่**ไม่เคย set `yarnType`/`supplierName`/`lot` ตรงลง row requisition เลย** — 3 field นี้มีอยู่ใน schema จริง (บรรทัด 552-554) เพิ่มมาเมื่อ 2026-07-31 เพื่อกัน data loss ตอน `materialId` resolve ไม่เจอ (memory: [[project_requisition_missing_yarntype_fix]]) แต่การแก้นั้นแก้แค่ POST endpoint ของแอป ไม่เคยแก้ script sync นี้ | ทุกแถวที่ `materialId` resolve ไม่ได้ (unmatched) จะกลายเป็น row ที่ไม่มีทาง identify ยาง/บริษัทเลย — **เกิดปัญหาเดียวกับที่เคยแก้ไปแล้วในแอป ซ้ำอีกรอบทาง sync script** ต้องแก้ |
| `MaterialRequisition.withdrawDate` | ไม่อยู่ใน insert object เลย (บรรทัด 420-430) → Prisma ใช้ schema default `@default(now())` เสมอ | ทุกแถวหลัง resync จะมี `withdrawDate` = เวลาที่รัน sync ไม่ใช่เวลาเบิกจริง — ทำให้ history/report ที่ sort หรือ filter ตาม withdrawDate ผิดทั้งหมด |
| `Material.importDate` | ไม่อยู่ใน `materialData` (บรรทัด 377-400) → default เป็น `null` เสมอ | ฟีเจอร์ "วันที่นำเข้าจริง" (แยกจาก createdAt) จะว่างเปล่าทุกแถวหลัง resync |
| `Material.importStatus` (บรรทัด 395) | `r.importStatus ?? r.import_status ?? 'completed'` — ถ้า MySQL ไม่มีค่า จะ**ใส่ literal string `'completed'` เป็น fallback** | ขัดกับข้อเท็จจริงที่ยืนยันแล้วว่า **ไม่มีแถวไหนใน MySQL มีค่า `'completed'` จริง** (memory: [[project_material_importstatus]] — field นี้เก็บเลขที่บิล/lot เช่น "85046032" ไม่ใช่ status flag) การ default เป็น `'completed'` จะสร้างข้อมูลปลอมที่ไม่เคยมีอยู่จริงหลัง resync ควรเปลี่ยนเป็น fallback เป็น `null`/`''` แทน |
| `material_outsides` (ทั้งฟีเจอร์) | ไม่ถูก query/insert เลย (ข้อ 2.1) — เมื่อเพิ่ม logic sync เข้าไปใหม่ ต้องระวังปัญหาเดียวกัน: ต้อง resolve `materialId` แบบ best-effort (lot+yarnType+supplierName, pattern เดียวกับ requisitions บรรทัด 409-419) และต้อง set `yarnType`/`supplierName`/`lot` ตรงบน row เสมอไม่ว่าจะ resolve ได้หรือไม่ (field พวกนี้เป็น NOT NULL บางส่วนใน schema: `yarnType String` บังคับ, `lot`/`supplierName` เป็น optional) | ถ้าไม่ระวังจะเจอ bug เดียวกับ requisitions ซ้ำเป็นรอบที่ 3 |

**อัปเดต 2026-08-02 — ยืนยันแล้วด้วย `DESCRIBE material_outsides` จริงผ่าน tunnel (read-only):**

```
id                  bigint(20) unsigned  PK, auto_increment
emp                 varchar(100)  NOT NULL   ← ไม่มี field ตรงกันใน Postgres MaterialOutside เลย (ดูหมายเหตุด้านล่าง)
supplierName        varchar(100)  NOT NULL
createDate          varchar(255)  NOT NULL   ← เก็บ string "MM/DD/YYYY" เช่น "07/22/2026" — เป็นวันที่เหตุการณ์จริง แยกจาก created_at
yarnType            longtext      NOT NULL
lot                 varchar(100)  NOT NULL
pallet, box, sack, spool           varchar(100) NOT NULL (ตัวเลขเก็บเป็น string ทั้งหมด ต้อง parse)
weight_p_sum, weight_kg_sum, weight_p_package, weight_kg_package,
weight_p_net, weight_kg_net, average_p, average_kg   varchar(100) NOT NULL (ทั้งหมด)
recipient           varchar(100)  NOT NULL
comment             varchar(100)  NULL
created_at          timestamp     NULL   ← timestamp ระบบ Laravel มาตรฐาน (คนละอันกับ createDate ด้านบน)
updated_at          timestamp     NULL
paymentComment      varchar(255)  NULL   ← ชื่อ column ตรงกับ Postgres เป๊ะ (camelCase เหมือนกัน)
```
Row count จริง: **164 แถว** (ตรงกับที่เคยพบใน Postgres ตอนสำรวจก่อนหน้านี้ — `material-outside-counterparty-investigation.md` ก็บอก 164 แถวเช่นกัน น่าจะเคย backfill มือมาก่อนแล้วครั้งหนึ่ง ไม่ใช่ผ่าน sync script ทั้งสองตัวที่มีอยู่ ต้อง diff ให้ชัดตอน execution ว่าของเดิมใน Postgres ตรงกับ MySQL เป๊ะหรือมี drift)

**พบ 2 เรื่องสำคัญที่ทำให้ต้องแก้ข้อเสนอในหัวข้อ 3:**
1. **มี `createDate` (varchar "MM/DD/YYYY") แยกจาก `created_at` (timestamp) จริง** — คนละคอลัมน์ คนละความหมาย (ตัวอย่างแถว id=182: `createDate`="07/22/2026" แต่ `created_at`="2026-07-23T21:12:32Z" — ต่างกัน 1 วัน) แปลว่า **สมมติฐานเดิมที่ว่า "MySQL ไม่มี field เวลาเหตุการณ์แยกจาก created_at" ผิดสำหรับตารางนี้** ต้องแก้เป็น `withdrawDate = parse(createDate)` ไม่ใช่ `created_at` (ดูหัวข้อ 3 ที่แก้ไขแล้ว)
2. **`emp` (พนักงานที่บันทึกรายการ, NOT NULL ใน MySQL) ไม่มี field ปลายทางใน Postgres `MaterialOutside` เลย** — schema ปัจจุบันไม่มีคอลัมน์ `emp`/`recordedBy` ใดๆ ในโมเดลนี้ (ต่างจาก `Material` ที่มี `emp` field) ถ้า sync ตรงๆ ข้อมูลนี้จะหายไปเงียบๆ ทุกแถว **ต้องตัดสินใจ**: (ก) ทิ้งไปเลย (data loss แต่ field นี้ไม่เคยถูกใช้ในแอปใหม่อยู่แล้ว) หรือ (ข) ยัดใส่ `note`/`usageNote` เป็น prefix (เช่น `[emp: siriporn] ...`) เพื่อไม่ให้หายสนิท

**อัปเดต 2026-08-02 — ยืนยัน `DESCRIBE materials` และ `DESCRIBE materialstores` จริงแล้วเช่นกัน:**

```
DESCRIBE materials  (4,369 แถวจริง ณ ตอนนี้ — โตขึ้นจาก 4,136 ที่เคยบันทึกไว้ 2026-05-01, ระบบยังใช้งานจริงต่อเนื่อง)
  id              bigint  PK
  emp             varchar(100) NOT NULL
  supplierName    varchar(100) NOT NULL
  supplierId      varchar(100) NOT NULL   ← ⚠️ พบใหม่ ไม่มี field ตรงกันใน Postgres Material เลย (model มีแค่ supplierName string, ไม่มี supplierId/FK)
  createDate      varchar(255) NOT NULL   ← "MM/DD/YYYY" แยกจาก created_at เหมือน material_outsides
  yarnType        longtext NOT NULL
  lot, pallet, box, sack, spool, weight_*, average_*    varchar(100) ทั้งหมด (ต้อง parse)
  importStatus    varchar(100) NOT NULL   ← ค่าจริงตัวอย่าง "35181", "35180" (เลขที่บิล ตรงกับที่ memory เคยยืนยันไว้ ไม่ใช่ 'completed' แน่นอน)
  created_at / updated_at   timestamp NULL

DESCRIBE materialstores  (33,384 แถวจริง — โตจาก 30,819 ที่เคยบันทึกไว้)
  id              bigint  PK
  withdrawId      varchar(100) NOT NULL   ← ⚠️ ค่าจริงตัวอย่าง = "siriporn" (ชื่อพนักงานภาษาอังกฤษ ไม่ใช่ unique ID) ดูหมายเหตุด้านล่าง
  department      varchar(100) NOT NULL
  emp             varchar(100) NOT NULL   ← มี field รองรับใน Postgres MaterialRequisition อยู่แล้ว (ต่างจาก material_outsides ที่ไม่มี)
  supplierName    varchar(100) NOT NULL
  yarnType        longtext NOT NULL
  lot             varchar(100) NOT NULL
  spool, weight_p_net, weight_kg_net, average_p, average_kg   varchar(100) ทั้งหมด
  createDate      varchar(255) NOT NULL   ← "MM/DD/YYYY" แยกจาก created_at เช่นกัน — แต่คราวนี้ **ต่างกันไกลกว่าที่คิด** (ดูด้านล่าง)
  created_at / updated_at   timestamp NULL
```

**3 เรื่องสำคัญที่พบเพิ่ม:**

1. **ยืนยันแล้วว่า `createDate` แยกจาก `created_at` จริงทั้ง 3 ตาราง** (`materials`, `materialstores`, `material_outsides`) — สมมติฐานเดิม "ไม่มี field เวลาเหตุการณ์แยก" ผิดทั้งหมด สรุปสูตรสุดท้าย (ไม่มีอะไรค้างแล้ว):
   ```
   Postgres.Material.importDate              = parse(MySQL.materials.createDate, "MM/DD/YYYY")
   Postgres.MaterialRequisition.withdrawDate = parse(MySQL.materialstores.createDate, "MM/DD/YYYY")
   Postgres.MaterialOutside.withdrawDate     = parse(MySQL.material_outsides.createDate, "MM/DD/YYYY")
   ```

2. **`materialstores.created_at`/`updated_at` ห้ามใช้เป็น `createdAt` เลย — ข้อมูลไม่น่าเชื่อถือ** ตัวอย่างแถวล่าสุด (id=33710, id=33709): `createDate`="05/27/2026" (เหตุการณ์จริง) แต่ `created_at`="2026-08-02T01:22:34.000Z" **ห่างกันเกือบ 2 เดือน** และแถวติดกัน 2 แถวมี `created_at`/`updated_at` เหมือนกันเป๊ะ (timestamp เดียวกันถึงวินาที) — ชี้ชัดว่ามี batch job/migration บางอย่างรันทับ `created_at` ของหลายแถวพร้อมกันเมื่อเร็วๆ นี้ในฝั่ง Laravel เอง (ไม่ใช่เวลาสร้างจริงต่อแถว) **สรุป: สำหรับ `materialstores` ต้องใช้ `createDate` เป็นทั้ง `withdrawDate` และแหล่งอ้างอิงหลักของ `createdAt` ด้วย ห้ามใช้ pattern เดิมของ script (`r.created_at ? ... : new Date()`) อีกต่อไปสำหรับตารางนี้** ต่างจาก `materials`/`material_outsides` ที่ `created_at` ยังดูสมเหตุสมผล (ใกล้เคียง `createDate` ในตัวอย่างที่เห็น)

3. **`materialstores.withdrawId` ไม่ใช่ unique ID** — ค่าจริงคือชื่อพนักงาน (เช่น "siriporn") ซ้ำกันได้ทุกครั้งที่พนักงานคนเดิมเบิกของ ต่างจาก `emp` ที่เก็บชื่อไทยแยกอีกคอลัมน์ ("สิริสาคร") ถ้า sync ตรงๆ `Postgres.MaterialRequisition.withdrawId` จะมีค่าซ้ำกันหลายพันแถว (แอปปัจจุบันน่าจะ generate withdrawId เป็น UUID ตอน user กรอกผ่านฟอร์มจริง ไม่ใช่ชื่อคน) — **ต้องตัดสินใจ**: เก็บค่า MySQL ตรงๆ (ซ้ำได้ ไม่ unique) หรือ generate UUID ใหม่ให้ทุกแถวตอน sync แทน (เสีย traceability กลับไป MySQL id เดิม แต่ withdrawId จะมีความหมายตรงกับที่แอปใหม่ใช้งานจริง)

**พบเพิ่ม (ยังไม่เคยพูดถึง):** `materials.supplierId` (varchar เก็บเลข เช่น "11") — MySQL มีทั้ง `supplierName` และ `supplierId` แต่ Postgres `Material` model มีแค่ `supplierName String` ไม่มี `supplierId`/FK เลย **ข้อมูลนี้หายไปเงียบๆ เสมอมา** (ทั้ง 2 sync script ปัจจุบันก็ไม่ดึง field นี้อยู่แล้ว) ไม่ใช่บั๊กใหม่จากรอบนี้ แต่เป็นข้อมูลที่มีอยู่จริงฝั่ง MySQL ที่ resync จะไม่ได้เก็บมาด้วย — ถ้าต้องการ FK ที่แน่นอนไปยัง `suppliers` (แทนการ match ด้วยชื่อ string ที่อาจสะกดต่างกัน) ต้องเพิ่ม column ใหม่ใน schema ก่อน (นอกขอบเขตงาน resync รอบนี้ แต่ควรรู้ไว้)

---

## 3. เรื่อง `createdAt`/เวลาบันทึกจริง — สรุปสุดท้าย (ยืนยันครบทั้ง 3 ตารางแล้ว)

**สูตรสุดท้ายที่ยืนยันด้วย `DESCRIBE` จริงแล้ว (ไม่มีอะไรค้าง):**

| Postgres field | สูตร | เหตุผล |
|---|---|---|
| `Material.importDate` | `parse(MySQL.materials.createDate, "MM/DD/YYYY")` | column แยกจริง ยืนยันแล้ว |
| `Material.createdAt`/`updatedAt` | คง pattern เดิม `r.created_at ? new Date(r.created_at) : new Date()` | `created_at` ของตารางนี้ยังดูสมเหตุสมผล ใกล้เคียง `createDate` ในตัวอย่างที่เห็น (ห่างกันไม่เกิน 1 วัน) |
| `MaterialRequisition.withdrawDate` | `parse(MySQL.materialstores.createDate, "MM/DD/YYYY")` | column แยกจริง ยืนยันแล้ว |
| `MaterialRequisition.createdAt`/`updatedAt` | **เปลี่ยนเป็น `parse(createDate)` เช่นกัน ห้ามใช้ `created_at`** | ดูข้อ (2) ด้านล่าง — `created_at` ของตารางนี้พังจริง ไม่ใช่แค่ทฤษฎี |
| `MaterialOutside.withdrawDate` | `parse(MySQL.material_outsides.createDate, "MM/DD/YYYY")` | column แยกจริง ยืนยันแล้ว |
| `MaterialOutside.createdAt`/`updatedAt` | คง pattern เดิม `r.created_at ? ... : new Date()` | `created_at` ของตารางนี้ยังดูสมเหตุสมผล (ห่างจาก createDate ไม่เกิน 1 วันในตัวอย่าง) |

**บทเรียนสำคัญจากการตรวจครบทั้ง 3 ตาราง:** ทุกตารางมี `createDate` (varchar "MM/DD/YYYY") แยกจาก `created_at` (timestamp) จริง — สมมติฐานเดิมที่คิดว่า "Laravel เก่าไม่มี concept วันที่เหตุการณ์แยกจาก created_at" ผิดทั้งหมด และที่ร้ายแรงกว่านั้นคือ **`materialstores.created_at` เชื่อถือไม่ได้เลย** (ดูรายละเอียดในหัวข้อ 2.3 ข้อ 2 — ห่างจาก `createDate` จริงเกือบ 2 เดือน แถวติดกันมี timestamp เป๊ะเหมือนกัน ชี้ว่าเป็นผลจาก batch job ล่าสุด ไม่ใช่เวลาสร้างจริง) จึงต้องใช้ `createDate` เป็นแหล่งเดียวสำหรับทั้ง `withdrawDate` และ `createdAt`/`updatedAt` ของ `MaterialRequisition` โดยเฉพาะ ต่างจากอีก 2 ตารางที่ `created_at` ยังใช้ได้

---

## 4. ผล Diff ข้อมูลเดิม

_ทำ 2026-08-03 — อ่านอย่างเดียวทั้ง Postgres (`prisma.materialOutside.findMany`) และ MySQL (`SELECT * FROM material_outsides`) ไม่มีการแก้ไขข้อมูลใดๆ ทั้งสองฝั่ง_

เทียบ 164 แถวใน Postgres `material_outsides` (`deletedAt IS NULL`) กับ 164 แถวใน MySQL ต้นทาง — match ด้วย composite key `yarnType + supplierName + lot + spool` (ไม่มี field เชื่อม MySQL id เดิมเก็บไว้ใน Postgres เลย จึงต้องใช้วิธีนี้)

### สรุปตัวเลข

| กลุ่ม | จำนวน | ความหมาย |
|---|---|---|
| ตรงกัน 100% | 0 | ไม่มีแถวไหนตรงกันแบบไม่มีส่วนต่างเลยสักแถว (ดูเหตุผลด้านล่าง — เป็นรูปแบบเดียวกันหมด ไม่ใช่ข้อมูลเสีย) |
| ตรงกันแต่มีส่วนต่าง | 151 | ทุกแถวมีแค่ **2 diff แบบเดิมซ้ำๆ กันหมด** (ดูด้านล่าง) — ไม่มีแถวไหนมีส่วนต่างที่ weight/recipient/paymentComment เลยสักแถว |
| มีใน MySQL แต่ไม่มีใน Postgres | 0 | ไม่มีแถวไหนตกหล่นจาก backfill ครั้งก่อน |
| มีใน Postgres แต่ไม่มีใน MySQL | 1 | แถวเดียว (ดูรายละเอียดด้านล่าง) |
| Ambiguous (key ซ้ำ, เทียบทีละแถวไม่ได้) | 6 กลุ่ม (13 แถวต่อฝั่ง) | จำนวนแถว MySQL/Postgres เท่ากันทุกกลุ่ม (0 กลุ่มที่จำนวนไม่ตรงกัน) — น่าจะโอเค แค่ key ที่เลือกไม่ unique พอ ไม่ใช่สัญญาณข้อมูลหาย |
| รวม unique key ที่เช็ค | 158 | |

### รายละเอียด 151 แถวที่ "ตรงกันแต่มีส่วนต่าง" — เป็น pattern เดียวกันทั้งหมด ไม่ใช่ข้อมูลเสีย

ตรวจ diff type ทุกแถว (ไม่ใช่แค่ตัวอย่าง) พบว่า **ทั้ง 151 แถวมีแค่ 2 diff ซ้ำแบบเดิมเป๊ะ ไม่มีแถวไหนมี diff อื่นเลย**:

1. **`note` ↔ `comment`**: `pg.note` = `mysql.comment` + suffix `[legacy] emp=X, pallet/box/sack=N` เสมอ — เช่น mysqlId=11: mysql.comment="ขายด้ายต่อรุ่งโรจน์" → pg.note="ขายด้ายต่อรุ่งโรจน์ [legacy] emp=siriporn, pallet=1" นี่คือหลักฐานว่า **มีคนเคย backfill ตารางนี้มาก่อนแล้วครั้งหนึ่งด้วยมือ/สคริปต์อื่น (ไม่ใช่ 2 sync script ที่มีอยู่ตอนนี้ ซึ่งไม่ query material_outsides เลย)** และตอนนั้นได้แก้ปัญหา "MySQL.emp ไม่มี column ปลายทาง" ไปแล้วด้วยการยัดใส่ `note` เป็น suffix — เป็นบรรทัดฐานที่ตรงกับทางเลือก (ข) ที่เสนอไว้ในหัวข้อ 2.3 พอดี
2. **`withdrawDate` ผิดทุกแถว**: **`pg.withdrawDate` = `2026-07-30` เหมือนกันทุกแถวที่ตรวจ** (วันที่ backfill ครั้งก่อนรัน) ในขณะที่ `mysql.createDate` เป็นวันที่จริงหลากหลาย ย้อนไปถึงปี 2023 (เช่น "2023-02-09", "2023-02-04" ฯลฯ) — **ยืนยันชัดเจนว่า backfill ครั้งก่อนไม่ได้เก็บวันที่เหตุการณ์จริงเลย ใช้วันที่รัน backfill แทนทั้งหมด** นี่คือสิ่งที่การ resync รอบใหม่ (พร้อม parse `createDate` ที่แก้ไขแล้ว) จะซ่อมได้จริง ไม่ใช่แค่ทฤษฎี

**ข่าวดี:** ไม่มีแถวไหนใน 151 แถวนี้ที่ weight (`weightWithdrawn`/`weightKgSum`), `recipient`, หรือ `paymentComment` ต่างกันเลย — ตัวเลขสำคัญทั้งหมดถูกเก็บมาถูกต้องตั้งแต่รอบ backfill ก่อนหน้า มีแค่ `note`/`withdrawDate` ที่เพี้ยน

### แถวที่มีใน Postgres แต่ไม่มีใน MySQL (1 แถว)

```
pgId=199, withdrawId=c8a13b26-0dd5-4768-b377-aef651f9bc62 (UUID จริง ไม่ใช่ pattern "LEGACY-xxx")
yarnType=C 20 OE, supplierName=อินเดีย, lot=2015A, spool=1500
withdrawDate=2026-07-31, createdAt=2026-07-31 20:41:06
```
**ข้อสังเกต:** withdrawId เป็น UUID จริง (ไม่ใช่ prefix "LEGACY-" ที่แถวเก่าใช้) แปลว่าแถวนี้ถูกสร้างผ่านฟอร์มจริงของแอปใหม่ (ไม่ใช่ backfill) วันที่ 31 ก.ค. 2026 — **ไม่จำเป็นต้องเป็น "ข้อมูลทดสอบ" เสมอไป** อาจเป็นรายการจริงที่กรอกช่วงสั้นๆ ที่แอปใหม่ถูก deploy ขึ้น production ก่อนจะพังแล้วถอยกลับไปใช้ Laravel (ตามบริบทที่ user เล่าไว้ตอนขอ resync) — **ควรตรวจสอบกับผู้ใช้จริงก่อนว่าใช่ข้อมูลทดสอบหรือรายการจริงที่ยังไม่ได้ป้อนกลับเข้า Laravel** ก่อนที่ TRUNCATE จะลบมันหายไปแบบกู้คืนไม่ได้ (มีอยู่ใน dump backup ที่เพิ่งทำแล้วอย่างน้อย)

### Ambiguous groups (6 กลุ่ม, key ซ้ำ)

ทุกกลุ่มมีจำนวนแถว MySQL = Postgres เป๊ะ (ไม่มีกลุ่มไหนจำนวนไม่ตรงกัน) — เช่น `TC 45 COMB (65:35) G 10 | บริษัท แพรกษาเท็กซ์ไทล์ จำกัด | lot=2 | spool=630` มี 2 แถวทั้งสองฝั่ง แปลว่าเป็นการเบิกจริงที่ยารน์/ซัพพลายเออร์/ล็อต/จำนวนหลอดเดียวกันเกิดขึ้นหลายครั้ง (คนละวัน) ไม่ใช่สัญญาณข้อมูลหาย — เป็นข้อจำกัดของ composite key ที่เลือกเท่านั้น ยังไม่ได้ไล่เทียบทีละแถวในกลุ่มพวกนี้ (ถ้าต้องการความละเอียดสูงกว่านี้ต้องเพิ่ม field วันที่เข้าไปใน key ด้วย)

### 4.1 ตามหาแถวแบบเดียวกับ pgId=199 ใน `materials` และ `materialrequisitions` (2026-08-03)

_อ่านอย่างเดียวทั้ง Postgres และ MySQL ไม่มีการแก้ไขข้อมูลใดๆ ทั้งสองฝั่ง_

หลังยืนยันว่า pgId=199 (`material_outsides`) เป็นข้อมูลจริงต้องเก็บไว้ ตรวจต่อว่ามีแถวแบบเดียวกันซ่อนอยู่ใน `materials`/`materialrequisitions` ไหม — **วิธี diff รอบนี้ต้องปรับ 2 ครั้งระหว่างทาง เพราะเจอข้อจำกัดของ composite key เดิมที่ใช้กับ `material_outsides`:**

**ปัญหาที่เจอระหว่างทำ:**
1. **`materialrequisitions` composite key (yarnType+supplierName+lot+spool) ใช้ไม่ได้เลยในตอนแรก** — เช็คแล้วพบว่ามีแค่ 3 จาก 31,492 แถวเท่านั้นที่มี `yarnType`/`supplierName`/`lot` ตรงบน row จริง (denormalize เพิ่มเมื่อ 2026-07-31 สำหรับ row ใหม่เท่านั้น) อีก 30,824 แถวต้อง resolve ผ่าน `materialId` join กับตาราง `materials` ก่อนถึงจะได้ key ที่เทียบได้ (665 แถวไม่มีทั้งคู่ — ตรงกับ orphan count ที่เคยพบมาก่อน ไม่ใช่เรื่องใหม่)
2. **หลังแก้ข้อ 1 แล้ว composite-key ยังให้ผลเข้าใจผิดอยู่ดี** เพราะ `materialrequisitions` มีการเบิก yarnType+supplier+lot+spool **ชุดเดียวกันซ้ำหลายครั้งจริง** (คนละวัน) เยอะกว่า `material_outsides` มาก ทำให้ key ไม่ unique พอ บวกกับ `withdrawDate`/`created_at` ของแถวเก่าถูก clamp เป็นค่าเดียวกันหมด (บั๊กเดียวกับที่พบใน `material_outsides` — ยืนยันซ้ำในข้อมูลจริงของ `materialrequisitions` ด้วย) ทำให้ใช้วันที่ช่วยแยกแยะภายในกลุ่มซ้ำไม่ได้
3. **วิธีที่แม่นที่สุดคือเช็คด้วย id ตรงๆ** เพราะทั้ง 2 sync script ที่มีอยู่ (`sync-from-mysql.ts`/`-upsert.ts`) เก็บ MySQL id เดิมไว้ตรงๆ (`id: Number(r.id)`) — เลย query MySQL หา id เดียวกันตรงๆ แทน composite key แล้วเทียบเนื้อหาแถวว่าตรงกันจริงไหม (ไม่ใช่แค่ "id เจอ = ปลอดภัย" เพราะ Laravel เป็นระบบ production ที่ id ยังเดินหน้าเรื่อยๆ อาจมี id ชนกันโดยบังเอิญระหว่าง test row ที่สร้างใน Postgres กับ transaction จริงใหม่ใน MySQL ที่เกิดทีหลัง — ต้องดูเนื้อหาประกอบด้วยเสมอ)

**ผลตรวจ `materials` — เจอ 8 แถวที่ composite-key มองว่า "ไม่มีคู่" แต่ทุกแถว id ตรงกับ MySQL จริง:**

| pgId | Postgres (เก่า) | MySQL (ปัจจุบัน) | สรุป |
|---|---|---|---|
| 1798 | lot="00E201-19" spool=600 importStatus=K4012400185 | lot="00E071-21" spool=600 importStatus=K4012400185 | **แถวเดิมจริง** — importStatus (เลขบิล) ตรงกันเป๊ะ มีแค่ `lot` ที่เปลี่ยนใน MySQL หลัง backfill (แก้/renumber lot ทีหลังใน Laravel) ไม่ใช่ข้อมูลใหม่ |
| 1799 | lot="00E201-19" spool=150 importStatus=K4012400186 | lot="00E071-21" spool=150 importStatus=K4012400186 | เหมือนข้อบน |
| 4152 | lot="00E201-36" spool=480 importStatus=K4012600299 | lot="00E071-27" spool=480 importStatus=K4012600299 | เหมือนข้อบน |
| 4296 | lot="1" spool=1000 importStatus="test111" note="ทดสอบ" | lot="16" spool=3024 importStatus="34858" (real invoice #) | **id ชนกันโดยบังเอิญ** — เนื้อหาต่างกันสิ้นเชิง แถว Postgres คือ test data จริง แถว MySQL id เดียวกันคือ transaction จริงที่เกิดทีหลัง (Laravel ยัง insert ต่อเนื่อง) |
| 4299 | lot="-" spool=1000 importStatus="test1112" note="ทดสอบ" | lot="00E201-36" spool=480 importStatus="K4012600481" | id ชนกันโดยบังเอิญ เหมือนข้อบน — test data |
| 4302 | lot="-" spool=1000 importStatus="test001" | lot="00E201-36" spool=480 importStatus="K4012600483" | id ชนกันโดยบังเอิญ — test data |
| 4304 | lot="test01" spool=700 importStatus="test0011" note="ทดสอบ" | lot="00K301-04" spool=720 importStatus="K3032601111" | id ชนกันโดยบังเอิญ — test data |
| 4309 | lot="-" spool=**100000** importStatus="test111" note="ทดสอบ" | lot="16" spool=3048 importStatus="34884" | id ชนกันโดยบังเอิญ — test data (spool 100,000 หลอดไม่สมจริงชัดเจน) |

**สรุป `materials`: ไม่มีแถวไหนเป็น "ข้อมูลจริงที่หายจาก MySQL" แบบ pgId=199 เลย** — 3 แถว (1798,1799,4152) เป็นแถวเดิมจริงที่แค่ `lot` เปลี่ยนใน MySQL ทีหลัง (resync จะอัปเดตให้ตรงปัจจุบัน ถือเป็นการแก้ไขให้ถูกต้อง ไม่ใช่การทำลายข้อมูล) และ 5 แถว (4296,4299,4302,4304,4309) เป็น test data ยืนยันชัดด้วย note "ทดสอบ"/importStatus "testXXX" — ปลอดภัยที่จะเสียไป

**ผลตรวจ `materialrequisitions` (เทียบกับ `materialstores`) — เจอ 11 แถวจาก composite-key, ตรวจ id จริงแล้วแยกได้ 4 กลุ่ม:**

| กลุ่ม | pgId | รายละเอียด | สรุป |
|---|---|---|---|
| False positive จากบั๊ก script เอง | 15931, 15948 | MySQL id เดียวกัน เนื้อหาตรงกันเป๊ะทุก field (yarnType=TC 7 OE, lot=K, spool=24, วันใกล้เคียง) | **ไม่ใช่แถวพิเศษเลย** — script diff รอบแรกจับคู่พลาดเพราะ duplicate-key + withdrawDate ที่ clamp ไว้เหมือนกันหมด (บั๊กของสคริปต์ ไม่ใช่ของข้อมูล) |
| แถวเดิมจริง ค่า spool เปลี่ยนใน MySQL ทีหลัง | 10840 | pg: spool=36, MySQL id เดียวกัน: spool=**60** (yarnType/lot/emp ตรงกันหมด) ไม่มี note "ทดสอบ" | คล้ายกรณี `materials` lot-drift — น่าจะเป็นแถวเดิมที่ MySQL แก้ไขค่าทีหลัง ไม่ใช่ข้อมูลใหม่ |
| **ไม่แน่ใจ — ใกล้เคียง pattern ของ pgId=199 ที่สุด** | 31781 | pg: yarnType=**TC 7 OE**, lot=K, spool=24, materialId=1911 (เดียวกับ 15931/15948), department/withdrawId="siriporn" ตรง pattern legacy ทุกอย่าง, **ไม่มี note "ทดสอบ"** — MySQL id เดียวกัน (31781) กลับเป็นคนละเรื่อง (yarnType=**CVC 7**, createDate 2026, ไม่เกี่ยวกัน) → id ชนกันโดยบังเอิญ แต่ **ตัวแถว Postgres เองดูเหมือนการเบิกจริงครั้งที่ 3 ของชุดเดียวกับ 15931/15948** (ไม่มี MySQL row คู่ที่ 3 สำหรับ yarnType=TC 7 OE+lot=K+spool=24 เลย — มีแค่ 2 แถวใน MySQL) | **ต้องถาม user** — อาจเป็นรายการเบิกจริงครั้งที่ 3 ที่กรอกผ่านแอปใหม่แต่ไม่เคยถูกบันทึกใน Laravel (Laravel ขาดรายการนี้ไป) หรืออาจเป็น test clone ที่ลืมใส่ note — ไม่มีหลักฐานชี้ขาดทางใดทางหนึ่ง 100% |
| Test data ยืนยันชัด | 31806, 31807, 31808, 31814, 31826, 31828, 31829 | ทุกแถวมี `note="ทดสอบ"`, `withdrawId` เป็น UUID จริง (ไม่ใช่ "siriporn" placeholder แบบ legacy), เนื้อหา (yarnType/lot/spool) ต่างจาก MySQL id เดียวกันโดยสิ้นเชิง — สอดคล้องกับช่วงที่ dev ทดสอบฟีเจอร์ requisition/average-weight ใน session ก่อนหน้านี้ | **id ชนกันโดยบังเอิญกับ transaction จริงใหม่ใน MySQL** — เป็น test data ปลอดภัยที่จะเสียไป (บาง materialId ที่อ้างถึง เช่น 4299/4302/4309 ก็เป็น test material ที่เจอในตารางบนพอดี — สอดคล้องกัน) |

**สรุป `materialrequisitions`: มีแค่ 1 แถว (pgId=31781) ที่ยังไม่แน่ใจ 100% ว่าเป็นข้อมูลจริงหรือ test** — ใกล้เคียง pattern ของ pgId=199 ที่สุด (ไม่มี test marker, เนื้อหาสมเหตุสมผล, แต่ MySQL ไม่มีคู่จริงๆ) แนะนำให้ user ช่วยยืนยันก่อนตัดสินใจ เช่นเดียวกับ pgId=199

### สรุปนัยต่อแผน resync (ครบทั้ง 3 ตาราง)

**อัปเดต 2026-08-03 (ล่าสุด):** `material_outsides.pgId=199` **ถูกถอดออกจากแผนเก็บรักษาแล้ว** — export เนื้อหาเต็มมาดูพบว่า `note`="ทดสอบ" และ `recipient`="ทดสอบซื้อประจำ" จริง user ยืนยันว่าเป็น test data ไม่ต้องเก็บ ปล่อยให้ TRUNCATE ลบไปตามปกติ

**เหลือแค่ 1 แถวที่ต้องเก็บรักษา:** `materialrequisitions.pgId=31781` — **ยืนยันแล้ว 2026-08-03: เป็นข้อมูลจริง เก็บไว้ตามแผน 4.2** (export เนื้อหาเต็มแล้ว ไม่มีคำว่า "ทดสอบ"/"test" ใน field ไหนเลย ต่างจาก pgId=199)

### 4.2 แผนวิธีเก็บรักษา `materialrequisitions.pgId=31781` — ✅ ดำเนินการเสร็จแล้ว 2026-08-03

**อัปเดต:** ทำ TRUNCATE+resync จริงแล้ว ตัวเลขตรงกับที่คาดทุกตาราง (materials 4,369 / materialrequisitions 33,384 / material_outsides 164, matched/unmatched ตรงกับ dry-run เป๊ะ ไม่มี error) จากนั้น restore แถวที่ preserve ไว้สำเร็จ:
- แถวใหม่ได้ **id=33711** (auto-generate ตามแผน ไม่ชนกับแถวจริงที่ MySQL sync เข้ามาแทนที่ id=31781 เดิม)
- `materialId=1911` ยืนยันแล้วว่า resolve ถูกต้อง (Material id=1911 ยังอยู่หลัง resync เนื้อหาตรงเป๊ะ)
- `yarnType`/`supplierName`/`lot` denormalize จาก Material 1911 ถูกต้อง ("TC 7 OE"/บริษัท กั๋ว จวิน เท็กซ์ไทล์ (ไทยแลนด์) จำกัด/"K")
- `note` มี suffix `[preserved 2026-08-03: original id=31781, not in MySQL source]` ตามที่ยืนยันไว้
- ยิง `GET /api/warehouse/material/requisition?q=TC%207%20OE` เจอแถวนี้จริง พร้อม join Material ถูกต้อง — total หลัง resync = 33,385 (33,384 + 1 ที่ restore)

**ตรวจไว้แล้ว (read-only, 2026-08-03):**

1. **`materialrequisitions.pgId=31781` ผูกกับ `materialId=1911`** (TC 7 OE, lot=K, supplier บริษัท กั๋ว จวิน เท็กซ์ไทล์) — เช็คแล้วว่า MySQL `materials` มี id=1911 อยู่จริง เนื้อหาตรงกับ Postgres เป๊ะทุก field (importStatus="024", น้ำหนัก/spool ตรงกันหมด) **สรุป: Material id=1911 จะยังคงเป็น id=1911 หลัง resync แน่นอน** (sync script preserve MySQL id ตรงๆ ตามที่ยืนยันไว้ก่อนหน้า) — FK `materialId=1911` ของแถวที่กันไว้จะยังใช้งานได้ทันทีหลัง resync ไม่ต้อง remap
2. **⚠️ พบความเสี่ยงสำคัญเรื่อง id ชนกัน — ต้องระวังตอน restore:**
   - MySQL `materialstores` `MAX(id)` = 33,710 — **id=31781 อยู่ในช่วงที่ MySQL sync มาแน่นอน และเรายืนยันแล้วว่า MySQL id=31781 คือแถวจริงอีกแถวหนึ่ง (yarnType=CVC 7 คนละเรื่องกันเลย)** — **ถ้า restore โดยใช้ id เดิม (31781) จะชนกับแถวจริงที่ resync ใส่มาแทน (primary key conflict หรือแย่กว่านั้นคือเขียนทับข้อมูลจริงถ้าทำผ่าน upsert)** ต้องให้แถวนี้ได้ **id ใหม่** ตอน restore เท่านั้น ห้ามยัด id=31781 กลับเข้าไปเด็ดขาด

**แผนขั้นตอน (ยังไม่ทำจริง):**

**Step 0.6 (ใหม่ — ก่อน TRUNCATE ในข้อ Step 1):** Export เนื้อหาเต็มของแถวนี้เป็นไฟล์ JSON เก็บไว้ใน local ชั่วคราว (ไม่ commit เข้า git):
```
scripts/exports/preserve-materialrequisitions-31781.json  (ทุก field รวม id เดิม — ใช้แค่เพื่ออ้างอิง ไม่ reuse ตอน restore)
```
ใช้ `prisma.materialRequisition.findUnique({ where: { id: 31781 } })` เขียนผลลง JSON ตรงๆ

**Step 1-4:** ตามแผนเดิม (TRUNCATE → แก้ sync script → dry-run → รันจริง) ไม่เปลี่ยนแปลง

**Step 4.6 (ใหม่ — หลังรัน sync script จริงใน Step 4, ก่อน Verify ใน Step 5):** Restore แถวจาก JSON กลับเข้าไป:
- insert กลับโดย **ห้ามใช้ id=31781 เดิมเด็ดขาด** ต้องปล่อยให้ Postgres auto-generate id ใหม่ (ไม่ระบุ `id` ตอน insert) — คง `materialId=1911` ตรงๆ (ยืนยันแล้วว่า FK ใช้ได้) — เนื่องจากตอนนี้ sync script ที่แก้แล้ว (Step 2) จะ denormalize `yarnType`/`supplierName`/`lot` ลง row ใหม่ทุกแถวแล้ว แนะนำ**เติม field พวกนี้ให้แถวที่ restore ด้วยเช่นกัน** (yarnType="TC 7 OE", supplierName="บริษัท กั๋ว จวิน เท็กซ์ไทล์ (ไทยแลนด์) จำกัด", lot="K" — ดึงจาก Material id=1911 ตรงๆ) เพื่อให้สอดคล้องกับ convention ใหม่ ทั้งที่ต้นฉบับ (ก่อน backfill) ไม่มี field พวกนี้
- ควรพิจารณาแก้ `note` ให้สะท้อนว่าเป็นแถวที่ preserve ผ่าน manual process นี้ (เช่นเดียวกับ pattern `[legacy] emp=X` ที่เจอใน backfill ครั้งก่อน) — เสนอ suffix แบบ `[preserved 2026-08-03: original id=31781, not in MySQL source]` ต่อท้าย note เดิม เพื่อให้สืบย้อนได้ในอนาคตว่าทำไมแถวนี้ถึงไม่ตรงกับ MySQL — **รอ user ยืนยันรูปแบบ note นี้ก่อน** (เป็นทางเลือก ไม่ใช่ต้องทำ)
- หลัง insert **ไม่ต้อง reset sequence ซ้ำ** เพราะไม่ได้ระบุ id เอง

**Step 5 (เดิม, ต้องเพิ่ม 1 ข้อ):** Verify — เพิ่มเช็คว่าแถวที่ preserve กลับมาอยู่ครบ, `materialId` ยัง resolve ถูกต้อง (join กับ Material 1911 แล้วได้ yarnType/supplierName ตรงตามที่คาด), และยิง endpoint (`/material/requisition`) เห็นแถวนี้กลับมาจริง

---

## 5. แผนขั้นตอนที่เสนอ (ยังไม่ทำจริง)

### Step 0 — Backup ก่อนเสมอ
**แนะนำให้ backup local DB (`ast_new`) ก่อนเริ่ม** แม้จะเป็น dev DB ที่ตั้งใจจะล้าง เพราะ:
- ป้องกันพลาด (เช่น TRUNCATE ผิดตารางเพราะ FK เรียงผิด)
- เผื่อพบว่ามี real data ปนอยู่ในตารางที่คิดว่าเป็น test data ล้วน (เช่น `material_returns`/`package_return_obligations` ที่ไม่มีทาง backfill ถ้าลบไปแล้วจะกู้คืนไม่ได้เลย)
```
docker exec ast_postgres pg_dump -U postgres -d ast_new -F c -f /tmp/ast_new_pre_resync.dump
docker cp ast_postgres:/tmp/ast_new_pre_resync.dump ./backups/ast_new_pre_resync_$(date +%Y%m%d).dump
```
(โฟลเดอร์ `backups/` มีอยู่แล้วใน working tree ปัจจุบัน — untracked, ยังไม่ commit)

### Step 1 — ลำดับ TRUNCATE (คำนึง FK)
ตารางในโดเมนวัตถุดิบทั้งหมด "ปิดวง" กันเอง (ไม่มีตารางนอกโดเมนอ้าง FK เข้ามา) — ลบพร้อมกันได้ในคำสั่งเดียวด้วย `CASCADE` ไม่ต้อง drop/re-add constraint แบบที่ script เดิมทำกับฝั่ง sales:
```sql
TRUNCATE TABLE
  package_return_entries,      -- ลูกสุด (อ้าง obligation)
  package_return_obligations,  -- อ้าง materials + material_outsides
  material_returns,            -- อ้าง materials (ไม่มีต้นทาง MySQL — จะว่างหลัง resync)
  material_outsides,           -- อ้าง materials
  materialrequisitions,        -- อ้าง materials
  materialcoordinators,        -- อิสระ ไม่มี FK
  materials                    -- แม่สุด
CASCADE;
```
ลำดับในโค้ดไม่สำคัญเพราะใช้ CASCADE แต่เขียนไล่จาก child→parent เพื่อความชัดเจน

### Step 2 — แก้ `scripts/sync-from-mysql.ts` ก่อนรัน
ทุกสูตรยืนยันครบแล้ว (ไม่มีอะไรค้าง) ต้องแก้ทั้งหมดนี้ก่อนรันจริง:
1. เพิ่ม query `SELECT * FROM material_outsides ORDER BY id ASC` และ insert logic (resolve materialId best-effort เหมือน requisitions ด้วย lot+yarnType+supplierName, set yarnType/supplierName/lot ตรงบน row เสมอไม่ว่า resolve ได้หรือไม่ — คอลัมน์ MySQL ยืนยันแล้วคือ `yarnType`/`lot`/`supplierName` ตรงชื่อ Postgres เป๊ะ)
2. เพิ่ม `yarnType`/`supplierName`/`lot` ลง object insert ของ `materialrequisitions` (ไม่ใช่แค่ใช้ resolve materialId)
3. เขียน parser แปลง `createDate` ("MM/DD/YYYY" string) → `Date` ใช้ร่วมกันทั้ง 3 จุด:
   - `Material.importDate = parse(materials.createDate)`
   - `MaterialRequisition.withdrawDate = parse(materialstores.createDate)`
   - `MaterialOutside.withdrawDate = parse(material_outsides.createDate)`
4. **เฉพาะ `materialrequisitions`**: เปลี่ยน `createdAt`/`updatedAt` จาก pattern เดิม (`r.created_at ? ... : new Date()`) เป็น **ใช้ `parse(createDate)` แทนด้วย** — `materialstores.created_at` พิสูจน์แล้วว่าไม่น่าเชื่อถือ (ห่างจาก createDate จริงเกือบ 2 เดือน, ดูข้อ 2.3/3) ส่วน `materials`/`material_outsides` ยัง keep pattern เดิม (`created_at` ยังสมเหตุสมผล)
5. แก้ fallback `importStatus` จาก `'completed'` เป็น `null` (หรือ `''`)
6. เพิ่ม `material_outsides` เข้าลิสต์ TRUNCATE (ตอนนี้อยู่ใน comment ว่า "PG-only รักษาข้อมูล" ต้องเอาออกจาก assumption นั้น)
7. เพิ่ม `material_returns`, `package_return_obligations`, `package_return_entries` เข้าลิสต์ TRUNCATE ด้วย (ปัจจุบัน script ไม่ truncate เลย เพราะถือเป็น PG-only ที่ "รักษาข้อมูล" — รอบนี้ user ต้องการล้างทั้งหมดรวมพวกนี้ด้วย ต่างจาก mode ปกติของ script)
8. **ตัดสินใจเรื่อง `emp`** (MySQL `material_outsides.emp`, NOT NULL — ไม่มี field ปลายทางใน Postgres `MaterialOutside` เลย): ทิ้งไปเงียบๆ หรือยัดเข้า `note`/`usageNote` เป็น prefix
9. **ตัดสินใจเรื่อง `materialstores.withdrawId`** (ค่าจริงเป็นชื่อพนักงาน เช่น "siriporn" ไม่ใช่ unique ID — ซ้ำกันได้หลายพันแถว): เก็บค่า MySQL ตรงๆ (ยอมรับว่าไม่ unique) หรือ generate UUID ใหม่ตอน sync แทน
10. `materials.supplierId` (พบใหม่ ไม่มี field ปลายทางใน Postgres `Material`): ไม่ต้องทำอะไรในรอบ resync นี้ (out of scope — ต้องเพิ่ม schema column ก่อนถ้าจะเก็บ) แค่บันทึกไว้ว่าข้อมูลนี้หายไปเงียบๆ เหมือนเดิม ไม่ใช่เรื่องใหม่ที่ resync ทำให้แย่ลง

### Step 3 — Dry-run ก่อนเสมอ
```
npx tsx scripts/sync-from-mysql.ts --dry-run
```
ดูจำนวนแถวที่จะ sync ต่อตาราง เทียบกับ row count จริงที่ยืนยันแล้ว (`materials` = 4,369, `materialstores` = 33,384, `material_outsides` = 164 — ทั้งหมด query สดผ่าน tunnel วันนี้) ถ้าตัวเลขต่างจากที่คาดมาก (เช่น ต่างเกิน 5-10%) ให้หยุดตรวจสอบก่อน ไม่รันจริง

ถ้าต้องการทดสอบเฉพาะบางตารางก่อน ใช้ `--tables=` ได้ (script รองรับอยู่แล้ว) เช่น:
```
npx tsx scripts/sync-from-mysql.ts --dry-run --tables=materials,materialRequisitions
```

### Step 4 — รันจริง (เฉพาะหลังยืนยัน dry-run โอเค)
```
npx tsx scripts/sync-from-mysql.ts
```

### Step 5 — Verify หลัง sync
1. **เทียบ row count** ตรงๆ กับ MySQL ต้นทาง (read-only SELECT COUNT(*) ทั้งสองฝั่ง):
   - `materials` ↔ MySQL `materials`
   - `materialrequisitions` ↔ MySQL `materialstores`
   - `material_outsides` ↔ MySQL `material_outsides`
2. **เทียบ field สำคัญ sample** — สุ่ม 10-20 แถวจาก MySQL เทียบ yarnType/supplierName/lot/spool/น้ำหนัก กับแถวเดียวกันใน Postgres (match ด้วย id เดิม เพราะ script ใช้ `id: Number(r.id)` ตรงจาก MySQL อยู่แล้ว ไม่ generate ใหม่)
3. **เช็ค unmatched count** ของ materialId resolve (script print `matched`/`unmatched` อยู่แล้วบรรทัด 434) — บันทึกตัวเลขนี้ไว้เทียบก่อน/หลังแก้ field mapping ว่า unmatched ไม่ได้เพิ่มขึ้นผิดปกติ
4. **ยิง endpoint จริงผ่าน curl** (เหมือนรอบ dry-run merge ก่อนหน้านี้) — `/api/warehouse/material/stock`, `/material/requisition`, `/material/outside` — ดูว่าตัวเลข stock รวมสมเหตุสมผล (เทียบคร่าวๆ กับที่เคยเห็นตอนทดสอบ merge ก่อนหน้า: remainingSpool รวม ~913,034)
5. เช็คว่า `material_returns`/`package_return_obligations`/`package_return_entries` ว่างเปล่า (count = 0) ตามคาด เพราะไม่มีทาง backfill

---

## 6. ย้ำเรื่องความเสี่ยง — MySQL ต้นทางต้องเป็น READ-ONLY เท่านั้น

**ทุกจุดในแผนนี้เชื่อมต่อ MySQL ด้วย `SELECT` เท่านั้น ไม่มีจุดไหนเขียนกลับเข้า MySQL เดิมเลย** — ทั้ง `sync-from-mysql.ts` ปัจจุบัน (อ่านโค้ดยืนยันแล้ว: มีแต่ `db.query('SELECT * FROM ...')` ไม่มี `INSERT`/`UPDATE`/`DELETE` ไปยัง `db` object ของ MySQL เลยสักบรรทัด — เขียนกลับเข้า Postgres (`prisma.*`) เท่านั้น) และแผนแก้ไขที่เสนอในข้อ 4 ก็ไม่เพิ่มการเขียนกลับ MySQL แต่อย่างใด

Laravel ที่ 128.199.238.141 ยังเป็นระบบ production จริงที่ผู้ใช้งานอยู่ — **ห้าม `INSERT`/`UPDATE`/`DELETE`/`ALTER` ใดๆ เข้า MySQL ต้นทางเด็ดขาดตลอดกระบวนการนี้** ถ้าจะเปิด SSH tunnel ตอน execution จริง แนะนำสร้าง MySQL user แยกที่มีสิทธิ์ `SELECT` อย่างเดียวสำหรับงานนี้โดยเฉพาะ (ไม่ใช้ user `astrobot34` ที่อาจมีสิทธิ์เขียนด้วย) เพื่อกันความผิดพลาดทาง code ที่อาจเผลอเขียนกลับในอนาคต

---

## สรุปสิ่งที่ต้องตัดสินใจก่อนเริ่มจริง
1. ~~ยืนยัน column name จริงของ `material_outsides`/`materials`/`materialstores`~~ — **เสร็จแล้วทั้ง 3 ตาราง 2026-08-02** ผ่าน `DESCRIBE` จริงทาง tunnel (read-only) ดูผลเต็มในหัวข้อ 2.3
2. ~~สูตร `withdrawDate`/`importDate`/`createdAt`~~ — **ยืนยันครบแล้วทั้ง 3 ตาราง** (หัวข้อ 3) ไม่มีอะไรค้าง
3. ~~backup local DB ก่อนไหม~~ — **เสร็จแล้ว 2026-08-03**: `backups/ast_new_local_backup_20260803_000208.dump` (2.29MB, 305 TOC entries, ยืนยันด้วย `pg_restore --list` แล้วว่า restore ได้จริง) อยู่คู่กับ production backup เดิม (`ast_new_backup_20260802_154047.dump`)
4. ยืนยันว่ายอมรับได้ที่ `material_returns`/`package_return_obligations`/`package_return_entries` จะกลายเป็น 0 แถวหลัง resync (backfill ไม่ได้เพราะไม่มีต้นทาง MySQL)
5. ตัดสินใจเรื่อง `emp` field ของ `material_outsides` ที่ไม่มีปลายทางใน Postgres — ~~ทิ้งหรือยัดเข้า note/usageNote~~ **ผล diff (หัวข้อ 4) ยืนยันแล้วว่า backfill ครั้งก่อนเลือกยัดเข้า `note` เป็น suffix `[legacy] emp=X, ...` ไปแล้ว — แนะนำใช้ pattern เดียวกันต่อเพื่อความสม่ำเสมอ เว้นแต่ user อยากเปลี่ยน**
6. ตัดสินใจเรื่อง `materialstores.withdrawId` ที่จริงๆ เป็นชื่อพนักงาน ไม่ใช่ unique ID — เก็บตรงๆ (ยอมรับค่าซ้ำ) หรือ generate UUID ใหม่ (ดูหัวข้อ 2.3 ข้อ 3)
7. ~~ตรวจว่าข้อมูล 164 แถวที่มีอยู่แล้วใน Postgres `material_outsides` ตรงกับ MySQL เป๊ะหรือมี drift~~ — **เสร็จแล้ว 2026-08-03 ดูผลเต็มในหัวข้อ 4** สรุป: ไม่มี drift ที่ weight/recipient เลย มีแค่ `note`-suffix (คาดไว้แล้ว) กับ `withdrawDate` ผิดทุกแถว (backfill ก่อนหน้าใช้วันที่รัน sync ไม่ใช่วันจริง — ยืนยันปัญหาที่แผนตั้งใจแก้อยู่แล้ว)
8. ~~pgId=199 (`material_outsides`) เป็นข้อมูลทดสอบหรือรายการจริง~~ — **แก้ไข 2026-08-03: หลัง export ดูเนื้อหาเต็ม (`note`="ทดสอบ", `recipient`="ทดสอบซื้อประจำ") ยืนยันแล้วว่าเป็น test data จริง ไม่ต้องเก็บ ปล่อยให้ TRUNCATE ลบตามปกติ** (เดิมเข้าใจผิดว่าเป็นข้อมูลจริงจาก summary ที่ไม่ได้ print field note/recipient)
9. ~~ตรวจว่ามีแถวแบบเดียวกับ pgId=199 ซ่อนอยู่ใน `materials`/`materialrequisitions` ไหม~~ — **เสร็จแล้ว 2026-08-03 ดูผลเต็มในหัวข้อ 4.1** สรุป: `materials` ไม่มีแถวแบบนี้เลย, `materialrequisitions` มี 1 แถว (`pgId=31781`)
10. ~~pgId=31781 เป็นข้อมูลทดสอบหรือรายการจริง~~ — **ยืนยันแล้ว 2026-08-03: เป็นข้อมูลจริง เก็บไว้ตามแผน 4.2** (export เนื้อหาเต็มแล้ว ไม่มีคำว่า "ทดสอบ"/"test" ใน field ไหนเลย)
11. ~~วางแผนวิธีเก็บรักษา~~ — **final แล้ว ดูหัวข้อ 4.2** สรุปสั้น: export เป็น JSON ก่อน TRUNCATE (Step 0.6), restore หลังรัน sync จริง (Step 4.6) **ห้ามใช้ id=31781 เดิมตอน restore เด็ดขาด** (MySQL มี id นี้เป็นแถวจริงอื่นอยู่แล้ว จะชนกัน) ต้อง auto-generate id ใหม่แทน — FK `materialId=1911` ยืนยันแล้วว่าใช้งานได้หลัง resync
12. **ใหม่ — รอ user ยืนยัน (ไม่บังคับ):** จะเติม suffix ใน `note` เพื่อบอกว่าเป็นแถวที่กู้กลับมาด้วยมือไหม เช่น `[preserved 2026-08-03: original id=31781, not in MySQL source]`
13. **ใหม่ (out of scope รอบนี้ แต่ควรรู้):** `materials.supplierId` ไม่มีปลายทางใน Postgres `Material` model เลย — ถ้าต้องการ FK ไปยัง `suppliers` แทนการ match ด้วยชื่อ string ต้องเพิ่ม schema column ก่อน ไม่ใช่งานของรอบ resync นี้
