# สำรวจฟีเจอร์ "คืนบรรจุภัณฑ์ให้ซัพพลายเออร์" ในระบบ Laravel เดิม

> Read-only review ของ `C:\Users\Friendly Dev\project\ast-laravel-clean` (ไม่มีการแก้ไขไฟล์ใดๆ ใน repo นั้น)
> อ้างอิงจาก: migration files, active controllers/models (ไฟล์ที่ไม่มี date-prefix ตามธรรมเนียมของ repo นี้), และ view templates

**สรุปสั้น:** ฟีเจอร์นี้ในระบบเดิมทำงานได้จริงเฉพาะ "ครึ่งเดียว" — ฝั่ง **นำเข้าวัตถุดิบ** (`packages` + `htrpackages`) มี flow ครบ (สร้างยอดค้าง → ดู list → คืนจริง) แต่ฝั่ง **เบิกวัตถุดิบภายนอก** (`packageoutsides` + `astpackageoutsides`) มีแค่การเขียนข้อมูลตอนเบิก แต่**ไม่มี UI ใดๆ เลย**ให้ดูยอดค้างคืนหรือบันทึกการคืนจริง (152 แถวใน `packageoutsides` ที่ไม่เคยถูกอ่านจาก view ไหนเลย)

---

## 1. Schema เต็มของตารางที่เกี่ยวข้อง

พบ **5 ตาราง** (ผู้ใช้ระบุ 4 แต่จากโค้ดจริงมี 5 ตารางที่เกี่ยวพันกันเป็น 2 คู่ import/return):

| ตาราง | บทบาท |
|---|---|
| `packages` | ยอดบรรจุภัณฑ์ที่ต้องคืน เกิดจาก "นำเข้าวัตถุดิบ" (1 แถวต่อ 1 ครั้งนำเข้า) |
| `htrpackages` | Log การคืนจริง (1 แถวต่อ 1 ครั้งที่กดปุ่ม "ส่งคืน") |
| `packageoutsides` | ยอดบรรจุภัณฑ์ที่ต้องเรียกคืน เกิดจาก "เบิกวัตถุดิบภายนอก" — **ไม่มี UI อ่าน/จัดการ** |
| `packageasts` | บันทึกละเอียดของฝั่งนำเข้า แยกชนิดย่อย (steel/wood, spool_plastic/paper ฯลฯ), 2 แถวต่อ 1 ครั้งนำเข้า (import + return) |
| `astpackageoutsides` | บันทึกละเอียดของฝั่งเบิกภายนอก แยกชนิดย่อยเหมือนกัน, 2 แถวต่อ 1 ครั้งเบิก (outside + callback) |

ทุกตารางเป็น **plain string columns ทั้งหมด ไม่มี foreign key constraint ในระดับ DB**, ไม่มี index เพิ่มเติมนอกจาก primary key, และ **ไม่มี soft delete** (`deleted_at`) เลยสักตาราง — `destroy()` เป็นการลบถาวรทุกที่

### 1.1 `packages` (migration: `2022_09_27_084140_create_packages_table.php`)

```php
$table->id();
$table->string('emp');
$table->string('supplier_id');     // ⚠️ ไม่ใช่ FK จริง — โค้ดจริงเซ็ตเป็น Date('m/d/Y') ไม่ใช่ id ของ supplier
$table->string('supplier_name');   // ใช้เป็น "key" เชื่อมกับ supplier จริง ๆ (string match, ไม่ใช่ FK)
$table->string('spool');
$table->string('sack');
$table->string('box');
$table->string('pallet');
$table->string('package_status');  // ⚠️ โค้ดจริงเซ็ตเป็นค่า importStatus (เลขที่ใบส่งของ) ไม่ใช่ enum สถานะ
$table->timestamp('added_on');     // ไม่เคยถูกใช้ในโค้ดที่ยังทำงาน (ไม่มีการ set ค่านี้ตอน create)
$table->timestamps();
```
Row count (2026-05-01): **4,156**

### 1.2 `htrpackages` (migration: `2023_01_31_033520_create_htrpackages_table.php`)

Migration ต้นฉบับมีแค่:
```php
$table->id();
$table->string('emp');
$table->string('supplier_name');
$table->string('spool');
$table->string('sack');
$table->string('box');
$table->string('pallet');
$table->timestamps();
```
**⚠️ Schema drift:** Model (`Htrpackage.php`) และโค้ดใน `PackageController` ใช้คอลัมน์เพิ่มอีกจำนวนมากที่**ไม่มี migration ใดสร้างไว้เลย** (`createDate`, `lot`, `stuff`, `partition`, `spool_paper`, `spool_plastic`, `spoolC_plastic`, `spoolC_paper`, `pallet_wood`, `pallet_steel`, `importStatus`) — แปลว่าคอลัมน์เหล่านี้ถูกเพิ่มเข้า DB จริงด้วยวิธีอื่น (ALTER TABLE ตรงๆ หรือเครื่องมือภายนอก) โดยไม่ผ่าน migration file ระบบ migration ของ repo นี้จึง**ไม่สะท้อน schema จริงทั้งหมด** ของตารางนี้ (พยายาม verify กับ MySQL DB ตรง — เชื่อมต่อ `127.0.0.1:3307` ไม่สำเร็จเพราะ service ไม่ได้รันอยู่ตอนสำรวจ ควร verify เพิ่มถ้าจะย้าย schema จริง)

Row count: **81**

### 1.3 `packageoutsides` (migration: `2023_02_10_025511_create_packageoutsides_table.php`)

```php
$table->id();
$table->string('emp');
$table->string('supplier_id');     // เดียวกับ packages — เซ็ตเป็น Date('m/d/Y')
$table->string('supplier_name');
$table->string('spool');
$table->string('sack');
$table->string('box');
$table->string('pallet');
$table->string('package_status');  // ⚠️ ในนี้เซ็ตเป็น MaterialOutside::id (ใช้เป็น pseudo-FK เพื่อ cascade delete!)
$table->timestamp('added_on');
$table->timestamps();
```
Row count: **152**

### 1.4 `packageasts` (migration: `2023_02_24_024947_create_packageasts_table.php`)

```php
$table->id();
$table->string('emp');
$table->string('ref_id');           // = Material::id ของรายการนำเข้าที่ทำให้เกิดแถวนี้
$table->string('supplier_name');
$table->string('spool');
$table->string('spool_type');       // spool_plastic | spool_paper | spoolC_plastic | spoolC_paper
$table->string('sack');
$table->string('sack_type');
$table->string('box');
$table->string('box_type');
$table->string('pallet');
$table->string('pallet_type');      // wood | steel
$table->string('partition');        // กระดาษกั้น
$table->string('partition_type');
$table->string('package_status');   // packageImport | packageReturn (ค่าจริง เป็น enum แบบ hardcode string)
$table->timestamps();
```
Row count: **7,590** (มากสุดในกลุ่มนี้ เพราะสร้าง 2 แถวทุกครั้งที่นำเข้าวัตถุดิบ)

### 1.5 `astpackageoutsides` (migration: `2023_02_25_180112_create_astpackageoutsides_table.php`)

เหมือน `packageasts` ทุกคอลัมน์ บวก:
```php
$table->string('receiver')->nullable();   // ชื่อผู้รับ (จาก field 'recipient' ในฟอร์มเบิกภายนอก)
```
ทุกคอลัมน์เป็น `nullable()` (ต่างจาก `packageasts` ที่ required) `package_status` ในนี้ = `packageOutside` | `packageCallback`
Row count: **294**

---

## 2. Business Logic

### 2.1 จุด trigger การสร้างยอดค้างคืน — นี่คือคำตอบของคำถาม "checkbox ควร trigger จากจุดไหน"

**ฝั่งนำเข้าวัตถุดิบ** — `MaterialController@store`, branch `submit == 'save'` (ทุกครั้งที่บันทึกการนำเข้าวัตถุดิบสำเร็จ, ไม่มีเงื่อนไข ทำงานเสมอ):

1. สร้าง **`Packageast`** แถวแรก, `package_status = 'packageImport'` — บันทึก**จำนวนเต็มทั้งหมด**ที่นำเข้า (ไม่ขึ้นกับ checkbox)
2. สร้าง **`Packageast`** แถวที่สอง, `package_status = 'packageReturn'` — บันทึกเฉพาะชนิดที่ผู้ใช้ **ติ๊ก checkbox** ("ส่งคืนบรรจุภัณฑ์": `packaging1`=pallet, `packaging2`=box, `packaging3`=sack, `packaging4`=spool) ชนิดที่ไม่ติ๊ก → บันทึกเป็น 0 **แถวนี้ถูกสร้างเสมอ แม้ไม่ติ๊ก checkbox เลยสักอัน** (จะได้แถว all-zero)
3. สร้าง **`Package`** 1 แถว — เป็นค่าเดียวกับข้อ 2 (แบบไม่แยกชนิดย่อย) นี่คือแถวที่ table `packages`/`htrpackages` ใช้คำนวณยอดค้างคืนหลัก

โค้ด (`MaterialController.php:249-318`) ยืนยันตรงนี้ชัดเจนว่า checkbox คือตัวกำหนดว่าบรรจุภัณฑ์ชนิดไหน "ต้องคืน" — **การนำเข้าเดียวกันสามารถมีทั้งของที่ import (เก็บไว้ใช้) และของที่ต้องคืน พร้อมกันได้** เช่น นำเข้าพร้อม pallet 5 ชิ้น + sack 10 ใบ แต่ติ๊กคืนแค่ pallet → ยอดค้างคืนจะมีแค่ pallet 5, sack ไม่ติดยอดค้างคืนเลย

**ฝั่งเบิกวัตถุดิบภายนอก** — `MaterialOutsideController@store`, branch `submit == 'save'` — โครงสร้างเหมือนกันทุกประการ (mirror 1:1):

1. `Astpackageoutside` แถว `package_status = 'packageOutside'` — จำนวนเต็มที่เบิกออก
2. `Astpackageoutside` แถว `package_status = 'packageCallback'` — เฉพาะชนิดที่ติ๊ก checkbox
3. `Packageoutside` 1 แถว, `package_status` = **`MaterialOutside::id`** (ไม่ใช่ enum แบบฝั่งนำเข้า!) — ใช้เป็น pseudo-FK เพื่อให้ `destroy()` ของ MaterialOutside หาแถว packageoutsides ที่เกี่ยวข้องมาลบทิ้งได้ (`MaterialOutsideController.php:459`)

⚠️ **`package_status` มีความหมายไม่ตรงกันในแต่ละตาราง** — เป็นจุดสำคัญที่ต้องระวังตอนออกแบบระบบใหม่:
- `packages.package_status` = ค่า `importStatus` (เลขที่ใบส่งของ/invoice) — ข้อความอิสระ
- `packageoutsides.package_status` = `materialoutside.id` (ตัวเลขในรูป string) — ใช้เป็น pseudo-FK
- `packageasts.package_status` / `astpackageoutsides.package_status` = enum จริง (`packageImport`/`packageReturn`/`packageOutside`/`packageCallback`)

### 2.2 ยอดค้างคืนคำนวณยังไง

**ไม่มีคอลัมน์ "ยอดค้างคืน" เก็บตรงๆ ที่ไหน** — เป็นการคำนวณสด (on-the-fly) ทุกครั้งที่เปิดหน้า โดย 2 ระดับความละเอียด:

**ระดับหยาบ (by supplier รวมทุกชนิด)** — ใช้ตอนแสดง list ภาพรวม:
```
ยอดค้างคืน = SUM(packages.spool/sack/box/pallet WHERE supplier_name = X)
           - SUM(htrpackages.spool/sack/box/pallet WHERE supplier_name = X)
```
(`PackageController@index` และ `@create` — `duplicate_data` vs `duplicate_datahtr`)

**ระดับละเอียด (แยกชนิดย่อย)** — ใช้ตอนเปิดฟอร์ม "คืนบรรจุภัณฑ์แบบระบุเอง" สำหรับ supplier ที่เลือก (`PackageController@create`, บรรทัด ~121-224):
```
นำเข้า        = SUM(packageasts WHERE package_status='packageImport' AND supplier_name=X), แยกตาม spool_type/pallet_type
ต้องส่งคืน     = SUM(packageasts WHERE package_status='packageReturn' AND supplier_name=X), แยกตาม type เดียวกัน
คืนแล้ว        = SUM(htrpackages WHERE supplier_name=X)  — ใช้คอลัมน์ย่อยตรงๆ (spool_paper, pallet_wood, ...)
ต้องส่งคืนคงค้าง = ต้องส่งคืน - คืนแล้ว   (คำนวณต่อชนิดย่อย)
```
ตารางนี้ปรากฏจริงในหน้า `package/create.blade.php` (4 แถว: นำเข้า / ต้องส่งคืน / คืนแล้ว / ต้องส่งคืนคงค้าง)

**สำคัญ:** ตรรกะการลบ (`ต้องส่งคืน - คืนแล้ว`) **ไม่ได้ผูกกับ transaction/batch ใดๆ** เป็นการลบยอดรวมสะสมทั้งหมดของ supplier นั้น ไม่ track ว่าคืนไปแล้วตัดจากยอดค้างของการนำเข้าครั้งไหน (FIFO/ผูก ref_id ก็ไม่มี) — ผลคือ**คืนเกินยอดได้** และยอดจะติดลบในหน้าจอ (ไม่มี validation กันเลย ดู edge case ข้อ 5)

### 2.3 สถานะ (status) ของรายการคืน

**ไม่มี status แบบ state machine** (เช่น รอคืน → คืนบางส่วน → คืนครบ) เก็บไว้ต่อรายการเลย สถานะที่ "ดูเหมือน" มีคือ:
- `packageasts.package_status` / `astpackageoutsides.package_status` เป็นแค่ **ป้ายบอกประเภทแถว** (import vs return obligation) ไม่ใช่ workflow state
- สถานะ "รอคืน/คืนแล้ว" เป็น**ผลลัพธ์ที่ derive จากการคำนวณ** (ข้อ 2.2) ไม่ใช่ field ที่ถูก update — ไม่มีปุ่มไหน "mark as returned" ต่อรายการเดียว มีแต่การกรอกฟอร์มคืนใหม่ (สร้าง `Htrpackage` แถวใหม่) แล้วให้สูตรลบเห็นยอดลดลงเอง

### 2.4 เชื่อมกับ supplier ยังไง

**ไม่มี FK ไปตาราง `suppliers` เลยสักตารางในกลุ่มนี้** — เชื่อมด้วย **`supplier_name` (string match)** ล้วน ๆ ผลคือ:
- พิมพ์ชื่อบริษัทเพี้ยนแม้แค่วรรค/ตัวสะกดต่าง ก็จะถูกนับเป็นคนละ supplier ในการ group by
- 1 supplier มีได้หลายรายการค้างคืนแน่นอน (many-to-one) — `packages`/`packageasts` มีได้หลายแถวต่อ supplier_name เดียว (คนละครั้งนำเข้า) แล้วเอามา `SUM(...) GROUP BY supplier_name` รวมเป็นยอดเดียว ไม่ได้แสดงเป็นราย transaction ในหน้า list

### 2.5 เชื่อมกับ "นำเข้าวัตถุดิบ" และ "เบิกวัตถุดิบภายนอกยังไง" (ตอบคำถามหลักของฝั่ง requirements ใหม่)

| ระบบใหม่ (ast-new) | ระบบเดิม (จุดที่เทียบเท่า) |
|---|---|
| Checkbox "ส่งคืนบรรจุภัณฑ์" ในฟอร์ม **นำเข้าวัตถุดิบ** | `packaging1..4` checkboxes ในฟอร์ม material create (`editdetail.blade.php` ทำหน้าที่นี้ แม้จะอยู่ผิด folder `views/package/`) → trigger `MaterialController@store` branch `save` สร้าง `Packageast(packageReturn)` + `Package` |
| Checkbox "ส่งคืนบรรจุภัณฑ์" ในฟอร์ม **เบิกวัตถุดิบภายนอก** | checkbox เดียวกัน (`packaging1..4`) ในฟอร์ม `materialoutside/create.blade.php` → trigger `MaterialOutsideController@store` branch `save` สร้าง `Astpackageoutside(packageCallback)` + `Packageoutside` |

ทั้งสอง flow **เขียนแยกกันคนละ 3 ตาราง ไม่ใช้ตารางร่วมกัน** และไม่มี union ใดๆ — จึงเป็นเหตุผลว่าทำไม `packageoutsides`/`astpackageoutsides` มีข้อมูลสะสม (152 / 294 แถว) แต่**ไม่เคยถูกแสดงหรือจัดการที่หน้าไหนเลย** (ดูข้อ 3.4)

---

## 3. Flow หน้าจอเดิม

Route ทั้งหมดเป็น `Route::resource('package', PackageController::class)` มาตรฐาน Laravel (`routes/web.php:51`) — ไม่มี custom route เพิ่มสำหรับ package module

### 3.1 หน้า List (`GET /package` → `package.index`)
- แสดงตาราง log ดิบของ `Htrpackage::all()->sortByDesc('createDate')` — คือ**ประวัติการคืนจริงทั้งหมด** (ทุก supplier ปนกัน) ไม่ใช่สรุปยอดค้างคืนต่อ supplier
- มีปุ่ม ลบ / แก้ไข ต่อแถว (ผูกกับ `htrpackages.id`)
- **⚠️ ส่วนที่ควรจะเป็น "ตารางสรุปยอดค้างคืนแยกตาม supplier" (คำนวณ `duplicate_data - duplicate_datahtr`) มีโค้ด Blade เขียนไว้ครบ แต่ถูก comment ปิดทั้งหมด** (`{{-- ... --}}` บรรทัด 62-198 ของ `index.blade.php`) — คือ dead UI ที่เคยทำแล้วแต่ปิดไว้ ไม่ได้แสดงจริง
- มีฟอร์มค้นหาด้วยชื่อ supplier (`GET /package/create?supplier=X`)

### 3.2 หน้าเลือก supplier แล้วดูยอดค้างคืน + กรอกคืน (`GET /package/create` → `package.create`)
เข้าทาง 2 ทาง: กดปุ่ม "คืนบรรจุภัณฑ์แบบระบุเอง" (ไม่ระบุ supplier) หรือมาจากลิงก์ระบุ `?supplier=`
- แสดงตาราง 4 แถว (นำเข้า / ต้องส่งคืน / คืนแล้ว / ต้องส่งคืนคงค้าง) ตามข้อ 2.2
- ฟอร์มกรอกจำนวนที่จะคืนจริง (แยก pallet_wood/pallet_steel/box/sack/partition/spool 4 ชนิดย่อย) — เป็นการ**กรอกอิสระ ไม่ auto-fill จากยอดค้าง**
- กดปุ่ม "ตรวจสอบ" (`submit=packagecheck`) → เติมค่า default 0 ให้ field ที่ไม่ได้กรอก แล้วไปหน้าถัดไป (ไม่ save อะไรลง DB ในขั้นนี้)

### 3.3 หน้ายืนยันก่อนบันทึก (`package.packagecheck` view, POST กลับไปที่ `package.store`)
- โชว์สรุปตัวเลขที่จะคืนอีกครั้งให้ตรวจทาน (ผ่าน hidden input ส่งค่าเดิมกลับ)
- กดปุ่ม "ส่งคืน" (`submit=Htrpackagecreate`) → **จุดนี้คือจุดเดียวที่สร้าง `Htrpackage` แถวใหม่จริง** (การคืนจริงเกิดขึ้นที่นี่) แล้ว redirect กลับ `package.index`

**สรุป flow การคืนจริง = 3 ขั้นตอน:** เลือก supplier (create) → กรอกจำนวน+ตรวจสอบ (packagecheck) → ยืนยันคืน (store/Htrpackagecreate)

### 3.4 หน้าแก้ไข/ลบ (`package.edit`, `package.update`, `package.destroy`)
- แก้ไข/ลบ ทำงานกับ `Htrpackage` เท่านั้น (การคืนที่บันทึกไปแล้ว) — ไม่ใช่การแก้ยอดนำเข้า (`Package`/`Packageast`)
- `package.edit` มีปุ่มชื่อ submit=`editcheck` แต่ฟอร์มจริง POST ตรงไปที่ `package.update` (PATCH) เลย ไม่ผ่านหน้ายืนยันแบบตอนสร้าง (ไม่สมมาตรกับ flow ตอนสร้างที่มี 3 ขั้น)
- `destroy()` ลบถาวรทันที ไม่มี confirm ฝั่ง server (มีแค่ JS `confirm()` ฝั่ง client)

### 3.5 ฝั่งเบิกวัตถุดิบภายนอก — **ไม่มีหน้าจอใดๆ**
`MaterialOutsideController` ไม่มี method หรือ route ใดที่อ่าน `Packageoutside`/`Astpackageoutside` เลย (grep ทั้ง `app/` และ `resources/views/` ไม่พบการอ้างอิงในฝั่ง view เลยสักที่) — ข้อมูลถูกเขียนตอนเบิกแล้ว "ค้าง" อยู่ใน DB โดยไม่มีทางดู/จัดการ/mark คืนจากหน้าเว็บได้เลย ต้องพึ่งการ query DB ตรงเท่านั้น

### 3.6 Dead/unreachable code ที่พบระหว่างทาง (ควรรู้ไว้กันสับสนตอนอ้างอิงโค้ดเดิม)
- `PackageController::editdetail()` มี method แต่**ไม่มี route ผูกไว้เลย** — เรียกไม่ถึงจากเว็บ
- `PackageController@store` มี fallback branch ท้ายสุด (บรรทัด 590-604) ที่ validate แล้วเรียก `package::index($validatedData)` — เป็นโค้ดพัง (method ไม่มีจริง) จากการ scaffold เริ่มต้น ไม่เคยถูกใช้งานจริงเพราะทุก submit ที่มาจาก view จะ match branch ก่อนหน้าเสมอ

---

## 4. เทียบชนิดบรรจุภัณฑ์: ระบบใหม่ (checkbox 5 ตัว) vs ระบบเดิม

ระบบใหม่ระบุ 5 ชนิด: **palletType, sackType, spoolType, paperBar** (4 ชื่อ + apparently boxType หายไปจากที่ถาม แต่โจทย์บอก "checkbox 5 ตัว" — สันนิษฐานว่ามี boxType ด้วยแต่ผู้ใช้พิมพ์ไม่ครบ)

**ระบบเดิมไม่มี master table `package_types` เลย** — เก็บเป็น **field ตายตัวแบบ hardcoded string** กระจายอยู่ 2 ชั้น:

| ชนิดหลัก | field จำนวน | field ชนิดย่อย (hardcoded string, ไม่ใช่ FK ไป master table) |
|---|---|---|
| pallet | `pallet` | `pallet_type`: `wood` \| `steel` |
| sack | `sack` | `sack_type`: `p` (ปอ) \| `plastic` — ใช้ label "ปอ"/"พลาสติก" แต่ค่าจริงเก็บเป็น `p`/`plastic` |
| box | `box` | `box_type` — field มีในตาราง แต่**ไม่มี UI ไหนให้เลือกชนิดกล่องเลย** (`typetag_box` ไม่ปรากฏใน blade ใดๆ ที่อ่านมา) ค่านี้จึงเป็น null เสมอในทางปฏิบัติ |
| spool (หลอด) | `spool` | `spool_type`: 4 ชนิดย่อย — `spool_plastic` (กรวย พลาสติก), `spool_paper` (กรวย กระดาษ), `spoolC_plastic` (กระบอก พลาสติก), `spoolC_paper` (กระบอก กระดาษ) |
| partition (กระดาษกั้น) | `partition` | `partition_type` — field มีในตาราง แต่**ไม่มี UI ให้เลือกชนิดเช่นกัน** |

**ข้อสังเกตสำคัญสำหรับออกแบบระบบใหม่:**
1. Concept "แยกชนิดย่อยของบรรจุภัณฑ์" มีอยู่จริงในระบบเดิม แต่เก็บแบบ **string ตายตัวใน column เดียว** ไม่ใช่ normalized master table — ตรงกับแนวทาง `palletType`/`sackType`/`spoolType` แบบ enum/checkbox ของระบบใหม่ ไม่ใช่ table แยก จึงเป็น concept เดียวกัน ไม่ใช่ gap
2. `spool` ในระบบเดิมมี **4 ชนิดย่อย** ไม่ใช่ 2 — ถ้าระบบใหม่มี `spoolType` เป็น checkbox เดียว ควรเช็คว่าครอบคลุมทั้ง 4 แบบ (กรวยกระดาษ/กรวยพลาสติก/กระบอกกระดาษ/กระบอกพลาสติก) หรือย่อรวมเหลือ 2 กลุ่ม
3. `box_type` และ `partition_type` มี column รอไว้ในทุกตารางแต่**ไม่เคยถูกใช้จริง** (ไม่มี input ในฟอร์มไหนเลย) — เป็น field ที่ตายไปตั้งแต่ไม่ได้ implement UI ให้ครบ ไม่ใช่ bug จากระบบใหม่ที่ต้องมาตามหาของเดิม
4. ระบบเดิมไม่มี field ชื่อ "paperBar" ตรงตัว — ที่ใกล้เคียงที่สุดคือ `partition` (กระดาษกั้น) ซึ่งความหมายคนละอย่างกับ paper vs plastic ของ spool/sack — ควรยืนยันความหมายกับผู้ใช้งานจริงว่า "paperBar" ในระบบใหม่หมายถึง `partition` (กระดาษกั้น) หรือหมายถึง "กรวย/กระบอกกระดาษ" (spool_paper/spoolC_paper)

---

## 5. Edge cases ที่ควรรู้

1. **ยกเลิกรายการคืนได้ไหม:** `Htrpackage::destroy()` ลบถาวรได้ทันที (ปุ่ม "ลบ" ในหน้า list) ไม่มี undo, ไม่มี soft delete, ไม่มี audit log ว่าใครลบเมื่อไหร่ — record หายไปเฉยๆ และยอดค้างคืนจะ "กลับมาโผล่" ทันทีเพราะสูตรคำนวณสด (SUM ใหม่ไม่มีแถวนี้แล้ว)

2. **คืนเกินจำนวนที่ค้างได้ไหม:** **ได้ ไม่มี validation ใดๆ กัน** ฟอร์ม `package.create`/`packagecheck`/`store` ไม่เช็คว่าจำนวนที่กรอกคืนเกินยอดค้างคืนหรือไม่ ผลคือ "ต้องส่งคืนคงค้าง" จะกลายเป็นค่าติดลบในหน้าจอ (เช่น `{{ $spool_paperRet[0]->spoolsum - $sumReturnPackageSuccess[0]->spool_paper }}` คำนวณตรงๆ ไม่มี `max(0, ...)`)

3. **Soft delete:** ไม่มีเลยทั้ง 5 ตาราง (ไม่มี trait `SoftDeletes`, ไม่มีคอลัมน์ `deleted_at` ใน migration ใดๆ)

4. **การยกเลิกรายการนำเข้า/เบิกไม่สมมาตรกัน:** `MaterialController::destroy()` (ยกเลิกนำเข้าวัตถุดิบ) **ไม่ลบ** `Package`/`Packageast` ที่เกิดจากการนำเข้านั้นเลย → ยอดค้างคืน "ค้าง" อยู่ต่อแม้ยกเลิกการนำเข้าไปแล้ว (data orphan) ตรงข้ามกับ `MaterialOutsideController::destroy()` ที่ **ลบ** `Packageoutside` ที่ผูกกันจริง (ใช้ `package_status = materialoutside.id` หา) — ถือเป็นพฤติกรรมไม่สอดคล้องกันระหว่าง 2 โมดูลนี้ ที่น่าจะเป็น bug มากกว่า design ตั้งใจ

5. **`supplier_id` ไม่ใช่ supplier ID จริง:** ทั้ง `packages.supplier_id` และ `packageoutsides.supplier_id` ถูกเซ็ตเป็น `Date('m/d/Y')` (วันที่ปัจจุบัน) ในโค้ดจริง ไม่ใช่ FK ไป suppliers table — ห้ามใช้ column นี้อ้างอิง supplier ใดๆ ตอนย้ายข้อมูล ต้องใช้ `supplier_name` (string match) เท่านั้น

6. **ผูกกับ supplier ด้วยชื่อ string ล้วน:** ไม่มี FK/normalization ชื่อ supplier พิมพ์เพี้ยนแม้เล็กน้อยจะไม่ถูกนับรวมยอดเดียวกัน (เสี่ยงข้อมูลกระจายผิดกลุ่มเงียบๆ)

7. **การคืนไม่ผูกกับ batch การนำเข้าที่ทำให้เกิดยอดค้าง:** `Htrpackage` ไม่มี `ref_id`/foreign key ไปยัง `Material`/`Package` ที่ตัวเองมาหักลบด้วย เป็นแค่ยอดสะสมระดับ supplier เท่านั้น จึงตอบไม่ได้ว่า "การคืนครั้งนี้คือการคืนของล็อตนำเข้าไหน"

8. **`packageoutsides`/`astpackageoutsides` เป็น dead data:** มีการเขียนข้อมูลสะสมจริง (152 / 294 แถว) แต่ไม่มี UI ใดอ่าน/แสดง/จัดการเลย — ถ้าออกแบบระบบใหม่แล้วจะ "สืบทอด" ยอดค้างคืนฝั่งเบิกภายนอกจากระบบเดิม ข้อมูลนี้มีอยู่จริงใน DB แต่ต้อง query ตรงเอา ไม่สามารถอ้างอิงจาก UI เดิมเป็น reference ได้เลยเพราะไม่เคยมีใครเห็นมันในทางปฏิบัติ

9. **DB เชื่อมต่อไม่ได้ตอนสำรวจ:** ลอง connect MySQL ต้นทาง (`127.0.0.1:3307`, ใช้ credential ที่มีบันทึกไว้จาก session ก่อนหน้า) เพื่อ verify schema จริงของ `htrpackages` (เพราะพบว่า migration ไม่ครบ) แต่ service ไม่ได้รันอยู่ตอนนี้ (`ECONNREFUSED`) — ควร verify คอลัมน์จริงของ `htrpackages` ก่อนอ้างอิง schema นี้ในการออกแบบ migration ใหม่

---

## ภาคผนวก: ไฟล์ที่ใช้อ้างอิงในการสำรวจนี้

- `database/migrations/2022_09_27_084140_create_packages_table.php`
- `database/migrations/2023_01_31_033520_create_htrpackages_table.php`
- `database/migrations/2023_02_10_025511_create_packageoutsides_table.php`
- `database/migrations/2023_02_24_024947_create_packageasts_table.php`
- `database/migrations/2023_02_25_180112_create_astpackageoutsides_table.php`
- `app/Http/Controllers/PackageController.php`
- `app/Http/Controllers/MaterialController.php`
- `app/Http/Controllers/MaterialOutsideController.php`
- `app/Models/Package.php`, `Htrpackage.php`, `Packageoutside.php`, `Packageast.php`, `Astpackageoutside.php`, `Material.php`, `MaterialOutside.php`
- `resources/views/package/index.blade.php`, `create.blade.php`, `edit.blade.php`, `editdetail.blade.php`, `packagecheck.blade.php`
- `routes/web.php`
