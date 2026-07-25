# MaterialOutside — คู่กรณี (ต้นทาง/ปลายทาง) สำหรับ PackageReturnObligation

การสำรวจนี้เป็นการอ่านโค้ด + query ข้อมูลจริงเท่านั้น **ไม่มีการแก้ไฟล์โค้ดหรือ schema ใดๆ**

---

## 1. Field ที่เกี่ยวกับ "ฝ่ายตรงข้าม" ใน `MaterialOutside` model

จาก `prisma/schema.prisma` (บรรทัด 472-508):

| Field | ประเภท | ความหมายจาก comment/context ในโค้ด |
|---|---|---|
| `supplierName` | `String?` | ไม่มี comment ในบรรทัดนี้ แต่ดูจากตำแหน่ง/ชื่อฟิลด์และ query จริง (ข้อ 2) → เป็นค่าที่ **copy มาจาก `Material.supplierName` ของวัตถุดิบต้นทาง** ไม่ใช่ลูกค้าปลายทาง |
| `materialId` / `material` | `Int?` / relation | FK ไปยัง `Material` ตัวที่ถูกเบิกออก — คือ "ต้นทาง" ตัวจริง (nullable เพราะ auto-resolve ไม่เจอบางกรณี ดูข้อ 2) |
| `recipient` | `String?` | ไม่มี comment เช่นกัน แต่ label ใน UI (`MaterialOutsideForm.tsx` บรรทัด 595) คือ **"ผู้รับวัตถุดิบ"** — ช่อง free-text เดียว ไม่มี autocomplete ไม่มี FK |
| `usageNote` | `String?` | label UI: "การนำไปใช้" — free text อธิบายวัตถุประสงค์การเบิก ไม่ใช่คู่กรณี |
| `paymentComment` | `String?` | label UI: "หมายเหตุการเงิน" — ไม่เกี่ยวกับคู่กรณีโดยตรง |

**สรุปข้อ 1:** มีแค่ 2 field ที่เกี่ยวกับ "ฝ่าย": `supplierName` (ต้นทาง, denormalized) และ `recipient` (ปลายทาง, free text ล้วนๆ ไม่มี field คู่ เช่น `recipientTax`/`recipientId`)

---

## 2. ข้อมูลจริงจาก `material_outsides` (query ตรง Postgres, 164 แถวทั้งหมด, sample 20 ล่าสุด)

**`supplierName` ของ MaterialOutside เทียบกับ `supplierName` ของ Material ต้นทาง (materialId):**

```
matches: 141 / mismatches: 0 / total (materialId ไม่ null): 141
```

→ **ตรงกัน 100%** ทุกแถวที่มี `materialId` ยืนยันชัดว่า `MaterialOutside.supplierName` คือค่าที่ copy มาจาก `Material.supplierName` (ต้นทาง) ไม่ใช่ลูกค้าปลายทางแน่นอน ตรงกับสมมติฐานที่ user ยืนยันมา

**`recipient`** — ตัวอย่างค่าจริง:
```
บริษัท รุ่งโรจน์การทอ (วิชิต)         ×74
บริษัท เอสแอลการทอ (คุณณัฐวรรณ)       ×15
บริษัท ตั้งง่วนเฮง (มณีนุช)            ×8
บริษัท รุ่งโรจน์การทอ (ทองสุข)         ×7
บริษัท เอสแอลการทอ (คุณเมืองมนต์)      ×7
...
```
รูปแบบคือ **"ชื่อโรงงาน (ชื่อผู้ติดต่อ)"** — เป็นชื่อ**โรงงานทอผ้ารับจ้าง** ไม่ใช่ชื่อคนล้วนๆ และไม่ใช่ชื่อลูกค้าซื้อผ้าสำเร็จ (ดูข้อ 3)

**⚠️ พบปัญหาข้อมูลกระจาย (data fragmentation)** จากการเป็น free text ล้วน ไม่มี autocomplete — ชื่อเดียวกันสะกดต่างกันหลายแบบ เช่น:
- `บริษัท รุ่งโรจน์การทอ (วิชิต)` (74 ครั้ง) vs `รุ่งโรจน์การทอ (วิชิต)` (3 ครั้ง, ไม่มีคำว่า "บริษัท")
- `บริษัท สิ่งทอรุ่งเรือง (เหมือน)` (3) vs `บริษัทสิ่งทอรุ่งเรือง (เหมือน)` (3, ไม่มีวรรค) vs `สิ่งทอรุ่งเรือง (เหมือน)` (1)

รวมมี **43 ค่าที่ไม่ซ้ำกัน (distinct)** จากทั้งหมด 164 แถว ซึ่งในทางปฏิบัติน่าจะเป็นโรงงานทอจริงน้อยกว่านั้น (ซ้ำซ้อนเพราะสะกดต่างกัน)

**อีกจุดที่ควรรู้:** `materialId IS NULL` มี **23 จาก 164 แถว (~14%)** — คือมีรายการเบิกที่ auto-resolve หา Material ต้นทางไม่เจอ (ดู logic ใน `outside/route.ts` บรรทัด 52-64: ค้นจาก yarnType+supplierName+lot แบบ exact match — ถ้าค่าพิมพ์ไม่ตรงกับตอนนำเข้าเป๊ะ จะหาไม่เจอ) หมายความว่า obligation ฝั่งต้นทางที่อิง `materialId` จะไม่มี source link ให้ ~14% ของเคส

---

## 3. Entity "ลูกค้า" ที่มีอยู่แล้วในระบบ

มี **`model Customer`** จริง (schema.prisma บรรทัด 55-69):
```prisma
model Customer {
  id, name, tax, address, tel, email, type, coor, createdAt, updatedAt, deletedAt
  @@map("customers")
}
```
มีข้อมูลจริง **210 แถว** ในตาราง `customers`

**แต่ Customer model ไม่มี relation (FK) ไปที่ไหนในระบบเลย** (grep ทั้ง schema หา `Customer @relation`, `customerId` → ไม่พบ) ทุกที่ที่เกี่ยวกับลูกค้า (`AstPurchaseOrder.customerName`, `FabricOut.customerName`, `AstBillOfStructure.customerName` ฯลฯ) เป็น **`String?` ล้วนๆ**

ตรวจ `sales/orders/create/page.tsx` (สร้าง SalesOrder):
- มี state `customerName` (string) + autocomplete ผ่าน `/api/sales/autocomplete/customers` ซึ่ง query `prisma.customer.findMany(...)` จริง (ดึงชื่อจากตาราง `customers` มา suggest)
- แต่ตอน submit ส่งแค่ `customerName` (string) ไป API → บันทึกลง `AstPurchaseOrder.customerName` เป็น string เท่านั้น **ไม่มีการเก็บ `customerId`** เลย

**ทดสอบ overlap:** เทียบ `MaterialOutside.recipient` (43 ค่า distinct) กับ `customers.name` → **ตรงกันแบบ exact match = 0 รายการ** ยืนยันว่าฐานข้อมูลลูกค้าที่ใช้ในโมดูล sales (ผู้ซื้อผ้าสำเร็จ, ชื่อจดทะเบียน + เลขภาษี เช่น "บริษัท กิจอินเตอร์ เท็กซ์ไทล์ จำกัด (สำนักงานใหญ่)") **เป็นคนละกลุ่มกับ "โรงงานทอรับจ้าง" ที่ปรากฏใน `recipient`** (ชื่อโรงงาน+ชื่อผู้ติดต่อ เช่น "บริษัท รุ่งโรจน์การทอ (วิชิต)") — คนละ business entity กัน แม้ schema ของ Customer model จะรองรับได้ (name/tax/tel) ก็ตาม

---

## 4. สรุปช่องว่างที่ต้องตัดสินใจ

ไม่มี entity ไหนในระบบที่ตรงกับ "โรงงานทอรับจ้างที่รับวัตถุดิบไปทอ" โดยตรง มี 3 ทางเลือกเชิงสถาปัตยกรรม (เป็น business decision ที่ user ต้องเลือก ไม่ใช่สิ่งที่ควรเดา):

1. **ใช้ `recipient` string เดิมต่อไป + เพิ่ม autocomplete จากประวัติ** (pattern เดียวกับ `supplierName`/`yarnType`/`lot` ที่ `MaterialOutsideForm` ใช้อยู่แล้ว — ดูข้อ 5) เร็วสุด ไม่ต้อง schema migration แต่ปัญหาข้อมูลกระจาย (ข้อ 2) จะไม่ถูกแก้ ถ้า obligation ผูกกับ string `recipient` ตรงๆ การนับยอดค้างคืนต่อโรงงานอาจแยกเป็นหลาย record เพราะสะกดไม่ตรงกัน
2. **สร้าง entity ใหม่ (เช่น `WeavingFactory`/`Subcontractor`)** แยกจาก `Customer` เพราะข้อมูลจริง (ข้อ 3) ชี้ว่าเป็นคนละกลุ่มธุรกิจกัน แล้วทำ FK `MaterialOutside.recipientId` — ทำข้อมูลสะอาดสุด แต่ต้อง migrate schema + เขียน UI จัดการ master data ใหม่ทั้งหมด
3. **Reuse `Customer` model** (เพิ่ม FK `recipientId → Customer`) — ใช้โครงสร้างที่มีอยู่แล้ว (name/tax/address/tel) แต่จะผสมข้อมูล "ลูกค้าซื้อผ้า" กับ "โรงงานทอรับจ้าง" ไว้ในตารางเดียว ซึ่งขัดกับข้อเท็จจริงที่พบว่าปัจจุบันเป็นคนละกลุ่มกัน (overlap = 0)

ไม่มี "field ที่ยังไม่ได้ใช้" รออยู่แล้วสำหรับกรณีนี้ — `MaterialOutside.recipient` เป็น field เดียวที่มี และเป็น free-text ล้วน (ต่างจาก `pallet`/`box`/`sack`/`paperBar` ที่เป็น dead column รอ wiring ที่พบในรอบก่อน field `recipient` นี้มีการใช้งาน/กรอกจริงอยู่แล้ว เพียงแต่ไม่มี normalization)

---

## 5. Pattern autocomplete ที่มีอยู่แล้วในระบบ — มี 2 แบบคนละ pattern

**Pattern A — "distinct value จากตารางข้อมูลเอง" (ใช้ใน MaterialOutsideForm เอง อยู่แล้ว)**
`MaterialOutsideForm.tsx` มี `AutocompleteInput` component ใช้กับ `supplierName`, `yarnType`, `lot` โดย fetch จาก:
- `/api/warehouse/material/suppliers?q=...` → `prisma.material.findMany({ distinct: ['supplierName'], where: { supplierName: { contains: q } } })`
- คล้ายกันสำหรับ `/yarn-types`, `/lots`

ไม่มี master table แยก — ดึง **ค่า distinct จากประวัติ record จริง** (ในที่นี้คือตาราง `materials`) มา suggest ตรงๆ ไม่ normalize ไม่มี id

**Pattern B — "master table + FK-like แต่บันทึกเป็น string" (ใช้ใน sales/orders)**
`sales/orders/create/page.tsx` ใช้ `/api/sales/autocomplete/customers` ที่ query จาก **master table `customers`** จริง (ไม่ใช่ distinct จาก order history) แต่สุดท้ายก็ save เป็น `customerName` string เหมือนเดิม ไม่ได้ผูก FK

**สรุปข้อ 5:** ถ้าจะเพิ่ม autocomplete ให้ `recipient` มี pattern พร้อมใช้ตรงตัวอยู่แล้วคือ **Pattern A** — เพิ่ม endpoint แบบ `/api/warehouse/material/recipients` ที่ทำ `prisma.materialOutside.findMany({ distinct: ['recipient'], ... })` แล้ว wire เข้า `AutocompleteInput` ที่มีอยู่แล้วใน `MaterialOutsideForm.tsx` (ตอนนี้ field `recipient` เป็น plain `<input>` ธรรมดา ไม่ใช้ `AutocompleteInput` เลย) — วิธีนี้ตรงไปตรงมาที่สุดและสอดคล้อง pattern เดิมในฟอร์มเดียวกัน แต่ **จะไม่แก้ปัญหาข้อมูลสะกดกระจาย** (ข้อ 2) เพราะ suggest จาก string ที่สะกดต่างกันอยู่แล้ว ต้อง normalize เพิ่มถ้าต้องการให้สะอาดจริง (เช่น trim + คง canonical list แยก)

---

## ไฟล์ที่เกี่ยวข้อง (สำหรับ reference ตอน implement)
- `prisma/schema.prisma` — `MaterialOutside` (L472-508), `Customer` (L55-69), `PackageReturnObligation` (L741-778)
- `src/app/(dashboard)/warehouse/material/outside/MaterialOutsideForm.tsx` — field `recipient` (plain input, L595-600), `AutocompleteInput` component (L107-153)
- `src/app/api/warehouse/material/outside/route.ts` — POST handler, auto-resolve `materialId` จาก supplierName+yarnType+lot (L52-64)
- `src/app/api/warehouse/material/suppliers/route.ts` — ตัวอย่าง Pattern A ที่ใช้ทำซ้ำได้
- `src/app/api/sales/autocomplete/customers/route.ts` — ตัวอย่าง Pattern B
- `src/app/(dashboard)/sales/orders/create/page.tsx` — การใช้ Pattern B จริง (L486-490, 578-590)
