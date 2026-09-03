# สำรวจช่องค้นหาในระบบคลังสินค้า (ระบบผ้า)

_สำรวจ 2026-09-03, เพิ่ม autocomplete ให้ครบ 2026-09-04 — ครอบคลุม 10 หน้าในกลุ่ม "ระบบคลังสินค้า" (`src/lib/menus.ts` group `warehouse.*`)_

## หน้าที่สำรวจ

| เมนู | route |
|---|---|
| คีย์ผ้าเข้าสต็อก | `/warehouse/stock/create` |
| คีย์ผ้าซื้อเข้า | `/warehouse/stock/purchase` |
| ตรวจสอบคีย์ผ้า | `/warehouse/fabric-in/review` |
| ตรวจสอบผ้าซื้อเข้า | `/warehouse/stock/purchase/review` |
| เปิดบิลผ้า | `/warehouse/bill/create` |
| พิมพ์บิลส่งของ | `/warehouse/bill` |
| ออร์เดอร์ลูกค้า | `/warehouse/orders` |
| สต็อกผ้า | `/warehouse/stock` |
| สต็อกผ้าฝากจัดเก็บ | `/warehouse/stock-deposit` |
| รายงาน (3 tab) | `/warehouse/reports` |

`รายงาน` ไม่มีช่องค้นหาแบบ free-text เลย (มีแต่ dropdown filter ประเภทบิล/เดือน/ปี/วันที่) — ไม่เข้าเกณฑ์การสำรวจนี้

## สถานะ ณ ตอนสำรวจ (2026-09-03)

**✅ มี autocomplete อยู่แล้ว (11 ช่อง)**
- เปิดบิลผ้า — ครบ 5 ช่อง (ตัดจากสต็อก, ตัดจากออร์เดอร์, ผู้สั่ง, ผู้รับ, แทนผู้สั่งซื้อ)
- คีย์ผ้าเข้าสต็อก — 3 ช่อง (ตัดจากสต็อก, รหัสผ้า, ลูกค้า)
- คีย์ผ้าซื้อเข้า — 3 ช่อง (ตัดจากสต็อก, รหัสผ้า, ลูกค้า)
- พิมพ์บิลส่งของ — 3 ช่อง (ค้นหาหลัก, ค้นหาสต็อกในโมดัล, ค้นหาออร์เดอร์ในโมดัล)

**❌ ยังไม่มี (9 ช่อง)** — ดูตารางสถานะการเพิ่มด้านล่าง

## สถานะการเพิ่ม autocomplete (2026-09-04)

ทั้ง 9 ช่องเพิ่มครบแล้ว ใช้ pattern debounce (300ms) + dropdown (onFocus เปิด / onBlur ปิดหลัง 200ms / onMouseDown เลือก) เหมือนช่องที่มีอยู่แล้วในระบบ (`StockCreateForm.tsx`, `PurchaseStockForm.tsx`, `bill/create/page.tsx`) — ไม่มี keyboard nav (arrow key) เพราะของเดิมในระบบก็ไม่มีเช่นกัน

### กลุ่ม 1 — reuse `/api/warehouse/stock/search` (ไม่ได้เขียน API ใหม่)

| หน้า | ช่อง | วิธี reuse |
|---|---|---|
| สต็อกผ้า | ช่องค้นหาหลัก (เลือก field: fabricCode/fabricStruct/fabricPattern/fabricW) | เรียก `?${searchBy}=${q}` — field ตรงกับชื่อ query param ที่ API รองรับอยู่แล้วพอดี |
| สต็อกผ้า | ช่องลูกค้า | เรียก `?customer=${q}` |
| สต็อกผ้าฝากจัดเก็บ | ช่องค้นหาลูกค้า/โครงสร้างผ้า | เรียก `?q=${q}` (OR-match หลาย column) แสดง `fabricStruct` เป็นค่าเลือก |

### กลุ่ม 2 — API ใหม่

| หน้า | ช่อง | Endpoint ใหม่ | แหล่งข้อมูล |
|---|---|---|---|
| คีย์ผ้าซื้อเข้า | ผู้ขาย/โรงงาน | `GET /api/warehouse/stock/purchase/suggestions?field=supplier&q=` | distinct `stockfabrics.supplier` WHERE `is_purchased=true` |
| ตรวจสอบผ้าซื้อเข้า | ค้นหา (ผู้ขาย/เลขบิล/โครงสร้าง) | `GET /api/warehouse/stock/purchase/suggestions?q=` (ไม่ส่ง field) | merge distinct `supplier`/`bill_ref`/`fabricStruct` จาก `stockfabrics` WHERE `is_purchased=true` |
| ตรวจสอบคีย์ผ้า | ค้นหา (โครงสร้างผ้า/ลูกค้า) | `GET /api/warehouse/stock/review/suggestions?q=` | merge distinct `fabricStruct`/`customer` จาก `stockfabrics` WHERE `is_purchased=false` |
| ออร์เดอร์ลูกค้า | ลูกค้า | `GET /api/warehouse/orders/suggestions?field=customerName&q=` | distinct `ast_purchaseorders.customerName` |
| ออร์เดอร์ลูกค้า | เลขที่ใบสั่งซื้อ | `GET /api/warehouse/orders/suggestions?field=purchaseOrder&q=` | distinct `ast_purchaseorders.purchaseOrder` |
| ออร์เดอร์ลูกค้า | รหัสผ้า | `GET /api/warehouse/orders/suggestions?field=fabricId&q=` | distinct `ast_purchaseorders.fabricId` |

ทั้ง 3 endpoint filter ด้วย ILIKE (Prisma `contains` + `mode: 'insensitive'`) + `distinct` + `take: 10` ตามที่กำหนด และ `/api/warehouse/orders/suggestions` กรอง `status='อนุมัติให้ผลิต'` เหมือนกับที่หน้ารายการ (`/api/warehouse/orders`) ใช้เป็นค่า default อยู่แล้ว เพื่อไม่ให้ suggestion โชว์ค่าที่กดค้นหาแล้วไม่เจอผลลัพธ์จริง

## หมายเหตุ

- ไม่ได้แก้ UI layout/style เดิม — เพิ่มเฉพาะ dropdown ต่อท้าย input ที่มีอยู่แล้ว (wrap ด้วย `relative` + `absolute` dropdown เหมือนช่องอื่นในระบบ)
- `react-hooks/set-state-in-effect` ของ eslint ขึ้น error ในทุกช่องใหม่ — เป็น pattern เดียวกับที่มีอยู่แล้วทั่วระบบ (ยืนยันแล้วว่าเกิดกับโค้ดเดิมที่ไม่ได้แตะด้วย เช่น `StockCreateForm.tsx`, `bill/create/page.tsx`) ไม่ใช่ปัญหาใหม่จากงานนี้
