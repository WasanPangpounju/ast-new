# ประเมินผลกระทบ: เปลี่ยนสูตร remainingWeightKg เป็น remainingSpool × avgWeightPerSpool

_สืบสวนเท่านั้น 2026-08-07 — อ่านข้อมูลอย่างเดียว 100% ไม่มีการแก้ไขโค้ด/ข้อมูลใดๆ สคริปต์ที่ใช้ (`scripts/compare-remaining-weight-formulas.ts`) เป็น read-only query เท่านั้น_

**สถานะ: รอการยืนยันจากผู้ใช้ก่อน implement**

---

## สรุปสั้น (TL;DR)

- สูตรใหม่ (`remainingSpool × avgWeightPerSpool` โดย `avgWeightPerSpool = totalWeightKg/totalSpool`) แก้ปัญหาตัวเลขติดลบ/ผิดปกติได้จริง **100% ของ 27 yarnType ที่ flag ไว้** — เพราะ `remainingSpool` ไม่เคยติดลบเลยในระบบ (ยืนยันจากการสืบสวนก่อนหน้า) คูณด้วยค่าเฉลี่ยที่ไม่ติดลบ ผลลัพธ์จึงไม่ติดลบเสมอ
- แต่สูตรใหม่เปลี่ยนยอดรวมทั้งระบบ **ลดลง 517,132 kg (-23.8% ของยอดเดิม, -4.67% ของ Σยอดนำเข้าทั้งหมด)** — เป็นการเปลี่ยนแปลงเชิงตัวเลขที่มีนัยสำคัญ ไม่ใช่แค่ปัดเศษเล็กน้อย เพราะสูตรใหม่ **ไม่ใช่การแก้บั๊ก แต่เป็นการเปลี่ยนนิยาม** จาก "ผลต่างสะสมจริงของน้ำหนัก" (ที่มีความคลาดเคลื่อนสะสมจากข้อมูลต้นทาง) ไปเป็น "ประมาณการจากค่าเฉลี่ย" (ทิ้งความคลาดเคลื่อนที่สะสมจริงทั้งหมด ไม่ว่าจะเป็นบวกหรือลบ)
- ผลต่อ `/api/warehouse/material/average-weight`: `averageKgRemaining` จะกลายเป็นค่าเดียวกับ `averageKgTotal` เป๊ะทุกแถว (คณิตศาสตร์: `remainingSpool × avgTotal / remainingSpool = avgTotal`) — ฟิลด์นี้จะ**ซ้ำซ้อนทันที** ไม่มีข้อมูลใหม่เพิ่มจากเดิม แต่ **ไม่กระทบฟังก์ชันการทำงานจริง** เพราะฟอร์มเบิก (`MaterialRequisitionForm.tsx`) ใช้ `averageKgTotal` อยู่แล้วตั้งแต่ fix ครั้งก่อน ไม่เคยอ้างอิง `averageKgRemaining`
- แนะนำ: **เพิ่ม field ใหม่คู่ของเดิม** (แบบเดียวกับที่ทำกับ average-weight) ไม่แก้ `AGGREGATE_COLUMNS`/`remainingWeightKg` ตรงๆ — ดูเหตุผลเต็มในข้อ 5

---

## 1. จุดที่ใช้ remainingWeightKg/remainingSpool ทั่วระบบ (grep `src/`)

| ไฟล์ | ใช้ทำอะไร | กระทบถ้าเปลี่ยนสูตร |
|---|---|---|
| `src/lib/materialStock.ts` | ต้นทาง `AGGREGATE_COLUMNS` (SQL) ที่คำนวณ `remainingWeightKg`/`remainingSpool` ปัจจุบัน + `withLb()` แปลง kg→lb | จุดที่ต้องแก้โดยตรง |
| `src/app/api/warehouse/material/stock/route.ts` | หน้าสต็อกหลัก — ทั้ง grouped-by-yarnType, flat-by-company, และยอดรวม `totalRemainingWeightKg`/`totalRemainingSpool` (summary query แยกต่างหากที่ `SUM()` ผลจาก CTE เดียวกัน) | กระทบเต็มที่ — เป็นเป้าหมายของงานนี้ |
| `src/app/api/warehouse/material/average-weight/route.ts` | คืนทั้ง `remainingWeightKg`, `remainingSpool` แบบดิบ + คำนวณ `averageKgRemaining`/`averagePRemaining` | กระทบ (ดูข้อ 4) แต่ frontend ที่เรียกใช้ไม่ได้ใช้ฟิลด์เหล่านี้ |
| `src/types/material.ts` | type `MaterialStockCompanyRow`/`MaterialStockGroup` มี field `remainingWeightKg`/`remainingWeightLb` | ต้อง type ให้ตรงถ้าเพิ่ม field ใหม่ |
| `MaterialStockGroupRow.tsx` | แสดงคอลัมน์ "คงเหลือ" ทั้งระดับกลุ่มและระดับบริษัทย่อย + ใช้ `remainingSpool` ตัดสิน opacity แถวที่หมด/badge สถานะ | จุดแสดงผลที่ผู้ใช้เห็น (เป้าหมายหลักของงาน) — **`remainingSpool` เองไม่ต้องแก้ ใช้ตัดสิน badge ต่อได้เหมือนเดิม** |
| `MaterialStockFlatRow.tsx` | เหมือนกันแต่เป็น flat-by-company view | เหมือนข้างบน |
| `MaterialStockList.tsx` | การ์ดสรุปยอดรวม "น้ำหนักคงเหลือรวม" (`totalRemainingWeightKg`) และแถวรวมท้ายตาราง | กระทบยอดรวมที่แสดงบนสุดของหน้า |

**ไม่พบ** report/export อื่นที่ import จาก `materialStock.ts` หรือเรียก 2 endpoint นี้นอกเหนือจาก 7 ไฟล์ข้างต้น — ไม่มี PDF export, Excel export, หรือ cron/report job ที่พึ่งพา `remainingWeightKg` อยู่ ณ ตอนนี้

---

## 2. เปรียบเทียบยอดรวมทั้งระบบ (177 yarnType) — สูตรเดิม vs สูตรใหม่

รันสด ณ วันที่ 2026-08-07 (`scripts/compare-remaining-weight-formulas.ts`, สูตรเดียวกับ `AGGREGATE_COLUMNS` จริง):

| | ยอด (kg) |
|---|---|
| Σ totalWeightKg (ยอดนำเข้าทั้งหมด) | 11,063,905.86 |
| Σ remainingWeightKg — **สูตรเดิม** (total − used + return) | 2,172,713.39 |
| Σ remainingWeightKg — **สูตรใหม่** (remainingSpool × avgTotal) | 1,655,581.31 |
| **ผลต่าง (ใหม่ − เดิม)** | **-517,132.08** |
| ผลต่างเทียบเป็น % ของยอดเดิม | **-23.80%** |
| ผลต่างเทียบเป็น % ของ Σ total ทั้งหมด | **-4.67%** |

สูตรใหม่ทำให้ยอดรวม "คงเหลือ" ทั้งระบบ**ลดลงเกือบ 1 ใน 4** ของยอดที่เคยแสดง — สาเหตุคือยอดเดิมมี catastrophic cancellation ดันตัวเลขขึ้นสูงในกลุ่มที่ของเหลือน้อย (ข้อ 3) ในขณะที่สูตรใหม่ตัดผลกระทบนั้นออกไปทั้งหมดโดยอิงจากค่าเฉลี่ยล้วนๆ

---

## 3. เทียบราย yarnType — 27 ชนิดที่เคย flag (รวม 8 ชนิดที่ remaining ติดลบ)

ยืนยันจำนวนตรงกับการสืบสวนก่อนหน้าเป๊ะ: **27 flagged, 8 negative** (รันสดวันนี้ได้ผลเดียวกัน)

| yarnType | totalSpool | remainingSpool | เดิม (kg) | ใหม่ (kg) | ผลต่าง (kg) | หมวด |
|---|--:|--:|--:|--:|--:|---|
| KE 7/2 จงสถิตย์ | 3,912 | 10 | 437.80 | 21.20 | -416.60 | high |
| T 150 (AA) | 1,128 | 5 | 404.56 | 23.60 | -380.96 | high |
| TC 45 CARD (80:20) | 1,227 | 12 | 303.33 | 25.31 | -278.02 | high |
| C 7/2 OE มาดีสปินนิ่ง (ใหญ่) | 1,656 | 24 | 363.83 | 42.44 | -321.39 | high |
| KE 20 ย้อมขาว | 4,116 | 24 | 429.53 | 60.16 | -369.37 | high |
| TC 7 OE | 5,282 | 149 | 2,477.39 | 433.70 | -2,043.69 | high |
| KE 7/2 | 31,429 | 168 | 1,126.13 | 212.21 | -913.92 | high |
| CVC 45 COMB (60:40) | 8,797 | 236 | 3,370.33 | 643.19 | -2,727.14 | high |
| CVC 40 COMB | 1,024 | 8 | 75.55 | 17.56 | -57.98 | high |
| **TC 45 COMB (65:35) G 10** | 370,540 | 28,756 | 209,922.47 | 67,520.71 | -142,401.76 | high |
| KE 7 | 24,417 | 1,032 | 6,848.44 | 2,513.89 | -4,334.55 | high |
| TC 14 COMB | 308 | 19 | 99.95 | 43.46 | -56.48 | high |
| T 300 (A) | 8,949 | 536 | 5,689.79 | 2,485.65 | -3,204.13 | high |
| CP 40/2 พิพัฒน์ | 2,100 | 486 | 1,296.95 | 572.94 | -724.01 | high |
| CD 20 CARD | 53,497 | 3,821 | 18,558.03 | 8,298.38 | -10,259.65 | high |
| TR 40/2 | 1,065 | 25 | 125.49 | 58.99 | -66.50 | high |
| CP 50 COMPACK | 88,463 | 5,306 | 23,507.90 | 11,085.57 | -12,422.33 | high |
| C 80/2 | 3,435 | 68 | 241.89 | 114.51 | -127.38 | high |
| CP 32/2 จีน | 4,660 | 1,180 | 321.78 | 1,579.24 | +1,257.46 | low |
| C 20/2 (PST) | 44,284 | 0 | **-20,739.48** | 0.00 | +20,739.48 | negative |
| C 7 OE CEL | 473 | 0 | **-12.52** | 0.00 | +12.52 | negative |
| CP 40/2 จีน | 2,700 | 0 | **-484.50** | 0.00 | +484.50 | negative |
| C 10/2 กังวาล | 2,153 | 339 | **-370.73** | 469.25 | +839.97 | negative |
| CVC 45 COMB | 1,284 | 60 | **-159.01** | 133.19 | +292.20 | negative |
| CB 40 (BAMBOO) | 885 | 32 | **-130.04** | 77.60 | +207.64 | negative |
| C 7/2 OE มาดีสปินนิ่ง (เล็ก) | 16,834 | 203 | **-1,565.20** | 223.63 | +1,788.83 | negative |
| CVC 10/2 | 21,566 | 4 | **-1,382.32** | 4.90 | +1,387.22 | negative |

**ผลยืนยัน:**
- **8/8 ชนิดที่ติดลบเดิม → เป็น 0 หรือบวกทั้งหมดภายใต้สูตรใหม่** เพราะ `remainingSpool` ของทั้ง 8 ชนิดไม่เคยติดลบอยู่แล้ว (บางชนิด remainingSpool = 0 พอดี → remainingWeightKg ใหม่ = 0 แทนที่จะติดลบ) → **แก้ปัญหาตัวเลขติดลบได้ 100% ตามที่ตั้งเป้า**
- **18 ชนิดกลุ่ม "high" ทั้งหมดลดลงแรง** (เช่น TC 45 COMB G10 จาก 209,922 → 67,520 กก. ลดลง 68%) เพราะค่าที่ผิดปกติเกิดจาก catastrophic cancellation ที่สูตรใหม่ตัดทิ้งไปเลยโดยอิงจากค่าเฉลี่ย
- 1 ชนิดกลุ่ม "low" (CP 32/2 จีน) กลับ**เพิ่มขึ้น** (321 → 1,579 กก., +391%) เพราะเดิมมันต่ำผิดปกติ สูตรใหม่ดึงกลับสู่ค่าเฉลี่ยที่สูงขึ้น — ทิศทางถูกต้องเช่นกัน (แก้ anomaly ทั้งสองทาง ไม่ใช่แค่ทางลบ)

---

## 4. ผลกระทบต่อ `/api/warehouse/material/average-weight`

Endpoint นี้ query ผ่าน `AGGREGATE_COLUMNS` ตัวเดียวกันเป๊ะ (`src/app/api/warehouse/material/average-weight/route.ts:29`) แล้วคำนวณต่อ:

```
averageKgTotal     = totalWeightKg / totalSpool          ← ไม่เปลี่ยน (ไม่แตะ total)
averageKgRemaining = remainingWeightKg / remainingSpool   ← เปลี่ยนความหมายทันที
```

ถ้าแก้ `AGGREGATE_COLUMNS` ให้ `remainingWeightKg = remainingSpool × avgTotal` แล้ว:

```
averageKgRemaining_ใหม่ = (remainingSpool × avgTotal) / remainingSpool = avgTotal  (ทุกแถวที่ remainingSpool > 0)
```

→ **`averageKgRemaining` จะกลายเป็นค่าเดียวกับ `averageKgTotal` เป๊ะทุกแถวทันที** ฟิลด์นี้จะไม่มีข้อมูลอะไรใหม่เพิ่มจาก `averageKgTotal` เลย — เป็น field ซ้ำซ้อนโดยสมบูรณ์ (ยกเว้นกรณี `remainingSpool = 0` ที่จะกลายเป็น `null` ทั้งคู่เหมือนเดิม)

**ผลกระทบเชิงฟังก์ชันจริง: ไม่มี** — เช็คแล้วว่า `MaterialRequisitionForm.tsx:236` (ฟอร์มเบิกที่เพิ่งแก้ auto-fill ไป) ใช้ `data.averageKgTotal` เท่านั้น ไม่เคยอ้างอิง `averageKgRemaining`/`remainingWeightKg` เลย ดังนั้นแก้สูตรนี้จะ **ไม่กระทบ auto-fill ที่ทำไปแล้ว** แต่ก็แปลว่า **ฟิลด์ `averageKgRemaining`/`remainingWeightKg`/`remainingSpool` ที่ endpoint ยัง return จะกลายเป็นข้อมูลซ้ำซ้อนไม่มีประโยชน์เพิ่ม** ถ้ามีการเก็บไว้ "เผื่อ use case อนาคต" ตามที่ comment ในไฟล์บอกไว้ (บรรทัด 9-10) จะไม่มี use case ให้ใช้อีกต่อไปเพราะข้อมูลกลายเป็นค่าเดียวกับ total หมด

---

## 5. วิธี implement — ข้อเสนอ

### ตัวเลือก A: เพิ่ม field ใหม่คู่ของเดิม (`remainingWeightKgEstimated`) — **แนะนำ**

เพิ่มคอลัมน์ใหม่ใน `AGGREGATE_COLUMNS` (คำนวณจากค่าที่มีอยู่แล้วในผลลัพธ์เดียวกัน ไม่ต้อง query เพิ่ม):
```sql
CASE WHEN SUM(m.spool) > 0
  THEN "remainingSpool" * (SUM(m."weightKgSum") / SUM(m.spool))
  ELSE 0
END AS "remainingWeightKgEstimated"
```
แล้วให้ frontend (`MaterialStockGroupRow.tsx`/`MaterialStockFlatRow.tsx`/`MaterialStockList.tsx`) เปลี่ยนคอลัมน์ "คงเหลือ" ที่แสดงให้พนักงานมาใช้ field ใหม่นี้แทน โดย `remainingWeightKg` เดิมยังอยู่ใน response เหมือนเดิมทุกที่

**ข้อดี:**
- ไม่ breaking change ต่อ consumer อื่นที่อาจพึ่งพา `remainingWeightKg` เดิม (ยืนยันจากข้อ 1 ว่าตอนนี้ยังไม่มี แต่ปลอดภัยไว้ก่อนสำหรับอนาคต)
- รักษาตัวเลข "ผลต่างสะสมจริง" ไว้เป็น diagnostic signal ต่อ — มีประโยชน์ต่อการสืบสวนข้อมูลผิดปกติแบบที่เพิ่งทำไปหลายรอบ ([[project_material_lot_key_collision_bug]]) ถ้าลบทิ้งจะไม่มีทางรู้อีกว่ากลุ่มไหนมีความคลาดเคลื่อนสะสมมาก/น้อยแค่ไหน
- ตรงกับ pattern ที่เพิ่งใช้ใน average-weight endpoint เป๊ะ (เพิ่ม field คู่ ให้ frontend เลือก ไม่ใช่แก้ทับ) — สอดคล้อง codebase convention ที่มีอยู่แล้ว
- Rollback ง่าย ถ้าพนักงานไม่ชอบตัวเลขใหม่ก็สลับกลับด้าน frontend ได้ทันทีโดยไม่ต้อง deploy backend ใหม่

**ข้อเสีย:**
- ต้องแก้ type (`MaterialStockCompanyRow`/`MaterialStockGroup`) เพิ่ม field, แก้ 2-3 จุด frontend, และ summary query ใน `stock/route.ts` (`totalRemainingWeightKg`) ต้องมี `totalRemainingWeightKgEstimated` คู่ด้วยถ้าอยากให้การ์ดสรุปยอดบนสุดเปลี่ยนตาม — งานมากกว่าตัวเลือก B เล็กน้อย
- มี column ซ้ำซ้อนอยู่ใน schema/type ตลอดไป (แต่ยอมรับได้ เพราะมีเหตุผลต่างกันชัดเจน)

### ตัวเลือก B: แก้ `AGGREGATE_COLUMNS`/`remainingWeightKg` ตรงๆ

**ข้อดี:** โค้ดเปลี่ยนจุดเดียว (`materialStock.ts`), ทุกจุดที่ใช้ได้ค่าใหม่อัตโนมัติไม่ต้องแก้ frontend

**ข้อเสีย:**
- เปลี่ยนความหมายของ field `remainingWeightKg` แบบเงียบๆ (silent redefinition) — ทุกจุดที่เคย return field นี้ (รวม `average-weight` endpoint) จะเปลี่ยนพฤติกรรมไปด้วยโดยไม่รู้ตัว แม้ตอนนี้จะเช็คแล้วว่าไม่มีจุดไหนพังจริง แต่เสี่ยงกว่าถ้ามี consumer ใหม่เพิ่มมาทีหลังโดยไม่รู้ว่า field นี้ไม่ใช่ผลต่างจริงอีกต่อไป
- ทำลายตัวเลข "ผลต่างสะสมจริง" ทิ้งถาวร ไม่มีทางย้อนดูอีกว่ากลุ่มไหนมีความคลาดเคลื่อนสะสมเยอะ (เป็นสัญญาณเตือนคุณภาพข้อมูลต้นทางที่มีประโยชน์ต่อการสืบสวนในอนาคต)
- `averageKgRemaining` ใน average-weight endpoint กลายเป็น dead/redundant field ทันที (ข้อ 4) แต่โค้ด comment ที่อธิบายเหตุผลการมีอยู่ของมัน (บรรทัด 5-10 ของไฟล์) จะผิดจากความจริงทันที ต้องแก้ comment ด้วย
- Rollback ยากกว่า (ต้อง deploy backend ใหม่ถ้าพนักงานไม่ชอบ)

### ข้อเสนอ

**เลือกตัวเลือก A** — เหตุผลหลักคือความเสี่ยงต่ำกว่ามาก งานเพิ่มขึ้นไม่มาก (แก้ query 1 คอลัมน์ + summary query 1 คอลัมน์ + type 2 ไฟล์ + frontend 3 ไฟล์) และตรงกับ pattern ที่ผู้ใช้เพิ่งอนุมัติให้ทำกับ average-weight ไปแล้ว (`docs` เดิมใช้คำว่า "เก็บไว้เผื่อ use case อื่นในอนาคต" กับฟิลด์เดิม — งานนี้ก็ควรทำแบบเดียวกัน)

**สิ่งที่ต้องตัดสินใจเพิ่มก่อน implement:**
1. ยืนยันว่ายอมรับการเปลี่ยนแปลงยอดรวมทั้งระบบ -23.8% (517,132 kg) ที่จะปรากฏบนหน้าสต็อกหลัก — เป็นตัวเลขที่พนักงานคลังเห็นทุกวันตอนนี้ ถ้าเปลี่ยนกะทันหันควรมีการแจ้งทีมงานล่วงหน้า
2. field ใหม่ควรครอบคลุมทั้งระดับ yarnType, yarnType+supplierName (flat/company), และ summary รวม (`totalRemainingWeightKg`) หรือจะโชว์แค่บางระดับ
3. `remainingWeightKg` เดิม (ที่จะยังคงอยู่ใน API) ควรลบออกจากหน้าจอที่แสดงผลไปเลย หรือจะซ่อนไว้เป็น tooltip/debug info สำหรับ admin เท่านั้น

---

## ภาคผนวก: สคริปต์ที่ใช้

`scripts/compare-remaining-weight-formulas.ts` (read-only, ลบได้หลังตัดสินใจเสร็จ) — ใช้สูตรจริงจาก `MATERIAL_STOCK_CTES`/`AGGREGATE_COLUMNS` เดียวกับ production ไม่มีการ UPDATE/DELETE/INSERT ใดๆ
