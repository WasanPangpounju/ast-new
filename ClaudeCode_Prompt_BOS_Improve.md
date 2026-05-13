# Claude Code — ปรับปรุงระบบ 💾 ใบสั่งขาย + 🏭 ใบโครงสร้าง

## ขั้นตอนแรก: อ่านโค้ดที่มีอยู่ก่อนทำงาน (ห้ามข้าม)

```bash
# 1. ดู schema Prisma ทั้งหมด
cat prisma/schema.prisma

# 2. ดูหน้า create SO (UI หลัก)
cat src/app/\(dashboard\)/sales/orders/create/page.tsx

# 3. ดู API routes ที่มีอยู่
cat src/app/api/sales/orders/route.ts
cat src/app/api/sales/orders/next-no/route.ts

# 4. ดูว่ามีไฟล์ bill-of-structure หรือ structure อะไรบ้างแล้ว
find src -type f -name "*.tsx" -o -name "*.ts" | grep -iE "struct|bos|bill" | sort
find src/app/api -type f | sort

# 5. ดู components ที่ใช้ใน create page
grep -E "^import" src/app/\(dashboard\)/sales/orders/create/page.tsx | head -30

# 6. ดูว่า edit page มีอยู่แล้วหรือยัง
find src/app -type d | grep -i "order" | sort
ls src/app/\(dashboard\)/sales/orders/ 2>/dev/null
```

จากที่อ่านได้ทั้งหมด ให้รายงาน:
- Prisma model ที่เกี่ยวข้องมีชื่อว่าอะไร (เช่น `astPurchaseOrder`)
- มี model สำหรับ bill_of_structure อยู่แล้วหรือยัง
- หน้า edit SO มีอยู่แล้วหรือยัง
- API route ที่มีอยู่แล้วมีอะไรบ้าง

**อย่าเขียนโค้ดใดๆ จนกว่าจะอ่านครบและรายงานผลแล้ว**

---

## Context ของระบบ (อ่านให้เข้าใจก่อน)

### Stack จริงของโปรเจกต์
- Next.js App Router
- Prisma ORM — model หลักชื่อ `astPurchaseOrder`
- Field สำคัญ: `purchaseOrder` (เลข SO), `vat` (SO / SOX / SOB), `billNo`
- Custom components: `<Input>`, `<Label>` (ใช้ตามแบบที่มีใน create page)
- Path หลัก: `src/app/(dashboard)/sales/orders/create/page.tsx`
- API หลัก: `src/app/api/sales/orders/`

### Logic VAT และเลขที่ (ที่แก้ไปแล้ว — ห้ามแตะ)
- SO และ SOX → prefix `SO` + ปี พ.ศ. 2 หลัก + เดือน + `/` + ลำดับ (เช่น `SO6906/1`)
- SOB → prefix `SOB` + ปี พ.ศ. 2 หลัก + เดือน + `/` + ลำดับ (เช่น `SOB6906/1`)
- SO และ SOX นับ sequence เดียวกัน
- ไม่มี zero-padding (ใช้ `/1` ไม่ใช่ `/01`)
- `billNo` = count ทุก order ที่ไม่ถูก soft delete + 1 (read-only)
- `orderNo` / `purchaseOrder` = เลขที่ SO format — แก้ไขได้

---

## งานที่ต้องทำ

### พฤติกรรมที่ต้องการ

**ปุ่ม 💾 ใบสั่งขาย:**
1. Validate form
2. บันทึก SO ลง `astPurchaseOrder` (หรือ model ที่มีอยู่จริง)
3. ตรวจสอบว่ามี record ใบโครงสร้างที่ `purchaseOrder` นี้อยู่แล้วหรือไม่
   - ยังไม่มี → สร้างใหม่โดย copy ข้อมูลทุก field จาก SO ที่เพิ่งบันทึก
   - มีแล้ว → ไม่แตะ (ห้าม overwrite)
4. แสดง toast "บันทึกสำเร็จ" — อยู่หน้าเดิม

**ปุ่ม 🏭 ใบโครงสร้าง:**
1. Validate form
2. บันทึก SO ก่อน (เหมือนปุ่ม 💾)
3. ดึงข้อมูล record ใบโครงสร้างที่ `purchaseOrder` เดียวกัน
   - ยังไม่มี → สร้างจาก SO แล้วดึงมา
   - มีแล้ว → ดึงข้อมูล record นั้นมา (ไม่ sync ไม่ overwrite)
4. **เปิดฟอร์มใบโครงสร้าง** โดย:
   - UI เหมือน create page ทุกอย่าง (ใช้ component/layout เดิม)
   - Pre-fill ข้อมูลจาก **ใบโครงสร้าง record** (ไม่ใช่จาก SO โดยตรง)
   - Title/Header แสดง "🏭 ใบโครงสร้าง"
   - กด save → บันทึก **ใบโครงสร้าง record** (ไม่กระทบ SO)

**กฎสำคัญ:**
- SO และ ใบโครงสร้าง ใช้ `purchaseOrder` เดียวกันเป็น key
- หลังสร้างแล้ว แก้ SO ไม่กระทบใบโครงสร้าง และกลับกัน
- ทุก operation ที่แตะ 2 table ต้องใช้ Prisma `$transaction`

---

## สิ่งที่ต้องสร้าง/แก้ไข

### 1. Prisma Schema

ถ้ายังไม่มี model สำหรับใบโครงสร้าง ให้เพิ่ม model ใหม่ โดย:
- ดู field ทั้งหมดของ `astPurchaseOrder` ก่อน
- สร้าง model ใหม่ที่มี field เดียวกัน (copy structure)
- เพิ่ม field `sourceOrderId` หรือ `purchaseOrder` เพื่อ link กลับ SO
- ตั้งชื่อ model ให้สอดคล้องกับ naming convention ของ project (เช่น `astBillOfStructure`)
- รัน `npx prisma migrate dev --name add_bill_of_structure`

### 2. API Routes

**สร้างหรือแก้ไข** `src/app/api/sales/orders/route.ts` (POST handler):

```typescript
// POST /api/sales/orders
// body: { ...soData, createStructure?: boolean }
// 1. บันทึก SO
// 2. ถ้า createStructure === true → upsert ใบโครงสร้าง (insert ครั้งแรกเท่านั้น)
// 3. return { salesOrder, billOfStructure, bosCreated }
```

**สร้างใหม่** `src/app/api/sales/orders/[id]/open-structure/route.ts`:

```typescript
// POST /api/sales/orders/[id]/open-structure
// body: { ...soData }
// 1. อัปเดต SO
// 2. ดึงหรือสร้าง ใบโครงสร้าง record
// 3. return { salesOrder, billOfStructure }
```

**สร้างใหม่** `src/app/api/bill-of-structures/route.ts` และ `[id]/route.ts`:
```typescript
// GET    /api/bill-of-structures?purchaseOrder=SO6906/1
// POST   /api/bill-of-structures   → สร้าง
// PUT    /api/bill-of-structures/[id] → อัปเดต (ใช้ตอนกด save ในฟอร์ม 🏭)
// DELETE /api/bill-of-structures/[id] → soft delete
```

### 3. หน้าฟอร์มใบโครงสร้าง

สร้างไฟล์ใหม่: `src/app/(dashboard)/sales/orders/[id]/structure/page.tsx`

**แนวทาง:** คัดลอก layout และ component จาก `create/page.tsx` เป็น base แล้วปรับ:

```
สิ่งที่ต้องเปลี่ยน:
- Title: "🏭 ใบโครงสร้าง — {purchaseOrder}"
- ดึงข้อมูล billOfStructure จาก API แทน SO
- ปุ่ม action:
    [💾 บันทึกใบโครงสร้าง]   → PUT /api/bill-of-structures/[id]
    [← กลับใบสั่งขาย]         → router.back()
- ไม่มีปุ่ม 🏭 ใบโครงสร้าง (เพราะอยู่ในหน้านี้แล้ว)

สิ่งที่เหมือนเดิมทั้งหมด:
- Layout, Input, Label components
- ตารางรายการสินค้า
- การคำนวณ VAT / ยอดรวม
- Validation logic
```

### 4. แก้ไข create/page.tsx — เพิ่มปุ่ม 🏭

เพิ่มปุ่ม 🏭 ในส่วน action buttons (ตรงที่มีปุ่ม 💾 อยู่แล้ว):

```typescript
// ปุ่ม 💾 (เดิม) — แก้ให้ส่ง createStructure: true ด้วย
const handleSave = async () => {
  // ... validate ...
  const res = await fetch('/api/sales/orders', {
    method: 'POST',
    body: JSON.stringify({ ...formData, createStructure: true })
  })
  // ... toast success ...
}

// ปุ่ม 🏭 (ใหม่)
const handleOpenStructure = async () => {
  // 1. validate form
  // 2. บันทึก SO ก่อน
  const soRes = await fetch('/api/sales/orders', { method: 'POST', body: JSON.stringify(formData) })
  const { salesOrder } = await soRes.json()
  // 3. เรียก open-structure
  const res = await fetch(`/api/sales/orders/${salesOrder.id}/open-structure`, { method: 'POST' })
  const { billOfStructure } = await res.json()
  // 4. navigate ไปหน้าใบโครงสร้าง
  router.push(`/sales/orders/${salesOrder.id}/structure`)
}
```

ปุ่มใน JSX — วางต่อจากปุ่ม 💾:
```tsx
<button onClick={handleSave} className="...existing save button classes...">
  💾 ใบสั่งขาย
</button>
<button onClick={handleOpenStructure} className="...same style as save button...">
  🏭 ใบโครงสร้าง
</button>
```

---

## ข้อกำหนดเพิ่มเติม

1. **ใช้ UI แบบเดิมทั้งหมด** — ห้ามเปลี่ยน className, layout, หรือ component ที่มีอยู่แล้วใน create page
2. **ดู classNames จริงจาก create/page.tsx** ก่อน copy ไปใช้ในหน้าใหม่
3. **Soft delete** — ใช้ `deletedAt` ทุก delete operation
4. **Error handling** — ทุก API route ต้อง try/catch และ return HTTP status ที่ถูกต้อง
5. **TypeScript** — สร้าง type/interface สำหรับ BillOfStructure ให้ครบ
6. **ห้ามแตะ** — logic VAT, เลข SO, billNo ที่แก้ไปแล้ว

## ลำดับการทำงาน

1. อ่านโค้ดทั้งหมดตาม section แรก และรายงานสิ่งที่เห็น
2. เพิ่ม Prisma model + migrate
3. สร้าง API routes
4. สร้างหน้า structure/page.tsx
5. แก้ create/page.tsx เพิ่มปุ่ม 🏭 และ handler
6. ทดสอบ flow ตั้งแต่ต้นจนจบ
