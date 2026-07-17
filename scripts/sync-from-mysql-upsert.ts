/**
 * sync-from-mysql-upsert.ts
 *
 * Incremental sync: ดึงข้อมูลจาก MySQL (Laravel) มา upsert ใน PostgreSQL
 * - INSERT ... ON CONFLICT DO UPDATE SET ... (ไม่ TRUNCATE)
 * - อัปเดต row เดิมถ้าข้อมูลใน MySQL เปลี่ยน
 * - เพิ่ม row ใหม่จาก MySQL ที่ยังไม่มีใน PostgreSQL
 * - ไม่ลบ row ที่สร้างใหม่ใน PostgreSQL (fabricouts, ast_purchaseorders ฯลฯ)
 *
 * ใช้งาน:
 *   npx tsx scripts/sync-from-mysql-upsert.ts
 *   npx tsx scripts/sync-from-mysql-upsert.ts --dry-run
 *   npx tsx scripts/sync-from-mysql-upsert.ts --tables=customers,suppliers
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import { prisma } from '../src/lib/prisma'

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONLY_TABLES = args
  .find(a => a.startsWith('--tables='))
  ?.replace('--tables=', '')
  .split(',')
  .map(s => s.trim()) ?? []

const BATCH = 300

// ── Helpers ─────────────────────────────────────────────────────────────────
function d(v: any): Date { return v ? new Date(v) : new Date() }
function f(v: any): number | null { const n = parseFloat(v); return isNaN(n) ? null : n }
function i(v: any): number | null { const n = parseInt(v); return isNaN(n) ? null : n }
function s(v: any): string | null { return v != null && v !== '' ? String(v) : null }

function should(table: string) {
  return ONLY_TABLES.length === 0 || ONLY_TABLES.includes(table)
}

// ── Upsert helper ────────────────────────────────────────────────────────────
// cols: { field: key in the row object, col: actual PG column name }
// conflictCols: PG column names for ON CONFLICT (...)
// UPDATE SET is built for all cols not in conflictCols
interface ColDef { field: string; col: string }

// skipUpdateCols: PG column names to exclude from DO UPDATE SET (e.g. 'id' when conflicting on a different unique key)
async function upsertBatch<T extends Record<string, any>>(
  label: string,
  rows: T[],
  table: string,
  cols: ColDef[],
  conflictCols: string[],
  skipUpdateCols: string[] = [],
) {
  if (DRY_RUN) { console.log(`  [dry-run] ${label}: ${rows.length} rows`); return }
  if (rows.length === 0) { console.log(`  ✓ ${label}: 0 rows`); return }

  const excludeFromUpdate = new Set([...conflictCols, ...skipUpdateCols])
  const updateCols = cols.filter(c => !excludeFromUpdate.has(c.col))
  const colList = cols.map(c => `"${c.col}"`).join(', ')
  const conflictList = conflictCols.map(c => `"${c}"`).join(', ')
  const updateSet = updateCols.map(c => `"${c.col}" = EXCLUDED."${c.col}"`).join(', ')

  let done = 0
  for (let offset = 0; offset < rows.length; offset += BATCH) {
    const batch = rows.slice(offset, offset + BATCH)
    const params: any[] = []

    const valueParts = batch.map(row => {
      const start = params.length + 1
      cols.forEach(({ field }) => params.push(row[field] ?? null))
      return `(${cols.map((_, idx) => `$${start + idx}`).join(', ')})`
    })

    const sql = `INSERT INTO "${table}" (${colList}) VALUES ${valueParts.join(', ')} ON CONFLICT (${conflictList}) DO UPDATE SET ${updateSet}`
    await prisma.$executeRawUnsafe(sql, ...params)
    done += batch.length
    process.stdout.write(`\r  ${label}: ${done}/${rows.length}...`)
  }
  console.log(`\r  ✓ ${label}: ${rows.length} rows`)
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const mysqlUrl = process.env.MYSQL_SOURCE_URL
  if (!mysqlUrl) throw new Error('MYSQL_SOURCE_URL not set in .env')

  console.log(DRY_RUN ? '🔍 DRY RUN — PG จะไม่ถูกแก้ไข\n' : '🔄 เริ่ม upsert sync MySQL → PostgreSQL\n')

  const db = await mysql.createConnection(mysqlUrl)
  console.log('✅ เชื่อมต่อ MySQL สำเร็จ\n')

  // ── 1. Pull ข้อมูลทั้งหมดจาก MySQL ─────────────────────────────────────
  console.log('📥 ดึงข้อมูลจาก MySQL...')

  const [customers]:      any = await db.query('SELECT * FROM customers')
  const [coordinators]:   any = await db.query('SELECT * FROM coordinators')
  const [suppliers]:      any = await db.query('SELECT * FROM suppliers')
  const [orders]:         any = await db.query('SELECT * FROM ast_purchaseorders ORDER BY id ASC')
  const [structs]:        any = await db.query('SELECT * FROM fabric_aststructures')
  const [fabricAsts]:     any = await db.query('SELECT * FROM fabric_asts')
  const [stocks]:         any = await db.query('SELECT * FROM stockfabrics ORDER BY id ASC')
  const [fouts]:          any = await db.query('SELECT * FROM fabricouts ORDER BY id ASC')
  const [empMaterials]:   any = await db.query('SELECT * FROM empmaterials')
  const [materials]:      any = await db.query('SELECT * FROM materials ORDER BY id ASC')
  const [materialStores]: any = await db.query('SELECT * FROM materialstores ORDER BY id ASC')

  // map: MySQL order.id → purchaseOrder string (used as FK for structures/fabricAsts)
  const idToPo = new Map<number, string>(
    orders.map((o: any) => [Number(o.id), String(o.purchaseOrder)])
  )

  console.log(`  customers:      ${customers.length}`)
  console.log(`  coordinators:   ${coordinators.length}`)
  console.log(`  suppliers:      ${suppliers.length}`)
  console.log(`  orders:         ${orders.length}`)
  console.log(`  structures:     ${structs.length}`)
  console.log(`  fabricAsts:     ${fabricAsts.length}`)
  console.log(`  stockFabrics:   ${stocks.length}`)
  console.log(`  fabricOuts:     ${fouts.length}`)
  console.log(`  empMaterials:   ${empMaterials.length}`)
  console.log(`  materials:      ${materials.length}`)
  console.log(`  materialStores: ${materialStores.length}`)
  console.log('')

  if (DRY_RUN) {
    console.log('✅ Dry run เสร็จ — ไม่มีการแก้ไขข้อมูลใน PostgreSQL')
    await db.end()
    await prisma.$disconnect()
    return
  }

  // ── 2. Upsert ────────────────────────────────────────────────────────────

  if (should('customers')) {
    await upsertBatch(
      'customers',
      customers.map((c: any) => ({
        id: Number(c.id), name: c.name ?? '', tax: s(c.tax), address: s(c.address),
        tel: s(c.tel), email: s(c.email), type: s(c.type), coor: s(c.coor),
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
      })),
      'customers',
      [
        { field: 'id',        col: 'id'         },
        { field: 'name',      col: 'name'       },
        { field: 'tax',       col: 'tax'        },
        { field: 'address',   col: 'address'    },
        { field: 'tel',       col: 'tel'        },
        { field: 'email',     col: 'email'      },
        { field: 'type',      col: 'type'       },
        { field: 'coor',      col: 'coor'       },
        { field: 'createdAt', col: 'created_at' },
        { field: 'updatedAt', col: 'updated_at' },
      ],
      ['id'],
    )
  }

  if (should('coordinators')) {
    await upsertBatch(
      'coordinators',
      coordinators.map((c: any) => ({
        id: Number(c.id), tax: c.tax ?? '', name: c.name ?? '',
        jobTitle: s(c.jobTitle), tel: s(c.tel),
      })),
      'coordinators',
      [
        { field: 'id',       col: 'id'        },
        { field: 'tax',      col: 'tax'       },
        { field: 'name',     col: 'name'      },
        { field: 'jobTitle', col: 'job_title' }, // @map("job_title")
        { field: 'tel',      col: 'tel'       },
      ],
      ['id'],
    )
  }

  if (should('suppliers')) {
    await upsertBatch(
      'suppliers',
      suppliers.map((c: any) => ({
        id: Number(c.id), name: c.name ?? '', tax: s(c.tax), address: s(c.address),
        tel: s(c.tel), email: s(c.email), type: s(c.type), coor: s(c.coor),
        createdAt: c.created_at ? new Date(c.created_at) : new Date(),
        updatedAt: c.updated_at ? new Date(c.updated_at) : new Date(),
      })),
      'suppliers',
      [
        { field: 'id',        col: 'id'         },
        { field: 'name',      col: 'name'       },
        { field: 'tax',       col: 'tax'        },
        { field: 'address',   col: 'address'    },
        { field: 'tel',       col: 'tel'        },
        { field: 'email',     col: 'email'      },
        { field: 'type',      col: 'type'       },
        { field: 'coor',      col: 'coor'       },
        { field: 'createdAt', col: 'created_at' },
        { field: 'updatedAt', col: 'updated_at' },
      ],
      ['id'],
    )
  }

  if (should('orders')) {
    // deduplicate by purchaseOrder (keep last = highest id) before upsert
    // เพราะ ON CONFLICT DO UPDATE ไม่รับ duplicate conflict key ภายใน batch เดียวกัน
    const poMap = new Map<string, any>()
    for (const o of orders) poMap.set(String(o.purchaseOrder), o)
    const dedupedOrders = Array.from(poMap.values())
    if (dedupedOrders.length < orders.length)
      console.log(`  ⚠ orders: deduped ${orders.length - dedupedOrders.length} duplicate purchaseOrder rows`)

    const orderData = dedupedOrders.map((o: any) => ({
      id:              Number(o.id),
      vat:             o.vat ?? 'SO',
      purchaseOrder:   String(o.purchaseOrder),
      po:              s(o.po),
      emp:             s(o.emp),
      customerName:    s(o.customerName),
      fabricId:        s(o.fabricId),
      fabricPattern:   s(o.fabricPattern),
      fabricStructure: s(o.fabricStructure),
      orderSumYard:    f(o.orderSumYard),
      orderSumM:       f(o.orderSumM),
      fabricSPY:       f(o.fabricSPY),
      fabricSpP:       f(o.fabricSpP),
      priceYard:       f(o.priceYard),
      priceM:          f(o.priceM),
      discountP:       f(o.discountP),
      discountYard:    f(o.discountYard),
      commission:      f(o.commission),
      createDate:      d(o.createDate),
      status:          s(o.status),
      deadline:        s(o.deadline),
      payment:         s(o.payment),
      createdAt:       o.created_at ? new Date(o.created_at) : new Date(),
      updatedAt:       o.updated_at ? new Date(o.updated_at) : new Date(),
    }))
    await upsertBatch('orders', orderData, 'ast_purchaseorders', [
      { field: 'id',              col: 'id'              },
      { field: 'vat',             col: 'vat'             },
      { field: 'purchaseOrder',   col: 'purchaseOrder'   },
      { field: 'po',              col: 'po'              },
      { field: 'emp',             col: 'emp'             },
      { field: 'customerName',    col: 'customerName'    },
      { field: 'fabricId',        col: 'fabricId'        },
      { field: 'fabricPattern',   col: 'fabricPattern'   },
      { field: 'fabricStructure', col: 'fabricStructure' },
      { field: 'orderSumYard',    col: 'orderSumYard'    },
      { field: 'orderSumM',       col: 'order_sum_m'     }, // @map
      { field: 'fabricSPY',       col: 'fabric_spy'      }, // @map
      { field: 'fabricSpP',       col: 'fabric_sp_p'     }, // @map
      { field: 'priceYard',       col: 'price_yard'      }, // @map
      { field: 'priceM',          col: 'price_m'         }, // @map
      { field: 'discountP',       col: 'discount_p'      }, // @map
      { field: 'discountYard',    col: 'discount_yard'   }, // @map
      { field: 'commission',      col: 'commission'      },
      { field: 'createDate',      col: 'create_date'     }, // @map
      { field: 'status',          col: 'status'          },
      { field: 'deadline',        col: 'deadline'        },
      { field: 'payment',         col: 'payment'         },
      { field: 'createdAt',       col: 'created_at'      }, // @map
      { field: 'updatedAt',       col: 'updated_at'      }, // @map
    // conflict บน purchaseOrder (logical unique key), skip update id + created_at
    ], ['purchaseOrder'], ['id', 'created_at'])
  }

  if (should('structures')) {
    const structData: any[] = []
    for (const s_ of structs) {
      const po = idToPo.get(Number(s_.purchaseOrder))
      if (!po) continue
      structData.push({
        purchaseOrder: po,
        yarnHType:   s(s_.yarnHType1),
        yarnHType2:  s(s_.yarnHType2),
        subNameH1:   s(s_.subNameH1),
        subNameH2:   s(s_.subNameH2),
        yarnHCount1: s(s_.yarnHCount1),
        yarnHCount2: s(s_.yarnHCount2),
        yarnHRatio1: s(s_.yarnHRatio1),
        yarnHRatio2: s(s_.yarnHRatio2),
        yarnWType:   s(s_.yarnWType1),
        yarnWType2:  s(s_.yarnWType2),
        yarnWType3:  s(s_.yarnWType3),
        yarnWType4:  s(s_.yarnWType4),
        subNameW1:   s(s_.subNameW1),
        subNameW2:   s(s_.subNameW2),
        subNameW3:   s(s_.subNameW3),
        subNameW4:   s(s_.subNameW4),
        yarnWCount1: s(s_.yarnWCount1),
        yarnWCount2: s(s_.yarnWCount2),
        yarnWCount3: s(s_.yarnWCount3),
        yarnWCount4: s(s_.yarnWCount4),
        yarnWRatio1: s(s_.yarnWRatio1),
        yarnWRatio2: s(s_.yarnWRatio2 ?? s_.weftRatio2),
        yarnWRatio3: s(s_.yarnWRatio3),
        yarnWRatio4: s(s_.yarnWRatio4),
        createdAt:   s_.created_at ? new Date(s_.created_at) : new Date(),
        updatedAt:   s_.updated_at ? new Date(s_.updated_at) : new Date(),
      })
    }
    // deduplicate by purchaseOrder (keep last) — same reason as orders
    const structMap = new Map<string, any>()
    for (const r of structData) structMap.set(r.purchaseOrder, r)
    const dedupedStructs = Array.from(structMap.values())
    if (dedupedStructs.length < structData.length)
      console.log(`  ⚠ structures: deduped ${structData.length - dedupedStructs.length} duplicate purchaseOrder rows`)

    // conflict on purchaseOrder (UNIQUE); id omitted — auto-assigned for new rows
    await upsertBatch('structures', dedupedStructs, 'fabric_aststructures', [
      { field: 'purchaseOrder', col: 'purchaseOrder'  },
      { field: 'yarnHType',    col: 'yarnHType'       },
      { field: 'yarnHType2',   col: 'yarn_h_type2'    }, // @map
      { field: 'subNameH1',    col: 'sub_name_h1'     }, // @map
      { field: 'subNameH2',    col: 'sub_name_h2'     }, // @map
      { field: 'yarnHCount1',  col: 'yarnHCount1'     },
      { field: 'yarnHCount2',  col: 'yarnHCount2'     },
      { field: 'yarnHRatio1',  col: 'yarnHRatio1'     },
      { field: 'yarnHRatio2',  col: 'yarnHRatio2'     },
      { field: 'yarnWType',    col: 'yarnWType'        },
      { field: 'yarnWType2',   col: 'yarn_w_type2'    }, // @map
      { field: 'yarnWType3',   col: 'yarn_w_type3'    }, // @map
      { field: 'yarnWType4',   col: 'yarn_w_type4'    }, // @map
      { field: 'subNameW1',    col: 'sub_name_w1'     }, // @map
      { field: 'subNameW2',    col: 'sub_name_w2'     }, // @map
      { field: 'subNameW3',    col: 'sub_name_w3'     }, // @map
      { field: 'subNameW4',    col: 'sub_name_w4'     }, // @map
      { field: 'yarnWCount1',  col: 'yarnWCount1'     },
      { field: 'yarnWCount2',  col: 'yarnWCount2'     },
      { field: 'yarnWCount3',  col: 'yarn_w_count3'   }, // @map
      { field: 'yarnWCount4',  col: 'yarn_w_count4'   }, // @map
      { field: 'yarnWRatio1',  col: 'yarnWRatio1'     },
      { field: 'yarnWRatio2',  col: 'yarnWRatio2'     },
      { field: 'yarnWRatio3',  col: 'yarn_w_ratio3'   }, // @map
      { field: 'yarnWRatio4',  col: 'yarn_w_ratio4'   }, // @map
      { field: 'createdAt',    col: 'created_at'      }, // @map
      { field: 'updatedAt',    col: 'updated_at'      }, // @map
    ], ['purchaseOrder'], ['created_at'])
  }

  if (should('fabricAsts')) {
    const faData: any[] = []
    let faSkipped = 0
    for (const fa of fabricAsts) {
      const po = idToPo.get(Number(fa.purchaseOrder))
      if (!po) { faSkipped++; continue }
      faData.push({
        purchaseOrder: po,
        vat:        s(fa.vat),
        yarnHCount: s(fa.yarnHCount ?? fa.yarn_h_count),
        fabricW:    s(fa.fabricW    ?? fa.fabric_w),
        phewNumber: s(fa.phewNumber ?? fa.phew_number),
        phewW:      s(fa.phewW      ?? fa.phew_w),
        stackType:  s(fa.stackType  ?? fa.stack_type),
        payment:    s(fa.payment),
        createdAt:  fa.created_at ? new Date(fa.created_at) : new Date(),
        updatedAt:  fa.updated_at ? new Date(fa.updated_at) : new Date(),
      })
    }
    if (faSkipped > 0) console.log(`  ⚠ fabricAsts skipped ${faSkipped} rows (no matching order)`)
    // deduplicate by purchaseOrder (keep last)
    const faMap = new Map<string, any>()
    for (const r of faData) faMap.set(r.purchaseOrder, r)
    const dedupedFa = Array.from(faMap.values())
    if (dedupedFa.length < faData.length)
      console.log(`  ⚠ fabricAsts: deduped ${faData.length - dedupedFa.length} duplicate purchaseOrder rows`)

    // conflict on purchaseOrder (UNIQUE); id omitted — auto-assigned for new rows
    await upsertBatch('fabricAsts', dedupedFa, 'fabric_asts', [
      { field: 'purchaseOrder', col: 'purchaseOrder' },
      { field: 'vat',           col: 'vat'           },
      { field: 'yarnHCount',    col: 'yarn_h_count'  }, // @map
      { field: 'fabricW',       col: 'fabric_w'      }, // @map
      { field: 'phewNumber',    col: 'phewNumber'    },
      { field: 'phewW',         col: 'phewW'         },
      { field: 'stackType',     col: 'stack_type'    }, // @map
      { field: 'payment',       col: 'payment'       },
      { field: 'createdAt',     col: 'created_at'    }, // @map
      { field: 'updatedAt',     col: 'updated_at'    }, // @map
    ], ['purchaseOrder'], ['created_at'])
  }

  if (should('stockFabrics')) {
    const stockData = stocks.map((f_: any) => ({
      id:            Number(f_.id),
      refId:         f_.refId ?? '',
      emp:           s(f_.emp),
      fabricStruct:  s(f_.fabricStruct),
      fabricPattern: s(f_.fabricPattern),
      fabricW:       s(f_.fabricW),
      fabricCode:    s(f_.fabricId),
      fold:          i(f_.fold),
      sumYard:       f(f_.sumYard),
      customer:      s(f_.customer),
      createDate:    d(f_.createDate ?? f_.create_date),
      createdAt:     f_.created_at ? new Date(f_.created_at) : new Date(),
      updatedAt:     f_.updated_at ? new Date(f_.updated_at) : new Date(),
    }))
    await upsertBatch('stockFabrics', stockData, 'stockfabrics', [
      { field: 'id',            col: 'id'            },
      { field: 'refId',         col: 'refId'         },
      { field: 'emp',           col: 'emp'           },
      { field: 'fabricStruct',  col: 'fabricStruct'  },
      { field: 'fabricPattern', col: 'fabricPattern' },
      { field: 'fabricW',       col: 'fabricW'       },
      { field: 'fabricCode',    col: 'fabricCode'    },
      { field: 'fold',          col: 'fold'          },
      { field: 'sumYard',       col: 'sumYard'       },
      { field: 'customer',      col: 'customer'      },
      { field: 'createDate',    col: 'createDate'    },
      { field: 'createdAt',     col: 'created_at'    }, // @map
      { field: 'updatedAt',     col: 'updated_at'    }, // @map
    ], ['id'], ['created_at'])
  }

  if (should('fabricOuts')) {
    // ON CONFLICT (id): row ใหม่ที่สร้างจากระบบ PG มี id > max MySQL id → ไม่ถูกแตะ
    const pgOrderIds = new Set(
      (await prisma.astPurchaseOrder.findMany({ select: { id: true } })).map(o => o.id)
    )
    const foutData = fouts.map((f_: any) => {
      const rawOrderId = i(f_.order_id ?? f_.orderId)
      return {
        id:                 Number(f_.id),
        refId:              f_.refId ?? '',
        no:                 s(f_.no),
        vatType:            f_.vatType ?? 'A',
        vatNo:              i(f_.vatNo) ?? 1001,
        fold:               i(f_.fold) ?? 1,
        sumYard:            f(f_.sumYard) ?? 0,
        fabricStruct:       s(f_.fabricStruct),
        fabricPattern:      s(f_.fabricPattern),
        fabricW:            s(f_.fabricW),
        customerName:       s(f_.customerName),
        receiveName:        s(f_.receiveName),
        altPurchaseOrder:   s(f_.customerReplace ?? f_.customer_replace),
        purchaseOrder:      s(f_.purchase_order ?? f_.purchaseOrder),
        orderId:            (rawOrderId && pgOrderIds.has(rawOrderId)) ? rawOrderId : null,
        createDate:         d(f_.createDate ?? f_.create_date),
        stockCustomer:      s(f_.stockCustomer),
        stockFabricStruct:  s(f_.stockFabricStruct),
        stockFabricPattern: s(f_.stockFabricPattern),
        stockFabricW:       s(f_.stockFabricW),
        createdAt:          f_.created_at ? new Date(f_.created_at) : new Date(),
        updatedAt:          f_.updated_at ? new Date(f_.updated_at) : new Date(),
      }
    })
    await upsertBatch('fabricOuts', foutData, 'fabricouts', [
      { field: 'id',                 col: 'id'                 },
      { field: 'refId',              col: 'refId'              },
      { field: 'no',                 col: 'no'                 },
      { field: 'vatType',            col: 'vatType'            },
      { field: 'vatNo',              col: 'vatNo'              },
      { field: 'fold',               col: 'fold'               },
      { field: 'sumYard',            col: 'sumYard'            },
      { field: 'fabricStruct',       col: 'fabricStruct'       },
      { field: 'fabricPattern',      col: 'fabricPattern'      },
      { field: 'fabricW',            col: 'fabricW'            },
      { field: 'customerName',       col: 'customerName'       },
      { field: 'receiveName',        col: 'receiveName'        },
      { field: 'altPurchaseOrder',   col: 'altPurchaseOrder'   },
      { field: 'purchaseOrder',      col: 'purchaseOrder'      },
      { field: 'orderId',            col: 'orderId'            },
      { field: 'createDate',         col: 'createDate'         },
      { field: 'stockCustomer',      col: 'stockCustomer'      },
      { field: 'stockFabricStruct',  col: 'stockFabricStruct'  },
      { field: 'stockFabricPattern', col: 'stockFabricPattern' },
      { field: 'stockFabricW',       col: 'stockFabricW'       },
      { field: 'createdAt',          col: 'created_at'         }, // @map
      { field: 'updatedAt',          col: 'updated_at'         }, // @map
    ], ['id'], ['created_at'])
  }

  if (should('materialCoordinators')) {
    const coordData = empMaterials.map((r: any) => ({
      id:         Number(r.id),
      name:       r.name ?? '',
      tel:        s(r.tel),
      department: s(r.department),
      createdAt:  r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt:  r.updated_at ? new Date(r.updated_at) : new Date(),
      deletedAt:  r.deleted_at ? new Date(r.deleted_at) : null,
    }))
    await upsertBatch('materialCoordinators', coordData, 'materialcoordinators', [
      { field: 'id',         col: 'id'         },
      { field: 'name',       col: 'name'       },
      { field: 'tel',        col: 'tel'        },
      { field: 'department', col: 'department' },
      { field: 'createdAt',  col: 'createdAt'  },
      { field: 'updatedAt',  col: 'updatedAt'  },
      { field: 'deletedAt',  col: 'deletedAt'  },
    ], ['id'])
  }

  if (should('materials')) {
    const materialData = materials.map((r: any) => ({
      id:              Number(r.id),
      lot:             r.lot ?? '',
      spool:           i(r.spool) ?? 0,
      yarnType:        r.yarnType ?? r.yarn_type ?? '',
      supplierName:    r.supplierName ?? r.supplier_name ?? '',
      weightKgNet:     f(r.weight_kg_net)     ?? 0,
      weightKgSum:     f(r.weight_kg_sum)     ?? 0,
      weightKgPackage: f(r.weight_kg_package) ?? 0,
      pallet:          i(r.pallet)            ?? null,
      box:             i(r.box)               ?? null,
      sack:            i(r.sack)              ?? null,
      weightPNet:      f(r.weight_p_net)      ?? null,
      weightPSum:      f(r.weight_p_sum)      ?? null,
      weightPPackage:  f(r.weight_p_package)  ?? null,
      averageKg:       f(r.average_kg)        ?? null,
      averageP:        f(r.average_p)         ?? null,
      emp:             s(r.emp),
      importStatus:    r.importStatus ?? r.import_status ?? 'completed',
      note:            s(r.note),
      createdAt:       r.created_at ? new Date(r.created_at) : new Date(),
      updatedAt:       r.updated_at ? new Date(r.updated_at) : new Date(),
      deletedAt:       r.deleted_at ? new Date(r.deleted_at) : null,
    }))
    await upsertBatch('materials', materialData, 'materials', [
      { field: 'id',              col: 'id'              },
      { field: 'lot',             col: 'lot'             },
      { field: 'spool',           col: 'spool'           },
      { field: 'yarnType',        col: 'yarnType'        },
      { field: 'supplierName',    col: 'supplierName'    },
      { field: 'weightKgNet',     col: 'weightKgNet'     },
      { field: 'weightKgSum',     col: 'weightKgSum'     },
      { field: 'weightKgPackage', col: 'weightKgPackage' },
      { field: 'pallet',          col: 'pallet'          },
      { field: 'box',             col: 'box'             },
      { field: 'sack',            col: 'sack'            },
      { field: 'weightPNet',      col: 'weightPNet'      },
      { field: 'weightPSum',      col: 'weightPSum'      },
      { field: 'weightPPackage',  col: 'weightPPackage'  },
      { field: 'averageKg',       col: 'averageKg'       },
      { field: 'averageP',        col: 'averageP'        },
      { field: 'emp',             col: 'emp'             },
      { field: 'importStatus',    col: 'importStatus'    },
      { field: 'note',            col: 'note'            },
      { field: 'createdAt',       col: 'createdAt'       },
      { field: 'updatedAt',       col: 'updatedAt'       },
      { field: 'deletedAt',       col: 'deletedAt'       },
    ], ['id'])
  }

  if (should('materialRequisitions')) {
    const matLookup = new Map<string, number>()
    for (const m of materials) {
      const key = `${m.lot ?? ''}|${m.yarnType ?? ''}|${m.supplierName ?? ''}`
      matLookup.set(key, Number(m.id))
    }

    let matched = 0, unmatched = 0
    const reqData = materialStores.map((r: any) => {
      const key = `${r.lot ?? ''}|${r.yarnType ?? ''}|${r.supplierName ?? ''}`
      const mid = matLookup.get(key) ?? null
      if (mid) matched++; else unmatched++
      return {
        id:              Number(r.id),
        withdrawId:      r.withdrawId ?? '',
        materialId:      mid,
        department:      r.department ?? '',
        spool:           i(r.spool) ?? 0,
        weightWithdrawn: f(r.weight_kg_net) ?? 0,
        note:            null as string | null,
        createdAt:       r.created_at ? new Date(r.created_at) : new Date(),
        updatedAt:       r.updated_at ? new Date(r.updated_at) : new Date(),
        deletedAt:       null as Date | null,
      }
    })
    console.log(`  materialRequisitions: ${matched} matched, ${unmatched} unmatched (materialId=null)`)
    await upsertBatch('materialRequisitions', reqData, 'materialrequisitions', [
      { field: 'id',              col: 'id'              },
      { field: 'withdrawId',      col: 'withdrawId'      },
      { field: 'materialId',      col: 'materialId'      },
      { field: 'department',      col: 'department'      },
      { field: 'spool',           col: 'spool'           },
      { field: 'weightWithdrawn', col: 'weightWithdrawn' },
      { field: 'note',            col: 'note'            },
      { field: 'createdAt',       col: 'createdAt'       },
      { field: 'updatedAt',       col: 'updatedAt'       },
      { field: 'deletedAt',       col: 'deletedAt'       },
    ], ['id'])
  }

  // ── 3. Reset sequences ────────────────────────────────────────────────────
  // จำเป็นเมื่อ import id โดยตรงจาก MySQL — sequence ต้องรู้ว่า max id ไปถึงไหนแล้ว
  console.log('\n🔢 Resetting PostgreSQL sequences...')
  const seqTables = [
    { table: 'customers',            col: 'id' },
    { table: 'coordinators',         col: 'id' },
    { table: 'suppliers',            col: 'id' },
    { table: 'ast_purchaseorders',   col: 'id' },
    { table: 'fabric_asts',          col: 'id' },
    { table: 'fabric_aststructures', col: 'id' },
    { table: 'stockfabrics',         col: 'id' },
    { table: 'fabricouts',           col: 'id' },
    { table: 'materials',            col: 'id' },
    { table: 'materialrequisitions', col: 'id' },
    { table: 'materialcoordinators', col: 'id' },
  ]
  for (const { table, col } of seqTables) {
    await prisma.$executeRawUnsafe(`
      SELECT setval(
        pg_get_serial_sequence('"${table}"', '${col}'),
        COALESCE((SELECT MAX("${col}") FROM "${table}"), 1)
      )
    `)
  }
  console.log('  ✓ Sequences reset\n')

  // ── 4. Summary ──────────────────────────────────────────────────────────
  console.log('📊 สรุปข้อมูลใน PostgreSQL หลัง upsert sync:')
  const [c, co, su, o, fs, fa, sf, fo, mat, matReq] = await Promise.all([
    prisma.customer.count(),
    prisma.coordinator.count(),
    prisma.supplier.count(),
    prisma.astPurchaseOrder.count(),
    prisma.fabricAstStructure.count(),
    prisma.fabricAst.count(),
    prisma.stockFabric.count(),
    prisma.fabricOut.count(),
    prisma.material.count(),
    prisma.materialRequisition.count(),
  ])
  console.log(`
  Customers:            ${c}
  Coordinators:         ${co}
  Suppliers:            ${su}
  Purchase Orders:      ${o}
  Fab Structures:       ${fs}
  Fab Asts:             ${fa}
  Stock Fabrics:        ${sf}
  Fabric Outs:          ${fo}
  Materials:            ${mat}
  Material Requisitions:${matReq}
  `)

  await db.end()
  await prisma.$disconnect()
  console.log('✅ Upsert sync เสร็จสมบูรณ์!')
}

main().catch(e => {
  console.error('\n❌ Error:', e.message)
  process.exit(1)
})
