/**
 * compare_stock.js
 * Compare stockfabrics between old MySQL (port 3307) and new PostgreSQL
 * for the 5 fabric codes affected by the migration fix.
 */
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/ast_new';
const { PrismaClient } = require('./src/generated/prisma/client/client.js');
const { PrismaPg }     = require('./node_modules/@prisma/adapter-pg/dist/index.js');
const mysql2           = require('./node_modules/mysql2/promise.js');

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma    = new PrismaClient({ adapter: pgAdapter });

const MYSQL_CONFIG = { host:'127.0.0.1', port:3307, user:'astrobot34', password:'ast150831', database:'ast' };

// MySQL fabricId → PG fabricCode (MySQL collation is case-insensitive, so one entry per code)
const CODES = [
  { mysql: 'KE16xKE10/120',   pg: 'KE16XKE10/120'  },
  { mysql: 'C2010/10856',     pg: 'C2010/10856'     },
  { mysql: 'C40/205',         pg: 'C40/205'         },
  { mysql: 'C40/13372 2/1',   pg: 'C40/13372 2/1'  },
  { mysql: 'CD40/205 63"',    pg: 'CD40/205 63"'   },
];

// Rows intentionally skipped during migration (id → reason)
const KNOWN_SKIPS = {
  97635: 'sumYard=-1 (invalid)',
};

const PG_CODES    = CODES.map(c => c.pg);
const MYSQL_CODES = CODES.map(c => c.mysql);

function esc(v) { return String(v).replace(/'/g, "''"); }

async function main() {
  console.log('='.repeat(68));
  console.log('STOCK COMPARISON: MySQL (old) vs PostgreSQL (new)');
  console.log('='.repeat(68));

  // ── MySQL ──────────────────────────────────────────────────────────────
  let db;
  try {
    db = await mysql2.createConnection(MYSQL_CONFIG);
  } catch (e) {
    console.error('MySQL ไม่พร้อม:', e.message);
    await prisma.$disconnect();
    return;
  }

  const mysqlResults = {};
  for (const code of MYSQL_CODES) {
    const [[row]] = await db.execute(
      `SELECT COUNT(*) AS cnt, ROUND(SUM(sumYard),0) AS yards
       FROM stockfabrics
       WHERE fabricId = ? AND COALESCE(customer,'AST')='AST'`,
      [code]
    );
    const key = code === 'KE16xKE10/120' ? 'KE16XKE10/120' : code;
    if (!mysqlResults[key]) mysqlResults[key] = { cnt: 0, yards: 0 };
    mysqlResults[key].cnt   += Number(row.cnt);
    mysqlResults[key].yards += Number(row.yards || 0);
  }

  // ── PostgreSQL ─────────────────────────────────────────────────────────
  const pgResults = {};
  for (const code of PG_CODES) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS cnt, ROUND(SUM("sumYard")::numeric,0) AS yards
       FROM stockfabrics
       WHERE "fabricCode"='${esc(code)}' AND COALESCE(customer,'AST')='AST' AND deleted_at IS NULL`
    );
    pgResults[code] = { cnt: Number(rows[0].cnt), yards: Number(rows[0].yards || 0) };
  }

  // ── Report ─────────────────────────────────────────────────────────────
  console.log('');
  console.log(
    'รหัสผ้า'.padEnd(22) +
    'MySQL พับ'.padStart(10) + 'MySQL หลา'.padStart(12) +
    'PG พับ'.padStart(10)   + 'PG หลา'.padStart(12) +
    ' สถานะ'
  );
  console.log('-'.repeat(68));

  // Count how many known-skip rows exist in MySQL per pg code
  const skipCntByCode = {};
  const skipYardsByCode = {};
  for (const [code, c] of Object.entries(CODES.reduce((acc, c) => { acc[c.pg] = c; return acc; }, {}))) {
    skipCntByCode[code] = 0; skipYardsByCode[code] = 0;
  }
  // Query MySQL for known-skip IDs
  const skipIds = Object.keys(KNOWN_SKIPS).map(Number);
  if (skipIds.length > 0) {
    const ph2 = skipIds.map(() => '?').join(',');
    const [skipRows] = await db.execute(
      `SELECT fabricId, SUM(sumYard) AS yards, COUNT(*) AS cnt FROM stockfabrics WHERE id IN (${ph2}) GROUP BY fabricId`,
      skipIds
    );
    for (const r of skipRows) {
      const pgCode = CODES.find(c => c.mysql === r.fabricId)?.pg ?? r.fabricId;
      skipCntByCode[pgCode]   = (skipCntByCode[pgCode]   || 0) + Number(r.cnt);
      skipYardsByCode[pgCode] = (skipYardsByCode[pgCode] || 0) + Number(r.yards || 0);
    }
  }

  let allMatch = true;
  for (const c of CODES) {
    const pg   = c.pg;
    const m    = mysqlResults[pg] || { cnt: 0, yards: 0 };
    const p    = pgResults[pg]    || { cnt: 0, yards: 0 };
    const sc   = skipCntByCode[pg]   || 0;
    const sy   = skipYardsByCode[pg] || 0;
    // Expected: PG = MySQL minus skipped rows
    const expectedCnt   = m.cnt   - sc;
    const expectedYards = m.yards - sy;
    const match = p.cnt === expectedCnt && p.yards === expectedYards;
    if (!match) allMatch = false;
    let status = match ? '✓' : '✗ ต่างกัน';
    if (sc > 0) status += ` (ข้าม ${sc} พับ: ${Object.entries(KNOWN_SKIPS).map(([id,r]) => `id=${id} ${r}`).join(', ')})`;
    console.log(
      pg.padEnd(22) +
      String(m.cnt).padStart(10)   + String(m.yards.toLocaleString()).padStart(12) +
      String(p.cnt).padStart(10)   + String(p.yards.toLocaleString()).padStart(12) +
      '  ' + status
    );
  }

  console.log('-'.repeat(68));
  console.log(allMatch ? '\n✓ ข้อมูลทั้งหมดตรงกัน (หักข้อมูลที่ skip แล้ว)' : '\n✗ มีบางรายการที่ไม่ตรง — ตรวจสอบเพิ่มเติม');

  await db.end();
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
