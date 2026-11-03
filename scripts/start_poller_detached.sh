#!/usr/bin/env bash
# Detached BBMA-Telegram poller launcher (news_ifxhelper answer path).
#
# `setsid` puts the poller in its own session -> reparented to init -> it
# survives hermes-gateway restarts (s6 --replace). A single-instance lock
# prevents duplicate pollers (getUpdates is exclusive per token; a second
# one would 409-loop or eat callbacks).
#
# Layout: REPO_ROOT is resolved from this file's location.
#   Env file : $HELIX_ENV_FILE, else REPO_ROOT/helix.env, else REPO_ROOT/.env
#   run dir  : $HELIX_RUN_DIR, else REPO_ROOT/.run (lock + log)
#   node     : $NODE_BIN, else /usr/local/bin/node, else PATH lookup
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
RUN_DIR="${HELIX_RUN_DIR:-$REPO_ROOT/.run}"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "FATAL: node not found (set NODE_BIN)" >&2
  exit 1
fi
ENV_FILE="${HELIX_ENV_FILE:-}"
if [ -z "$ENV_FILE" ]; then
  for c in "$REPO_ROOT/helix.env" "$REPO_ROOT/.env"; do
    if [ -f "$c" ]; then ENV_FILE="$c"; break; fi
  done
fi
mkdir -p "$RUN_DIR"
LOCK="$RUN_DIR/poller.lock"
LOG="$RUN_DIR/poller.log"
if [ -f "$LOCK" ]; then
  oldpid="$(cat "$LOCK" 2>/dev/null || true)"
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    echo "$(date -u +%FT%TZ) lock held by $oldpid; exiting" >> "$LOG"
    exit 0
  fi
fi
setsid bash -c "
  set -a; [ -n '$ENV_FILE' ] && . '$ENV_FILE'; set +a;
  echo \$\$ > '$LOCK';
  echo \"\$(date -u +%FT%TZ) poller start pid=\$\$ (detached)\" >> '$LOG';
  cd '$REPO_ROOT' || exit 1;
  exec '$NODE_BIN' scripts/poll-bbma-telegram-continuous.mjs >> '$LOG' 2>&1
" < /dev/null > /dev/null 2>&1 &
disown 2>/dev/null || true
echo "launched detached poller (log $LOG)"
