#!/usr/bin/env bash
# Provisions the isolated Preview database, end to end. Run AFTER `turso auth login`.
#
#   ./scripts/provision-preview-db.sh
#
# What it does, in order:
#   1. creates the Turso database (idempotent — reuses it if it exists)
#   2. mints a database token for it
#   3. applies migrations 0000 -> latest against it
#   4. seeds the QA fixture
#   5. sets the Vercel PREVIEW environment variables to point at it
#   6. prints the task link to open on a phone
#
# It never reads, copies or touches any production value. The only credentials
# it handles are the ones it creates for this database.
set -euo pipefail

DB_NAME="${PREVIEW_DB_NAME:-koph-preview}"

# The seed guard requires a remote database to name itself as non-production.
# Enforce the same rule on the name we are about to create, so a typo like
# "koph-produ" cannot get this far.
case "$DB_NAME" in
  *prod*) echo "Refusing: database name '$DB_NAME' contains 'prod'." >&2; exit 2 ;;
  *preview*|*staging*|*qa*|*test*|*sandbox*|*dev*) ;;
  *) echo "Refusing: database name '$DB_NAME' must identify itself as non-production." >&2; exit 2 ;;
esac

if ! turso auth whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: turso auth login" >&2
  exit 2
fi

echo "==> 1/6 database '$DB_NAME'"
if turso db show "$DB_NAME" >/dev/null 2>&1; then
  echo "    exists, reusing"
else
  turso db create "$DB_NAME"
fi

echo "==> 2/6 credentials"
DB_URL="$(turso db show "$DB_NAME" --url)"
DB_TOKEN="$(turso db tokens create "$DB_NAME")"
echo "    url: $DB_URL"

echo "==> 3/6 migrations"
TURSO_DATABASE_URL="$DB_URL" TURSO_AUTH_TOKEN="$DB_TOKEN" npx drizzle-kit migrate

echo "==> 4/6 seed fixture"
TURSO_DATABASE_URL="$DB_URL" TURSO_AUTH_TOKEN="$DB_TOKEN" npx tsx scripts/seed-preview.mts | tee /tmp/koph-preview-seed.out

echo "==> 5/6 Vercel preview environment"
# Preview scope, ALL branches — a fixture database holds nothing real, so the
# next branch gets a working preview without another provisioning round.
set_preview_env() {
  local key="$1" value="$2"
  vercel env rm "$key" preview --yes >/dev/null 2>&1 || true
  printf '%s' "$value" | vercel env add "$key" preview >/dev/null
  echo "    set $key (preview, all branches)"
}
set_preview_env TURSO_DATABASE_URL "$DB_URL"
set_preview_env TURSO_AUTH_TOKEN "$DB_TOKEN"
# A fresh secret for preview: production's is a sensitive value this script
# must never read, and preview has no reason to share it.
set_preview_env BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
echo "    NOTE: APP_BASE_URL / BETTER_AUTH_URL are per-deployment on preview."
echo "          Vercel exposes VERCEL_URL; set APP_BASE_URL to the branch alias"
echo "          once the first preview deploy names it."

echo "==> 6/6 done"
grep "OPEN THIS ON THE PHONE" /tmp/koph-preview-seed.out || true
echo
echo "Next: redeploy the branch so preview picks up the new variables:"
echo "  vercel --archive=tgz  (or push an empty commit)"
