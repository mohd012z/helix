#!/usr/bin/env python3
"""Verify the generated snapshot's market board (branch-only CI gate).

Reads xauusd-data.js from the repo root and enforces the board contract:
  * every canonical symbol is present (OK or explicitly UNAVAILABLE),
  * at least MIN_OK symbols are OK with finite prices and provider bar dates,
  * no symbol is missing an availability state (never silently absent),
  * board priceType is DAILY_CLOSE (a reference close, not a live quote).

Exits non-zero on any contract violation so CI can distinguish a provider
outage (labelled, acceptable above MIN_OK) from a broken pipeline.
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSIGNMENT = "window.XAUUSD_DATA = "

CANONICAL = [
    "EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD",
    "EUR/GBP", "EUR/JPY", "GBP/JPY", "AUD/JPY", "EUR/AUD",
    "XAU/USD", "XAG/USD",
    "BTC/USD", "ETH/USD",
]
MIN_OK = 12


def finite(x) -> bool:
    return x is not None and not isinstance(x, bool) and isinstance(x, (int, float)) and math.isfinite(float(x))



def failure_class(detail: str) -> str:
    """Safe provider failure categories; never print arbitrary API error text."""
    lower = str(detail).lower()
    if any(word in lower for word in (
        "plan", "subscription", "upgrade", "permission", "not supported",
        "not available on", "invalid symbol", "access denied",
    )):
        return "PLAN_OR_SYMBOL_RESTRICTED"
    # Daily exhaustion must take precedence over generic HTTP 429/rate-limit
    # wording; minute-limit retries cannot replenish a daily allowance.
    if "daily" in lower and ("limit" in lower or "quota" in lower):
        return "DAILY_PROVIDER_QUOTA"
    if any(word in lower for word in ("429", "rate limit", "per minute", "limit reached")):
        return "RATE_LIMITED"
    if any(word in lower for word in ("timeout", "timed out", "502", "503", "504", "connection")):
        return "TRANSIENT_PROVIDER_ERROR"
    if any(word in lower for word in ("no time-series", "no values", "no daily observations")):
        return "NO_PROVIDER_BARS"
    return "UNAVAILABLE_UNCLASSIFIED"



def verify_snapshot_text(text: str) -> list[str]:
    """Return a list of contract violations (empty = pass) for snapshot text."""
    marker = text.find(ASSIGNMENT)
    if marker < 0:
        return ["window.XAUUSD_DATA assignment not found"]
    payload = json.loads(text[marker + len(ASSIGNMENT):text.rfind(";")].strip())
    board = payload.get("board")
    if not isinstance(board, dict):
        return ["snapshot has no board object"]
    if board.get("priceType") != "DAILY_CLOSE":
        return [f"board.priceType is {board.get('priceType')!r}, expected DAILY_CLOSE"]
    symbols = board.get("symbols")
    if not isinstance(symbols, dict):
        return ["board.symbols missing or not an object"]

    problems = []
    ok_count = 0
    for symbol in CANONICAL:
        entry = symbols.get(symbol)
        if entry is None:
            problems.append(f"{symbol}: entry missing entirely")
            continue
        if not isinstance(entry, dict):
            problems.append(f"{symbol}: entry must be an object")
            continue
        if entry.get("ok") is True:
            if not finite(entry.get("last")) or not finite(entry.get("changePct")) or not entry.get("barDate"):
                problems.append(f"{symbol}: ok=True but last/changePct/barDate incomplete: {entry}")
            else:
                ok_count += 1
        elif entry.get("ok") is False:
            if not str(entry.get("detail") or "").strip():
                problems.append(f"{symbol}: ok=False without provider detail")
        else:
            problems.append(f"{symbol}: ok state is {entry.get('ok')!r}, expected True/False")

    if ok_count < MIN_OK:
        problems.append(f"only {ok_count}/{len(CANONICAL)} symbols OK, minimum is {MIN_OK}")
        for symbol in CANONICAL:
            entry = symbols.get(symbol)
            if not isinstance(entry, dict) or entry.get("ok") is not True:
                category = failure_class(entry.get("detail", "") if isinstance(entry, dict) else "")
                problems.append(f"{symbol}: unavailable ({category})")
    return problems


def main(snapshot_path: Path | None = None) -> int:
    path = snapshot_path or (ROOT / "xauusd-data.js")
    text = path.read_text(encoding="utf")
    problems = verify_snapshot_text(text)
    if problems:
        print("FAIL: board contract violations:")
        for p in problems:
            print(" -", p)
        return 1

    marker = text.find(ASSIGNMENT)
    payload = json.loads(text[marker + len(ASSIGNMENT):text.rfind(";")].strip())
    symbols = payload["board"]["symbols"]
    unavailable = [s for s in CANONICAL if not symbols[s].get("ok")]
    ok_count = len(CANONICAL) - len(unavailable)
    print(f"PASS: board contract held — {ok_count}/{len(CANONICAL)} symbols OK"
          + (f" (labelled unavailable: {', '.join(unavailable)})" if unavailable else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
