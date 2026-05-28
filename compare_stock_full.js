/**
 * compare_stock_full.js
 * Full comparison of stockfabrics between MySQL (old) and PostgreSQL (new)
 * Groups by customer + fabricCode/fabricId, compares fold count and total yards.
 */
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/ast_new';
const { PrismaClient } = require('./src/generated/prisma/client/client.js');
const { PrismaPg }     = require('./node_modules/@prisma/adapter-pg/dist/index.js');
const mysql2           = require('./node_modules/mysql2/promise.js');

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma    = new PrismaClient({ adapter: pgAdapter });

const MYSQL_CONFIG = { host:'127.0.0.1', port:3307, user:'astrobot34', password:'ast150831', database:'ast' };

async function main() {
  console.log('='.repeat(90));
  console.log('FULL STOCK COMPARISON: MySQL (old) vs PostgreSQL (new)');
  console.log('='.repeat(90));

  // ── MySQL: all stockfabrics grouped by customer+fabricId ─────────────────
  let db;
  try {
    db = await mysql2.createConnection(MYSQL_CONFIG);
  } catch (e) {
    console.error('MySQL ไม่พร้อม:', e.message);
    await prisma.$disconnect();
    return;
  }

  const [mysqlRows] = await db.execute(`
    SELECT
      COALESCE(customer, 'AST') AS customer,
      fabricId AS fabricCode,
      COUNT(*) AS cnt,
      ROUND(SUM(sumYard), 0) AS yards
    FROM stockfabrics
    WHERE sumYard > 0
    GROUP BY COALESCE(customer, 'AST'), fabricId
    ORDER BY COALESCE(customer, 'AST'), fabricId
  `);

  // ── PostgreSQL: all stockfabrics grouped by customer+fabricCode ──────────
  const pgRows = await prisma.$queryRawUnsafe(`
    SELECT
      COALESCE(customer, 'AST') AS customer,
      "fabricCode",
      COUNT(*)::int AS cnt,
      ROUND(SUM("sumYard")::numeric, 0) AS yards
    FROM stockfabrics
    WHERE deleted_at IS NULL AND "sumYard" > 0
    GROUP BY COALESCE(customer, 'AST'), "fabricCode"
    ORDER BY COALESCE(customer, 'AST'), "fabricCode"
  `);

  // ── Build lookup maps ────────────────────────────────────────────────────
  const mysqlMap = new Map();
  for (const r of mysqlRows) {
    const key = r.customer + '||' + r.fabricCode;
    mysqlMap.set(key, { cnt: Number(r.cnt), yards: Number(r.yards || 0) });
  }

  const pgMap = new Map();
  for (const r of pgRows) {
    const key = r.customer + '||' + r.fabricCode;
    pgMap.set(key, { cnt: Number(r.cnt), yards: Number(r.yards || 0) });
  }

  // ── Union of all keys ────────────────────────────────────────────────────
  const allKeys = new Set([...mysqlMap.keys(), ...pgMap.keys()]);
  const sorted  = [...allKeys].sort();

  // Categorise
  const matched   = [];
  const diffRows  = [];
  const mysqlOnly = [];
  const pgOnly    = [];

  for (const key of sorted) {
    const [customer, fabricCode] = key.split('||');
    const m = mysqlMap.get(key);
    const p = pgMap.get(key);

    if (m && p) {
      if (m.cnt === p.cnt && m.yards === p.yards) {
        matched.push({ customer, fabricCode, m, p });
      } else {
        diffRows.push({ customer, fabricCode, m, p });
      }
    } else if (m && !p) {
      mysqlOnly.push({ customer, fabricCode, m });
    } else {
      pgOnly.push({ customer, fabricCode, p });
    }
  }

  // ── Print differences ───────────────────────────────────────────────────
  if (diffRows.length > 0) {
    console.log(`\n${'='.repeat(90)}`);
    console.log(`✗ ข้อมูลไม่ตรงกัน (${diffRows.length} รายการ)`);
    console.log('='.repeat(90));
    console.log(
      'ลูกค้า'.padEnd(20) + 'รหัสผ้า'.padEnd(22) +
      'M-พับ'.padStart(7) + 'M-หลา'.padStart(10) +
      'PG-พับ'.padStart(8) + 'PG-หลา'.padStart(10) +
      '  ∆พับ'.padStart(7) + '  ∆หลา'.padStart(8)
    );
    console.log('-'.repeat(90));
    for (const r of diffRows) {
      const dc = r.p.cnt   - r.m.cnt;
      const dy = r.p.yards - r.m.yards;
      console.log(
        r.customer.slice(0,19).padEnd(20) +
        r.fabricCode.slice(0,21).padEnd(22) +
        String(r.m.cnt).padStart(7)   + String(r.m.yards).padStart(10) +
        String(r.p.cnt).padStart(8)   + String(r.p.yards).padStart(10) +
        String((dc >= 0 ? '+' : '') + dc).padStart(7) +
        String((dy >= 0 ? '+' : '') + dy).padStart(8)
      );
    }
  }

  if (mysqlOnly.length > 0) {
    console.log(`\n${'='.repeat(90)}`);
    console.log(`⚠ มีใน MySQL แต่ไม่มีใน PG (${mysqlOnly.length} รายการ)`);
    console.log('='.repeat(90));
    for (const r of mysqlOnly) {
      console.log(`  ${r.customer.slice(0,19).padEnd(20)} ${r.fabricCode.padEnd(22)} ${String(r.m.cnt).padStart(5)} พับ  ${String(r.m.yards).padStart(8)} หลา`);
    }
  }

  if (pgOnly.length > 0) {
    console.log(`\n${'='.repeat(90)}`);
    console.log(`⚠ มีใน PG แต่ไม่มีใน MySQL (${pgOnly.length} รายการ)`);
    console.log('='.repeat(90));
    for (const r of pgOnly) {
      console.log(`  ${r.customer.slice(0,19).padEnd(20)} ${r.fabricCode.padEnd(22)} ${String(r.p.cnt).padStart(5)} พับ  ${String(r.p.yards).padStart(8)} หลา`);
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(90)}`);
  console.log('สรุปผล');
  console.log('='.repeat(90));
  console.log(`  ✓ ตรงกัน         : ${matched.length} รายการ`);
  console.log(`  ✗ ไม่ตรง         : ${diffRows.length} รายการ`);
  console.log(`  ⚠ MySQL-only     : ${mysqlOnly.length} รายการ`);
  console.log(`  ⚠ PG-only        : ${pgOnly.length} รายการ`);
  console.log(`  รวม MySQL        : ${mysqlRows.length} กลุ่ม`);
  console.log(`  รวม PG           : ${pgRows.length} กลุ่ม`);

  const totalM  = mysqlRows.reduce((s,r) => s + Number(r.cnt), 0);
  const totalMY = mysqlRows.reduce((s,r) => s + Number(r.yards || 0), 0);
  const totalP  = pgRows.reduce((s,r) => s + Number(r.cnt), 0);
  const totalPY = pgRows.reduce((s,r) => s + Number(r.yards || 0), 0);
  console.log(`\n  MySQL รวมทั้งหมด : ${totalM.toLocaleString()} พับ  /  ${totalMY.toLocaleString()} หลา`);
  console.log(`  PG    รวมทั้งหมด : ${totalP.toLocaleString()} พับ  /  ${totalPY.toLocaleString()} หลา`);
  console.log(`  ∆                : ${(totalP-totalM >= 0?'+':'')+(totalP-totalM)} พับ  /  ${(totalPY-totalMY >= 0?'+':'')+(totalPY-totalMY)} หลา`);

  if (diffRows.length === 0 && mysqlOnly.length === 0 && pgOnly.length === 0) {
    console.log('\n✓ ข้อมูลทั้งหมดตรงกันสมบูรณ์');
  } else {
    console.log('\n✗ มีความแตกต่าง — ดูรายละเอียดด้านบน');
  }

  await db.end();
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
