/**
 * fix_migration_v2.js
 *
 * Insert ALL stockfabric rows from MySQL (2026-05-24) that are missing from PG.
 * These are rows entered after the original migration cutoff.
 *
 * Skips rows with sumYard <= 0 (invalid/negative).
 *
 * DRY_RUN=true  (default) — preview only
 * DRY_RUN=false           — apply changes
 *
 * Usage:
 *   node fix_migration_v2.js               # dry run
 *   DRY_RUN=false node fix_migration_v2.js # apply
 */
const DRY_RUN = process.env.DRY_RUN !== 'false';

process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/ast_new';
const { PrismaClient } = require('./src/generated/prisma/client/client.js');
const { PrismaPg }     = require('./node_modules/@prisma/adapter-pg/dist/index.js');
const mysql2           = require('./node_modules/mysql2/promise.js');

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma    = new PrismaClient({ adapter: pgAdapter });

const MYSQL_CONFIG = { host:'127.0.0.1', port:3307, user:'astrobot34', password:'ast150831', database:'ast' };

function esc(v) { return String(v).replace(/'/g, "''"); }
function sqlStr(v) { return v != null && v !== '' ? `'${esc(v)}'` : 'NULL'; }

async function main() {
  console.log('DRY_RUN =', DRY_RUN);
  console.log('');

  let db;
  try {
    db = await mysql2.createConnection(MYSQL_CONFIG);
    console.log('MySQL connected ✓');
  } catch (e) {
    console.error('MySQL ไม่พร้อม:', e.message);
    await prisma.$disconnect();
    return;
  }

  // ── Find all MySQL rows from 2026-05-24 ──────────────────────────────────
  const [all0524] = await db.execute(`
    SELECT id, refId, emp, fabricStruct, fabricW, fold, sumYard,
           createDate, fabricPattern, customer, fabricId
    FROM stockfabrics
    WHERE DATE(createDate) = '2026-05-24'
    ORDER BY id
  `);
  console.log('MySQL 2026-05-24 rows:', all0524.length);

  // ── Find which already exist in PG ───────────────────────────────────────
  const allIds = all0524.map(r => Number(r.id));
  const ph     = allIds.join(',');
  const pgExisting = await prisma.$queryRawUnsafe(
    `SELECT id FROM stockfabrics WHERE id IN (${ph})`
  );
  const pgIdSet = new Set(pgExisting.map(r => Number(r.id)));

  const toProcess = all0524.filter(r => !pgIdSet.has(Number(r.id)));
  console.log('Already in PG:', all0524.length - toProcess.length);
  console.log('To process:   ', toProcess.length);
  console.log('');

  // ── Insert missing rows ──────────────────────────────────────────────────
  console.log('='.repeat(70));
  console.log('INSERT missing rows');
  console.log('='.repeat(70));

  let insertCount = 0, skipCount = 0;
  const insertedIds = [];

  for (const row of toProcess) {
    const sumYard   = Number(row.sumYard);
    const fabricCode = row.fabricId; // fabricId in MySQL = fabricCode in PG
    const createDate = row.createDate
      ? new Date(row.createDate).toISOString()
      : new Date().toISOString();

    if (sumYard <= 0) {
      console.log(`SKIP  id=${row.id}  ${fabricCode}  sumYard=${sumYard} (≤0)`);
      skipCount++;
      continue;
    }

    const customer = row.customer && row.customer !== '' ? row.customer : null;
    console.log(`INSERT id=${row.id}  [${(customer || 'AST').slice(0,25)}]  ${fabricCode}  fold=${row.fold}  yards=${sumYard}  date=${createDate.slice(0,10)}`);
    insertCount++;
    insertedIds.push(Number(row.id));

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
          ${sqlStr(fabricCode)},
          ${Number(row.fold)},
          ${sumYard},
          ${customer !== null ? sqlStr(customer) : 'NULL'},
          '${createDate}',
          NOW(), NOW(), false
        )
      `);
    }
  }

  // ── Reset sequence ────────────────────────────────────────────────────────
  if (!DRY_RUN && insertedIds.length > 0) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('stockfabrics','id'), GREATEST((SELECT MAX(id) FROM stockfabrics), 1))`
    );
    console.log('\nSequence reset to max id ✓');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('');
  console.log('='.repeat(70));
  console.log(`สรุป: INSERT ${insertCount} rows, SKIP ${skipCount} rows (sumYard≤0)`);
  if (DRY_RUN) console.log('[DRY RUN] ไม่มีการแก้ไขข้อมูลจริง');
  else         console.log('เสร็จสิ้น ✓');
  console.log('='.repeat(70));

  await db.end();
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
