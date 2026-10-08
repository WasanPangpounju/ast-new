/**
 * db-env.mjs — builds a docker --env-file line for the prod database from the server's compose .env,
 * so the password is never typed on a command line (it never appears in argv or shell history).
 *
 *   docker run --rm -i ast-new-builder:pkgmig node scripts/legacy-packages/db-env.mjs < .env > /root/pkgmig/db.env
 *
 * Reads POSTGRES_PASSWORD the way docker compose reads .env (optional `export`, single quotes literal,
 * double quotes with \" escapes, unquoted values end at " #"), URL-encodes it (@ → %40, : → %3A, …) and
 * prints DATABASE_URL=postgresql://postgres:<encoded>@postgres:5432/ast_new — the same user, host and
 * database as the app's DATABASE_URL in docker-compose.prod.yml. Prints nothing else on stdout.
 * Refuses a value containing $ (compose would interpolate it, so the real password may differ).
 */

import fs from 'node:fs'

const fail = (msg) => { console.error(`db-env: ${msg}`); process.exit(1) }

const lines = fs.readFileSync(0, 'utf8').split(/\r?\n/)
const hits = lines.filter((l) => /^\s*(export\s+)?POSTGRES_PASSWORD\s*=/.test(l))
if (hits.length === 0) fail('POSTGRES_PASSWORD not found in .env')
if (hits.length > 1) fail(`POSTGRES_PASSWORD is set ${hits.length} times in .env — fix .env first`)

let raw = hits[0].replace(/^\s*(export\s+)?POSTGRES_PASSWORD\s*=\s*/, '')
let value
if (raw.startsWith("'")) {
  const end = raw.indexOf("'", 1)
  if (end < 0) fail('unterminated single quote')
  value = raw.slice(1, end)
} else if (raw.startsWith('"')) {
  let i = 1
  value = ''
  for (; i < raw.length && raw[i] !== '"'; i++) value += raw[i] === '\\' && i + 1 < raw.length ? raw[++i] : raw[i]
  if (i >= raw.length) fail('unterminated double quote')
  if (value.includes('$')) fail('password contains $ inside double quotes — compose interpolates it; check by hand')
} else {
  value = raw.replace(/\s+#.*$/, '').trim()
  if (value.includes('$')) fail('password contains $ — compose interpolates it; check by hand')
}
if (!value) fail('POSTGRES_PASSWORD is empty')

process.stdout.write(`DATABASE_URL=postgresql://postgres:${encodeURIComponent(value)}@postgres:5432/ast_new\n`)
