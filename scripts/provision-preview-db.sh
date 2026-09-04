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
KOPH_VERCEL_PROJECT_ID="${KOPH_VERCEL_PROJECT_ID:-prj_JKOIP6ibW8gh19NDvv34KAixyWBg}"
KOPH_VERCEL_TEAM_ID="${KOPH_VERCEL_TEAM_ID:-team_POVsVFFH76Vibi9dobIe9Bi1}"
export KOPH_VERCEL_PROJECT_ID KOPH_VERCEL_TEAM_ID
# Preview scope, ALL branches — a fixture database holds nothing real, so the
# next branch gets a working preview without another provisioning round.
# NOTE: `vercel env add KEY preview` (CLI 54.14.0) refuses to read the value
# from stdin and rejects its own suggested `--value ... --yes` form with
# "git_branch_required", so the all-branches scope is only reachable through the
# REST API. Errors are NOT swallowed here: a silent failure once left the
# preview pointing at nothing while the script reported success.
set_preview_env() {
  local key="$1" value="$2"
  KOPH_ENV_KEY="$key" KOPH_ENV_VALUE="$value" node --input-type=module -e '
    import fs from "node:fs"; import os from "node:os";
    const tok = JSON.parse(fs.readFileSync(os.homedir() + "/Library/Application Support/com.vercel.cli/auth.json", "utf8")).token
    const project = process.env.KOPH_VERCEL_PROJECT_ID, team = process.env.KOPH_VERCEL_TEAM_ID
    const head = { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }
    const list = await (await fetch(`https://api.vercel.com/v9/projects/${project}/env?teamId=${team}`, { headers: head })).json()
    for (const e of list.envs ?? []) {
      if (e.key === process.env.KOPH_ENV_KEY && (e.target ?? []).includes("preview")) {
        await fetch(`https://api.vercel.com/v9/projects/${project}/env/${e.id}?teamId=${team}`, { method: "DELETE", headers: head })
      }
    }
    const res = await fetch(`https://api.vercel.com/v10/projects/${project}/env?teamId=${team}&upsert=true`, {
      method: "POST", headers: head,
      body: JSON.stringify({ key: process.env.KOPH_ENV_KEY, value: process.env.KOPH_ENV_VALUE, type: "encrypted", target: ["preview"] }),
    })
    if (!res.ok) { console.error(`failed to set ${process.env.KOPH_ENV_KEY}: ${res.status} ${await res.text()}`); process.exit(1) }
  '
  echo "    set $key (preview, all branches)"
}
set_preview_env TURSO_DATABASE_URL "$DB_URL"
set_preview_env TURSO_AUTH_TOKEN "$DB_TOKEN"
# A fresh secret for preview: production's is a sensitive value this script
# must never read, and preview has no reason to share it.
set_preview_env BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
echo "    NOTE: APP_BASE_URL / BETTER_AUTH_URL are NOT set here. Every preview"
echo "          deployment has its own URL, so they are pinned per branch to the"
echo "          stable branch alias (koph-git-<branch>-<scope>.vercel.app) after"
echo "          the first deploy names it, then the branch is redeployed."

echo "==> 6/6 done"
grep "OPEN THIS ON THE PHONE" /tmp/koph-preview-seed.out || true
echo
echo "Next: redeploy the branch so preview picks up the new variables:"
echo "  vercel --archive=tgz  (or push an empty commit)"
