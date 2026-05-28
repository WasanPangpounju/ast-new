/**
 * fix_migration.js
 *
 * Step 1: Rename KE16xKE10/120 → KE16XKE10/120 (28 rows, customer=AST)
 * Step 2: Insert 21 missing lots from old MySQL into PostgreSQL
 *         - All are from 2026-05-24 (entered after migration cut-off)
 *         - id=97635 (C40/13372 2/1) has sumYard=-1 → SKIP by default
 *
 * DRY_RUN=true  (default) — preview only, no writes
 * DRY_RUN=false           — actually apply changes
 *
 * Usage:
 *   node fix_migration.js               # dry run
 *   DRY_RUN=false node fix_migration.js # apply
 */
const DRY_RUN = process.env.DRY_RUN !== 'false';

process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/ast_new';
const { PrismaClient } = require('./src/generated/prisma/client/client.js');
const { PrismaPg }     = require('./node_modules/@prisma/adapter-pg/dist/index.js');
const mysql2           = require('./node_modules/mysql2/promise.js');

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma    = new PrismaClient({ adapter: pgAdapter });

const MYSQL_CONFIG = { host:'127.0.0.1', port:3307, user:'astrobot34', password:'ast150831', database:'ast' };

// Missing MySQL IDs to insert into PG (confirmed by audit)
const MISSING_IDS = [
  97471,97472,97473,97474,97475,97476,97477,97478,97479,97480, // C2010/10856
  97610,97611,                                                  // C40/205
  97631,97632,97633,97634,97635,                               // C40/13372 2/1 (97635 has sumYard=-1 → skipped)
  97636,97637,97638,97639,                                     // CD40/205 63"
];

// fabricId (MySQL) → fabricCode (PG) mapping
const FABRIC_CODE_MAP = {
  'C2010/10856':   'C2010/10856',
  'C40/205':       'C40/205',
  'C40/13372 2/1': 'C40/13372 2/1',
  'CD40/205 63"':  'CD40/205 63"',
};

function esc(v) { return String(v).replace(/'/g, "''"); }
function sqlStr(v) { return v != null && v !== '' ? `'${esc(v)}'` : 'NULL'; }

async function main() {
  console.log('DRY_RUN =', DRY_RUN);
  console.log('');

  // ── STEP 1: Fix KE16xKE10/120 case ──────────────────────────────────────
  console.log('='.repeat(60));
  console.log('STEP 1: Rename KE16xKE10/120 → KE16XKE10/120 (28 rows)');
  console.log('='.repeat(60));

  const preview = await prisma.$queryRawUnsafe(`
    SELECT id, "fabricCode", customer, fold, ROUND("sumYard"::numeric,1) AS yards, "createDate"
    FROM stockfabrics
    WHERE "fabricCode" = 'KE16xKE10/120' AND COALESCE(customer,'AST')='AST' AND deleted_at IS NULL
    ORDER BY id
  `);
  console.log('Rows to rename: ' + preview.length);
  preview.forEach(r => {
    console.log('  id=' + Number(r.id) + '  fold=' + r.fold + '  yards=' + Number(r.yards).toFixed(0) + '  date=' + String(r.createDate).slice(0,10));
  });

  if (!DRY_RUN) {
    const updated = await prisma.$executeRawUnsafe(`
      UPDATE stockfabrics
      SET "fabricCode" = 'KE16XKE10/120', "updated_at" = NOW()
      WHERE "fabricCode" = 'KE16xKE10/120' AND COALESCE(customer,'AST')='AST' AND deleted_at IS NULL
    `);
    console.log('→ Updated ' + updated + ' rows ✓');

    // Verify
    const after = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS cnt FROM stockfabrics WHERE "fabricCode"='KE16XKE10/120' AND COALESCE(customer,'AST')='AST' AND deleted_at IS NULL
    `);
    console.log('  KE16XKE10/120 total after rename: ' + after[0].cnt + ' พับ');
  } else {
    console.log('[DRY RUN] ไม่แก้จริง');
  }

  // ── STEP 2: Insert missing lots from MySQL ───────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('STEP 2: Insert missing lots from MySQL (2026-05-24)');
  console.log('='.repeat(60));

  let db;
  try {
    db = await mysql2.createConnection(MYSQL_CONFIG);
    console.log('MySQL connected ✓\n');
  } catch (e) {
    console.log('MySQL ไม่พร้อม: ' + e.message);
    console.log('→ ข้าม Step 2\n');
    await prisma.$disconnect();
    return;
  }

  const ph = MISSING_IDS.map(() => '?').join(',');
  const [mysqlRows] = await db.execute(
    `SELECT id, refId, emp, fabricStruct, fabricW, fold, sumYard, createDate, fabricPattern, customer, fabricId
     FROM stockfabrics WHERE id IN (${ph}) ORDER BY id`,
    MISSING_IDS
  );

  let insertCount = 0, skipCount = 0;
  for (const row of mysqlRows) {
    const sumYard = Number(row.sumYard);
    const pgCode  = FABRIC_CODE_MAP[row.fabricId] ?? row.fabricId;
    const createDate = row.createDate
      ? new Date(row.createDate).toISOString()
      : new Date().toISOString();

    if (sumYard <= 0) {
      console.log('SKIP id=' + row.id + '  fabricId=' + row.fabricId + '  sumYard=' + sumYard + ' (≤0)');
      skipCount++;
      continue;
    }

    console.log('INSERT id=' + row.id + '  ' + pgCode + '  fold=' + row.fold + '  yards=' + sumYard + '  date=' + createDate.slice(0,10));
    insertCount++;

    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO stockfabrics
          (id, "refId", emp, "fabricStruct", "fabricPattern", "fabricW", "fabricCode",
           fold, "sumYard", customer, "createDate", "created_at", "updated_at", is_purchased)
        VALUES (
          ${row.id},
          ${sqlStr(row.refId)},
          ${sqlStr(row.emp)},
          ${sqlStr(row.fabricStruct)},
          ${sqlStr(row.fabricPattern)},
          ${sqlStr(row.fabricW)},
          ${sqlStr(pgCode)},
          ${Number(row.fold)},
          ${sumYard},
          ${row.customer && row.customer !== '' ? sqlStr(row.customer) : 'NULL'},
          '${createDate}',
          NOW(), NOW(), false
        )
      `);
    }
  }

  if (!DRY_RUN) {
    // Reset sequence so future auto-increments don't collide
    const maxInserted = Math.max(...MISSING_IDS.filter((_, i) => {
      const r = mysqlRows.find(r => Number(r.id) === MISSING_IDS[i]);
      return r && Number(r.sumYard) > 0;
    }));
    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('stockfabrics','id'), GREATEST(${maxInserted}, (SELECT MAX(id) FROM stockfabrics)))`);
    console.log('\nSequence reset to max id ✓');

    // Verify each fabric code
    console.log('\nVerify after insert:');
    for (const [mysqlId, pgCode] of Object.entries(FABRIC_CODE_MAP)) {
      const r = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int AS cnt, ROUND(SUM("sumYard")::numeric,0) AS yards
        FROM stockfabrics WHERE "fabricCode"='${esc(pgCode)}' AND COALESCE(customer,'AST')='AST' AND deleted_at IS NULL
      `);
      console.log('  ' + pgCode + ': ' + r[0].cnt + ' พับ / ' + Number(r[0].yards).toLocaleString() + ' หลา');
    }
  }

  console.log('\nสรุป: INSERT ' + insertCount + ' rows, SKIP ' + skipCount + ' rows (sumYard≤0)');

  await db.end();
  await prisma.$disconnect();
  console.log(DRY_RUN ? '\n[DRY RUN] ไม่มีการแก้ไขข้อมูลจริง' : '\nเสร็จสิ้น ✓');
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
