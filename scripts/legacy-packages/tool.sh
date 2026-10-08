#!/bin/sh
# tool.sh — runs one command in the temporary builder image (has tsx, prisma CLI, scripts/) on the
# docker-compose network, so it reaches the prod Postgres as host "postgres" without publishing a port.
# DATABASE_URL comes from $PKGMIG_DIR/db.env (made by db-env.mjs from .env) — no password on the command line.
#
#   sh scripts/legacy-packages/tool.sh <command...>
#
# PKGMIG_DIR   default /root/pkgmig (in/ read-only → /in, out/ → /out, db.env)
# PKGMIG_IMAGE default ast-new-builder:pkgmig
set -eu
DIR=${PKGMIG_DIR:-/root/pkgmig}
IMAGE=${PKGMIG_IMAGE:-ast-new-builder:pkgmig}

[ -s "$DIR/db.env" ] || { echo "tool.sh: $DIR/db.env is missing or empty — run the db.env step first" >&2; exit 1; }
NET=$(docker network ls --format '{{.Name}}' | grep '_ast_net$' || true)
[ -n "$NET" ] || { echo "tool.sh: no *_ast_net docker network — is docker-compose.prod.yml up?" >&2; exit 1; }
[ "$(printf '%s\n' "$NET" | wc -l)" -eq 1 ] || { echo "tool.sh: more than one *_ast_net network: $NET" >&2; exit 1; }

exec docker run --rm --network "$NET" --env-file "$DIR/db.env" \
  -v "$DIR/in:/in:ro" -v "$DIR/out:/out" "$IMAGE" "$@"
