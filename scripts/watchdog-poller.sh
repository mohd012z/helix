#!/usr/bin/env bash
# Watchdog for the BBMA-Telegram callback poller (news_ifxhelper answer path).
# Quiet (no stdout) when healthy; prints a line only on restart/failure.
# Designed to be run from cron (every ~30 min) — safe and idempotent.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_BIN="${NODE_BIN:-/usr/local/bin/node}"
PATTERN="^${NODE_BIN} scripts/poll-bbma-telegram-continuous.mjs"
if pgrep -f "$PATTERN" >/dev/null 2>&1; then
  exit 0
fi
echo "[watchdog] $(date -u +%FT%TZ) poller not running - restarting detached"
bash "$SCRIPT_DIR/start_poller_detached.sh" >/dev/null 2>&1
sleep 5
if pgrep -f "$PATTERN" >/dev/null 2>&1; then
  echo "[watchdog] restarted ok pid=$(pgrep -f "$PATTERN" | head -1)"
else
  echo "[watchdog] RESTART FAILED - see poller log"
fi
