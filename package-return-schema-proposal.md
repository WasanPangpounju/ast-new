# Schema Proposal: คืนบรรจุภัณฑ์ให้ซัพพลายเออร์ (ast-new)

> อ้างอิงจาก `package-return-legacy-review.md` (สำรวจระบบ Laravel เดิม) + การตรวจสอบ `prisma/schema.prisma` และโค้ดฟอร์ม/API จริงของ ast-new ณ วันที่เขียนเอกสารนี้
> ยังไม่มีการแก้ไฟล์จริง / ยังไม่สร้าง migration — เอกสารนี้เป็น proposal ให้พิจารณาเท่านั้น

---

## 0. ผลการเช็คก่อนออกแบบ (ตามที่ขอ)

### 0.1 มีตาราง Supplier จริงหรือยัง?

**มีแล้ว** — `model Supplier` (`prisma/schema.prisma:72`) เป็น master data จริง มี `id` เป็น PK และมี **FK จริงผูกอยู่แล้ว 2 จุด**:

| Model | field | nullable? |
|---|---|---|
| `Package` (บรรจุภัณฑ์ฝั่งนำเข้า, ย้ายมาจาก MySQL เดิมตรงๆ) | `supplierId Int?` | nullable (ข้อมูลเก่าจาก MySQL ไม่มี FK จริง จึงเป็น null เป็นส่วนใหญ่) |
| `FabricReturn` (คืนผ้าให้ซัพพลายเออร์ — ฟีเจอร์ analogous ที่สุดในระบบ) | `supplierId Int` | **required**, ผูก dropdown เลือก supplier จริงตอน POST (`src/app/api/warehouse/returns/route.ts:65` validate `if (!supplierId) return error`) |

→ **ข้อสรุป: ทางเลือก A ถูกเลือกไว้แล้วโดยพฤตินัย** ไม่ต้องถามต่อ เพราะเข้าเงื่อนไขที่ตกลงกันไว้ว่าถ้ามีตาราง Supplier จริงแล้วให้ดำเนินการเลย ฟีเจอร์คืนบรรจุภัณฑ์นี้จะ **ผูก `supplierId` เป็น FK จริงไปที่ `Supplier` ตั้งแต่ต้น** เหมือน `FabricReturn`

`Material`/`MaterialOutside` **ยังคงเป็น `supplierName String` เหมือนเดิม ไม่แตะ** (ตรง scope แคบของทางเลือก A) — autocomplete supplier ของฟอร์มนำเข้าปัจจุบัน (`/api/warehouse/material/suppliers`) ก็ยัง query `distinct supplierName` จากตาราง `materials` เอง ไม่ได้ผูกกับ `Supplier` master เลย เป็นช่องว่างที่รู้อยู่แต่อยู่นอก scope งานนี้

**ผลที่ตามมา:** ฟีเจอร์คืนบรรจุภัณฑ์ต้องมี **supplier picker แยกต่างหาก** (dropdown ผูกกับ `Supplier` จริง ไม่ใช่ free-text field เดิม) อยู่ในส่วน "ส่งคืนบรรจุภัณฑ์" ของฟอร์ม เพราะ `Material.supplierName`/`MaterialOutside.supplierName` เป็น string ที่ resolve เป็น `supplierId` ตรงๆ ไม่ได้ (ชื่อพิมพ์เพี้ยนได้ ไม่มี unique constraint) — รายละเอียดดูข้อ 3.3

### 0.2 พบ gap เพิ่มเติมที่กระทบการออกแบบโดยตรง (สำคัญ ต้องรู้ก่อนอ่านต่อ)

ตรวจโค้ดฟอร์ม + API จริงแล้วพบว่า **checkbox/field ที่โจทย์อ้างถึงไม่ได้เชื่อมกับ backend เท่ากันทั้ง 2 ฝั่ง**:

| | ฝั่งนำเข้า (`MaterialCreateForm.tsx` → `/api/warehouse/material/entry`) | ฝั่งเบิกภายนอก (`MaterialOutsideForm.tsx` → `/api/warehouse/material/outside`) |
|---|---|---|
| checkbox "ส่งคืนบรรจุภัณฑ์" (returnPallet/Box/Sack/Spool/PaperBar) | มีใน UI (มี comment `// return packaging (UI only)` ในโค้ดเอง ยืนยันชัดว่ารู้ตัวว่ายังไม่ต่อ backend) แต่ **`handleSave()` ไม่ส่งค่าพวกนี้ไปกับ request เลย** (`MaterialCreateForm.tsx:209-228`) — ฟิลด์หายไปเงียบๆ | **ส่งและถูกบันทึกจริง** เป็น `Boolean @default(false)` ในตาราง `material_outsides` (5 คอลัมน์ `returnPallet…returnPaperBar`) — แต่ปัจจุบัน**ไม่มีอะไรอ่านค่านี้ไปทำงานต่อ** (ไม่มี obligation ใดถูกสร้าง) |
| จำนวนที่ต้อง "คืนได้เท่าไหร่" ต่อชนิด (pallet/box/sack/paperBar) | `Material` มีคอลัมน์ `pallet`/`box`/`sack` (Int?) แต่**ไม่มีคอลัมน์ `paperBar`** เลย (ฟอร์มมี input แต่เป็น UI-only เหมือนกัน) | **`MaterialOutside` ไม่มีคอลัมน์จำนวน pallet/box/sack/paperBar เลยสักตัว** มีแต่ boolean "ต้องคืนไหม" ไม่มี "เบิกไปกี่ชิ้น" — คำนวณยอดค้างคืนไม่ได้จนกว่าจะเพิ่ม field เหล่านี้ |
| ชนิดย่อย (palletType wood/steel, sackType p/plastic, spoolType 4 แบบ) | มีใน UI เท่านั้น ไม่ถูกส่ง/บันทึกที่ไหนเลยทั้งคู่ | (ไม่มี selector ชนิดย่อยในฟอร์มฝั่งนี้เลย) |

→ นี่ตรงกับสิ่งที่ระบบเดิมเป็นเป๊ะ (นำเข้า = ครึ่งเดียวใช้งานได้, เบิกภายนอก = เขียนแล้วไม่มีที่อ่าน) เพียงแต่ในระบบเดิม field พวกนี้ "เขียนลง DB จริงแต่ไม่มี UI อ่าน" ส่วนใน ast-new field พวกนี้ "อยู่ใน UI แต่ไม่ถูกเขียนลง DB เลย" — เป็นคนละรูปแบบของปัญหาเดียวกัน (dead wiring)

**เพราะฉะนั้น schema ที่เสนอข้างล่างนี้ ต้องมาพร้อมกับการเพิ่มคอลัมน์เข้า `Material` และ `MaterialOutside` ด้วย** ไม่ใช่แค่สร้างตารางใหม่ — ระบุไว้ชัดในข้อ 2.4

---

## 1. Enum ที่เสนอ

```prisma
/// 5 ชนิดบรรจุภัณฑ์ที่คืนได้ — ตรงกับ checkbox 5 ตัวในฟอร์ม (พาเลท/กล่อง/กระสอบ/หลอด/กระดาษกั้น)
/// ยืนยันจากโค้ดจริง: paperBar = "กระดาษกั้น" (เทียบเท่า `partition` ในระบบเดิม ไม่ใช่ "กรวย/กระบอกกระดาษ")
enum PackagingCategory {
  PALLET
  BOX
  SACK
  SPOOL
  PAPER_BAR
}

/// state เดียว มีความหมายเดียว ไม่ซ้อนทับกับข้อมูลอื่น (แก้ปัญหา package_status ที่ระบบเดิมใช้ 3 ความหมายต่างกันใน 3 ตาราง)
enum PackageReturnStatus {
  PENDING              // ยังไม่คืนเลย
  PARTIALLY_RETURNED   // คืนบางส่วน
  RETURNED             // คืนครบแล้ว
}

/// ต้นทางของยอดค้างคืน — รองรับ 2 ฝั่งตั้งแต่ schema แรกตามที่ขอ
enum PackageReturnSourceType {
  MATERIAL_IMPORT    // เกิดจาก Material (นำเข้าวัตถุดิบ)
  MATERIAL_OUTSIDE   // เกิดจาก MaterialOutside (เบิกวัตถุดิบภายนอก)
}
```

**หมายเหตุ:** โจทย์เดิมเรียก "MaterialImport" — ในโค้ดจริงตอนนี้ฝั่งนำเข้าคือ model ชื่อ `Material` (ไม่มี model ชื่อ `MaterialImport` แยก) เอกสารนี้ใช้ชื่อจริงตามโค้ด (`Material`) เพื่อไม่ให้สับสนตอน implement

---

## 2. Prisma Schema เต็ม

### 2.1 ตารางหลัก — รายการค้างคืน (1 แถวต่อ ซัพพลายเออร์ × ต้นทาง × ชนิดบรรจุภัณฑ์ 1 ครั้ง)

```prisma
model PackageReturnObligation {
  id            Int      @id @default(autoincrement())

  // ── ซัพพลายเออร์: FK จริง ตามข้อ 0.1 ──
  supplierId    Int
  supplier      Supplier @relation(fields: [supplierId], references: [id])

  // ── ชนิดบรรจุภัณฑ์ + ชนิดย่อย ──
  category      PackagingCategory
  /// ชนิดย่อย: wood|steel (PALLET), p|plastic (SACK), spool_plastic|spool_paper|spoolC_plastic|spoolC_paper (SPOOL)
  /// null สำหรับ BOX และ PAPER_BAR (ฟอร์มปัจจุบันไม่มี selector ชนิดย่อยให้ 2 ชนิดนี้)
  variant       String?

  // ── ต้นทาง: รองรับ 2 ฝั่ง — เก็บ FK จริงทั้งคู่ (เลือกใช้ตาม sourceType) ──
  sourceType        PackageReturnSourceType
  materialId         Int?
  material           Material?        @relation(fields: [materialId], references: [id])
  materialOutsideId  Int?
  materialOutside    MaterialOutside? @relation(fields: [materialOutsideId], references: [id])

  // ── ยอด ──
  qtyDue        Int                  // จำนวนที่ต้องคืน ณ ตอนเกิดรายการ — คงที่ ไม่แก้ย้อนหลังหลังสร้าง
  qtyReturned   Int                  @default(0)  // denormalized running total (sync กับ PackageReturnEntry ในทรานแซกชันเดียวกันเสมอ — ดูข้อ 3.2)
  status        PackageReturnStatus  @default(PENDING)

  note          String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?            // soft delete — ไม่มีในระบบเดิมเลยสักตาราง (แก้ edge case #1/#3 ของรายงานเดิม)

  entries       PackageReturnEntry[]

  @@index([supplierId, status])
  @@index([materialId])
  @@index([materialOutsideId])
  @@map("package_return_obligations")
}
```

**เหตุผลเชิงออกแบบที่ต่างจากของเดิม:**
- 1 แถวต่อ **(ต้นทาง × ชนิดบรรจุภัณฑ์)** ไม่ใช่ 1 แถวรวมทุกชนิดต่อการนำเข้า (แบบ `packages`/`packageoutsides` เดิม) — ทำให้ track/validate ยอดคงเหลือแยกต่อชนิดได้ตรงไปตรงมา ไม่ต้องคำนวณ SUM สดข้าม 2-3 ตารางเหมือนเดิม (เทียบข้อ 2.2 ของรายงานเก่า)
- **ไม่สร้างแถวถ้าไม่ติ๊ก checkbox** (ต่างจาก `Packageast` เดิมที่สร้างแถว all-zero เสมอ) — ลด dead row, และแปลว่า "ไม่มีแถว = ไม่มีภาระต้องคืน" อ่านง่ายกว่า
- `materialId`/`materialOutsideId` เป็น **FK จริง** ไปยัง PK integer ของ Postgres (ต่างจากของเดิมที่ `ref_id`/`package_status` เป็น string เทียบเท่า pseudo-FK หรือไม่ผูกเลย) → แก้ edge case #7 ของรายงานเดิม ("การคืนไม่ผูกกับ batch นำเข้าที่ทำให้เกิดยอดค้าง") ได้ตรงๆ

### 2.2 ตารางบันทึกการคืนจริง (1 obligation คืนได้หลายครั้ง บางส่วนได้)

```prisma
model PackageReturnEntry {
  id             Int      @id @default(autoincrement())

  obligationId   Int
  obligation     PackageReturnObligation @relation(fields: [obligationId], references: [id])

  qty            Int       // จำนวนที่คืนจริงครั้งนี้ (> 0 เสมอ — validate ที่ API)
  returnedAt     DateTime  @default(now())
  emp            String?   // ผู้บันทึกการคืน
  note           String?

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime? // soft delete: ยกเลิกรายการคืน = set deletedAt + reverse ผลที่ obligation (ดูข้อ 3.4) แทนการ destroy() ถาวรแบบเดิม

  @@index([obligationId])
  @@map("package_return_entries")
}
```

### 2.3 เพิ่ม back-relation ใน model ที่มีอยู่แล้ว (ไม่ใช่ตารางใหม่ แค่เติม field)

```prisma
model Supplier {
  // ...ของเดิมทั้งหมดคงไว้...
  packageReturnObligations PackageReturnObligation[]   // เพิ่มบรรทัดนี้
}

model Material {
  // ...ของเดิมทั้งหมดคงไว้...
  packageReturnObligations PackageReturnObligation[]   // เพิ่มบรรทัดนี้
}

model MaterialOutside {
  // ...ของเดิมทั้งหมดคงไว้...
  packageReturnObligations PackageReturnObligation[]   // เพิ่มบรรทัดนี้
}
```

### 2.4 ⚠️ คอลัมน์ที่ต้องเพิ่มใน `Material`/`MaterialOutside` (จำเป็น ไม่ใช่ optional) — ตามข้อ 0.2

```prisma
model Material {
  // ...ของเดิมทั้งหมด...
  paperBar Int?   // เพิ่มใหม่ — ฟอร์มมี input นี้อยู่แล้วแต่ปัจจุบันไม่ถูกส่ง/บันทึก (dead UI)
}

model MaterialOutside {
  // ...ของเดิมทั้งหมด...
  pallet   Int?   // เพิ่มใหม่ — ปัจจุบันมีแค่ returnPallet (boolean) ไม่มีจำนวนที่เบิกออกจริง คำนวณ qtyDue ไม่ได้ถ้าไม่มี field นี้
  box      Int?   // เพิ่มใหม่ (เหตุผลเดียวกัน)
  sack     Int?   // เพิ่มใหม่ (เหตุผลเดียวกัน)
  paperBar Int?   // เพิ่มใหม่ (เหตุผลเดียวกัน) — spool ใช้ field `spool` ที่มีอยู่แล้วได้เลย ไม่ต้องเพิ่ม
}
```

ถ้าไม่เพิ่ม 4 คอลัมน์นี้ในฝั่ง `MaterialOutside` ฟีเจอร์คืนบรรจุภัณฑ์ฝั่งเบิกภายนอกจะสร้าง obligation ไม่ได้เลย เพราะไม่รู้ `qtyDue` (มีแต่ boolean "ต้องคืน" ไม่มี "คืนกี่ชิ้น")

---

## 3. Business Logic

### 3.1 สูตรคำนวณยอดค้างคืน

ต่าง**ไปจากของเดิมโดยเจตนา** — ของเดิมคำนวณสด (`SUM(นำเข้า) - SUM(คืนแล้ว)` ข้ามตาราง ไม่ผูก batch) เอกสารนี้เสนอให้ **เก็บยอดไว้ตรงๆ ต่อ obligation แทน**:

```
ยอดค้างคืนคงเหลือ (ต่อ 1 obligation) = qtyDue - qtyReturned
```

- `qtyDue` เซ็ตครั้งเดียวตอนสร้าง obligation ไม่แก้ย้อนหลัง
- `qtyReturned` เป็นค่า denormalized ที่ increment ทุกครั้งที่มี `PackageReturnEntry` ใหม่ (และ decrement เมื่อ soft-delete entry) — sync กันเสมอภายใน DB transaction เดียว ไม่ปล่อยให้ derive จาก SUM สดเหมือนเดิม (เดิมไม่ผูก batch เลยจึงคำนวณสดได้แค่ระดับ supplier รวม)
- ยอดรวมต่อ supplier (ถ้าต้องการโชว์ภาพรวมแบบเดิม) = `SUM(qtyDue - qtyReturned) WHERE supplierId = X AND status != RETURNED` — เป็น query สรุปที่ทำได้ต่อเมื่อต้องใช้ ไม่ใช่ source of truth

### 3.2 Trigger การสร้างยอดค้างคืน — ตอบคำถาม "ตอนติ๊ก checkbox"

**ใช่ — trigger ตอนกด "บันทึก" ในฟอร์มนำเข้า/เบิกภายนอก ไม่ใช่ตอนติ๊ก checkbox เฉยๆ** (ติ๊กแล้วยังไม่ submit ไม่มีอะไรถูกสร้าง) เหมือน pattern ของระบบเดิมทุกประการ เพียงแต่ implement ที่ backend:

**ฝั่งนำเข้า** — ใน `POST /api/warehouse/material/entry` (ต้องแก้ route นี้ให้รับ field ที่ query 0.2 บอกว่ายังไม่ถูกส่งมาด้วย: `returnPallet/Box/Sack/Spool/PaperBar`, `palletType/sackType/spoolType`, `paperBar` จำนวน):

1. สร้าง `Material` ตามเดิม (ทั้งหมดอยู่ใน `prisma.$transaction` เดียว)
2. ถ้ามี checkbox ที่ติ๊ก **และ** เลือก supplier จริง (`supplierId`) มาด้วย → สำหรับแต่ละ checkbox ที่ติ๊กและ `qty > 0`: สร้าง `PackageReturnObligation` 1 แถว (`sourceType: MATERIAL_IMPORT`, `materialId`, `qtyDue` = ค่าจำนวนของชนิดนั้น, `variant` ถ้ามี)
3. ถ้าติ๊ก checkbox แต่ **ไม่ได้เลือก supplier** → **บล็อกการ submit ทั้งฟอร์ม** (validation error) ไม่ใช่ปล่อยให้ save material สำเร็จแต่ไม่มี obligation แบบเงียบๆ

**ฝั่งเบิกภายนอก** — ใน `POST /api/warehouse/material/outside` — โครงสร้างเดียวกันทุกประการ (mirror 1:1 ตามที่ขอ) `sourceType: MATERIAL_OUTSIDE`, `materialOutsideId`

**สิ่งที่ต่างจากเดิม:** ระบบเดิมสร้างแถว "ต้องคืน" เสมอ (แม้ไม่ติ๊กอะไรเลย → all-zero row) และไม่เคย validate ว่าเลือก supplier ถูกต้องหรือไม่ (เพราะไม่มี supplier จริงให้เลือกอยู่แล้ว) — ระบบใหม่สร้างเฉพาะ obligation ที่มีภาระจริง และบังคับ FK ตั้งแต่จุดกำเนิด

### 3.3 Supplier picker แยกจาก field `supplierName` เดิม

เนื่องจาก `Material.supplierName`/`MaterialOutside.supplierName` เป็น free-text (ข้อ 0.1) ฟอร์มทั้ง 2 หน้าในส่วน **"ส่งคืนบรรจุภัณฑ์"** (ส่วนที่มี checkbox 5 ตัว) ต้องมี dropdown/autocomplete เลือก supplier ใหม่แยกต่างหาก ผูกกับ `Supplier.id` จริง (คอมโพเนนต์เดียวกับที่ `FabricReturn` ใช้อยู่แล้วได้เลย นำมาใช้ซ้ำ) — ไม่ผูกอัตโนมัติกับ `supplierName` string ที่กรอกด้านบนฟอร์ม เพื่อกันปัญหาพิมพ์เพี้ยนแล้วจับคู่ผิด/ไม่เจอ

*(ทางเลือกสำรอง ถ้าต้องการลด friction ผู้ใช้: auto-suggest จาก exact-match `Supplier.name` กับ `supplierName` ที่กรอกไว้ แล้วให้ผู้ใช้ยืนยัน/แก้ ก่อน submit — เป็นทางเลือก UX ไม่กระทบ schema)*

### 3.4 Validation กันคืนเกิน (แก้ edge case #2 ของรายงานเดิม)

ที่ `POST /api/warehouse/package-returns/[obligationId]/entries` (endpoint ใหม่):

```
BEGIN TRANSACTION (serializable หรือ row lock ผ่าน SELECT ... FOR UPDATE ด้วย $queryRaw — Prisma ORM ปกติไม่ lock แถวให้อัตโนมัติ ต้องระบุเอง กันกรณี 2 request คืนพร้อมกัน race กันได้)
  obligation = SELECT ... WHERE id = :obligationId FOR UPDATE
  remaining = obligation.qtyDue - obligation.qtyReturned
  IF entry.qty <= 0            → 400 "จำนวนต้องมากกว่า 0"
  IF entry.qty > remaining     → 400 "คืนเกินยอดค้าง (เหลือคืนได้อีก {remaining})"
  INSERT PackageReturnEntry
  UPDATE obligation SET
    qtyReturned = qtyReturned + entry.qty,
    status = CASE
      WHEN qtyReturned + entry.qty >= qtyDue THEN RETURNED
      WHEN qtyReturned + entry.qty > 0       THEN PARTIALLY_RETURNED
      ELSE PENDING
    END
COMMIT
```

ยกเลิกการคืน (soft-delete entry) ทำย้อนกลับในทรานแซกชันเดียวกัน: `qtyReturned -= entry.qty`, คำนวณ `status` ใหม่, ตั้ง `entry.deletedAt` (ไม่ hard delete)

### 3.5 การยกเลิกรายการนำเข้า/เบิกภายนอกต้นทาง (แก้ edge case #4 — พฤติกรรมไม่สมมาตรของเดิม)

กติกาเดียวกันทั้ง 2 ฝั่ง (ต่างจากเดิมที่ import-side orphan แต่ outside-side cascade-delete):
- ถ้า `Material`/`MaterialOutside` ถูก soft-delete และ obligation ที่เกิดจากมัน **ยังไม่มีการคืนเลย** (`qtyReturned == 0`) → soft-delete obligation ตามไปด้วยอัตโนมัติ (ปลอดภัย ไม่มีประวัติการคืนจะหาย)
- ถ้า obligation นั้น **มีการคืนไปแล้วบางส่วน/ครบแล้ว** → **ห้าม auto-cascade** ต้องคงไว้ + แจ้งเตือนให้ผู้ใช้จัดการเอง (เพราะมีประวัติการคืนจริงผูกอยู่ ลบไม่ได้เงียบๆ)

---

## 4. Mapping กับ checkbox 5 ตัวที่มีอยู่แล้ว

| Checkbox/field ปัจจุบัน | อยู่ที่ไหน | บทบาทใหม่ |
|---|---|---|
| `returnPallet`, `returnBox`, `returnSack`, `returnSpool`, `returnPaperBar` (boolean) | `MaterialCreateForm.tsx` (UI only, ยังไม่ส่ง API) + `MaterialOutsideForm.tsx`/`material_outsides` table (ส่งและบันทึกจริงแล้ว) | **ยังคงเป็น trigger เดิม** — ใช้เป็น "flag บอกว่าติ๊กอะไรบ้างตอน submit" เพื่อ decide ว่าจะสร้าง `PackageReturnObligation` กี่แถว ชนิดไหนบ้าง (ตามข้อ 3.2) ไม่ต้อง schema migration ของ boolean เหล่านี้ — ใช้ตามที่มีอยู่ต่อได้เลยฝั่ง outside, ฝั่ง import แค่ต้องแก้ route ให้รับค่าที่ฟอร์มส่งมาจริง |
| `palletType` (wood/steel), `sackType` (p/plastic), `spoolType` (4 แบบ) | `MaterialCreateForm.tsx` เท่านั้น (UI only) | ย้ายไปเก็บที่ `PackageReturnObligation.variant` แทน (ไม่เก็บซ้ำใน `Material`/`MaterialOutside` เพราะมีความหมายเฉพาะตอนเกิดภาระคืน ไม่ใช่ attribute ของการนำเข้า/เบิกเอง) — ต้องเพิ่ม field เดียวกันนี้ในฟอร์มฝั่งเบิกภายนอกด้วยถ้าต้องการ variant granularity เท่ากัน (ปัจจุบันฝั่งเบิกภายนอกไม่มี selector ชนิดย่อยเลย เป็น gap เพิ่มเติมนอกเหนือจาก 5 checkbox หลัก — ไม่ block การออกแบบนี้ แต่ควรรู้ไว้)|
| จำนวน `pallet`/`box`/`sack` (Material, มีอยู่แล้ว), `paperBar` (Material, **ต้องเพิ่มใหม่**), `pallet`/`box`/`sack`/`paperBar` (MaterialOutside, **ต้องเพิ่มใหม่ทั้ง 4**) | ดูข้อ 2.4 | ใช้เป็นค่า `qtyDue` ตอนสร้าง obligation (เฉพาะชนิดที่ checkbox ติ๊ก) |

**ไม่มี field ไหนถูก "แทนที่" ทิ้ง** — ตารางเดิม (`Material.pallet/box/sack`, `MaterialOutside.returnX`) ยังทำหน้าที่เดิม (บันทึกข้อมูลการนำเข้า/เบิก) schema ใหม่ (`PackageReturnObligation`/`PackageReturnEntry`) เป็นชั้นที่ **ต่อยอด** จากตอน submit เท่านั้น ไม่ใช่ normalize ทิ้งของเดิม

---

## 5. สรุปสิ่งที่ต้องทำ (ไม่รวมใน scope เอกสารนี้ แต่ list ไว้ให้เห็นภาพรวมก่อนตัดสินใจ)

1. เพิ่ม enum 3 ตัว + model 2 ตัวใหม่ (`PackageReturnObligation`, `PackageReturnEntry`) — ข้อ 1-2
2. เพิ่ม back-relation ใน `Supplier`/`Material`/`MaterialOutside` — ข้อ 2.3
3. เพิ่มคอลัมน์ `paperBar` ใน `Material`, และ `pallet`/`box`/`sack`/`paperBar` ใน `MaterialOutside` — ข้อ 2.4 (**breaking ต่อฝั่งเบิกภายนอกถ้าไม่ทำ ฟีเจอร์นี้ใช้งานไม่ได้เลย**)
4. แก้ `POST /api/warehouse/material/entry` ให้รับและส่งต่อ field ที่ฟอร์มมีอยู่แล้วแต่ยังไม่ส่ง (`returnPallet…`, `palletType…`, `paperBar`)
5. เพิ่ม supplier picker (ผูก `Supplier.id`) ในส่วน "ส่งคืนบรรจุภัณฑ์" ของทั้ง 2 ฟอร์ม — ใช้คอมโพเนนต์เดียวกับที่ `FabricReturn` ใช้ได้
6. สร้าง endpoint ใหม่: list ยอดค้างคืนต่อ supplier, `POST .../entries` (บันทึกคืนจริง + validate ข้อ 3.4), soft-delete entry (ข้อ 3.4)
7. (ไม่บังคับ) migrate ข้อมูลเก่าจาก `packages`/`packageoutsides`/`packageasts`/`astpackageoutsides`/`htrpackages` (5 ตาราง legacy ที่มีอยู่แล้วใน schema ปัจจุบัน แต่ query 0 ที่จริงไม่มีที่ไหนใช้เลยนอกจาก type ที่ generate ไว้) เข้า obligation/entry ใหม่ — ต้องมีขั้นตอน resolve `supplier_name` string → `Supplier.id` จริงก่อน (fuzzy/manual match เพราะไม่มี unique constraint ชื่อ) รวมถึงข้อมูล `packageoutsides`/`astpackageoutsides` (152/294 แถว) ที่ไม่เคยมี UI แสดงเลยในระบบเดิม
