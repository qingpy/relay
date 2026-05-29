#!/usr/bin/env bash
# Redeploy the committed HEAD to the Relay VPS, build it there, and restart.
#
# Run from the repo root on the machine that has this repo + SSH access:
#     bash deploy/update.sh [ssh-host]      # default host: Oracle-VPS
#
# It ships exactly what's committed at HEAD (via `git archive`), so commit
# first. Untracked files on the box (.env, node_modules, dist, backups) are
# left intact. Note: it overwrites tracked files but does NOT delete files that
# were removed from the repo — rare enough to handle by hand if it happens.
set -euo pipefail

HOST="${1:-Oracle-VPS}"
APP="/opt/relay"
SHA="$(git rev-parse HEAD)"

echo "→ Shipping $SHA to $HOST:$APP"
git archive --format=tar HEAD | ssh "$HOST" "tar xf - -C $APP"
ssh "$HOST" "echo $SHA > $APP/.deployed-sha"

echo "→ Installing deps + building on the VPS"
ssh "$HOST" "cd $APP && npm ci && npm run build"

echo "→ Restarting service"
ssh "$HOST" "sudo systemctl restart relay && sleep 3 && echo active=\$(systemctl is-active relay)"

echo "→ Health check"
ssh "$HOST" 'P=$(grep RELAY_AUTH_PASS '"$APP"'/.env | cut -d= -f2); curl -s -u "relay:$P" http://127.0.0.1:8787/api/health; echo'

echo "✓ Deployed $SHA"
