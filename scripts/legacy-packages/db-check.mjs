/**
 * db-check.mjs — read-only connection check for the runbook: connects with DATABASE_URL and prints
 * which database it reached plus the row counts the migration cares about. Never prints the URL.
 *
 *   node scripts/legacy-packages/db-check.mjs
 */

import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('db-check: DATABASE_URL is not set'); process.exit(1) }

const db = new pg.Client({ connectionString: url })
try {
  await db.connect()
  const count = async (table) => {
    const exists = (await db.query('SELECT to_regclass($1) IS NOT NULL ok', [table])).rows[0].ok
    return exists ? (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n : 'no table'
  }
  const info = (await db.query('SELECT current_database() db, current_user usr, inet_server_addr()::text addr')).rows[0]
  const out = { database: info.db, user: info.usr, server: info.addr }
  for (const t of ['materials', 'suppliers', 'packages', 'packageasts', 'htrpackages',
    'package_return_obligations', 'package_return_receipts', 'package_return_entries']) out[t] = await count(t)
  console.log(JSON.stringify(out, null, 2))
} catch (e) {
  console.error(`db-check: FAILED — ${e.message}`)
  process.exitCode = 1
} finally {
  await db.end().catch(() => {})
}
