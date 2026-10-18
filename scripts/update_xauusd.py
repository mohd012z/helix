#!/usr/bin/env python3
"""Generate xauusd-data.js from real external sources.

Mandatory:
  TWELVE_DATA_API_KEY  - XAU/USD market data (and best-effort DXY/Brent discovery)
Optional:
  FRED_API_KEY         - DGS10 US 10-year Treasury yield
  NEWS_API_KEY         - recent gold/macro headlines

The generated JavaScript is static and safe to host on GitHub Pages or open locally.
API keys stay in the scheduled updater environment; they are never written into HTML/JS.
"""
from __future__ import annotations

import json
import math
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "xauusd-data.js"
TZ = ZoneInfo("Asia/Kuala_Lumpur")
UA = "XAU-DESK-Daily-Updater/2.0 (+static dashboard)"
TIMEOUT = 25


class SourceError(RuntimeError):
    pass


class RateLimitError(SourceError):
    """Provider credit/minute limit hit. Immediate retries cannot help;
    callers fail fast and label the symbol UNAVAILABLE."""


def now_local() -> datetime:
    return datetime.now(TZ)


def get_json(url: str, *, params=None, headers=None, retries: int = 3) -> dict:
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, headers=h, timeout=TIMEOUT)
            if r.status_code == 429:
                raise RateLimitError(f"429 rate limit (attempt {attempt + 1}/{retries})")
            r.raise_for_status()
            data = r.json()
            if isinstance(data, dict) and data.get("status") == "error":
                msg = str(data.get("message") or data)
                # Some plans return rate-limit errors in the JSON body with
                # status 200 (Twelve Data: "The maximum number of calls per
                # minute has been reached"). Detect by message, fail fast, no retry.
                low = msg.lower()
                if "rate limit" in low or "limit reached" in low or "per minute" in low or "maximum number of calls" in low:
                    raise RateLimitError(msg)
                raise SourceError(msg)
            return data
        except RateLimitError:
            raise
        except Exception as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise SourceError(str(last))


def get_text(url: str, *, retries: int = 3) -> str:
    last = None
    for attempt in range(retries):
        try:
            r = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
            r.raise_for_status()
            return r.text
        except Exception as exc:
            last = exc
            if attempt + 1 < retries:
                time.sleep(1.5 * (attempt + 1))
    raise SourceError(str(last))


def f(v: Any) -> float:
    return float(str(v).replace(",", ""))


def pct_change(new: float, old: float) -> float:
    return 0.0 if not old else (new / old - 1.0) * 100.0


def round2(x: float | None) -> float | None:
    return None if x is None or not math.isfinite(x) else round(x, 2)


def round3(x: float | None) -> float | None:
    return None if x is None or not math.isfinite(x) else round(x, 3)


def td_time_series(api_key: str, symbol: str, outputsize: int = 370) -> tuple[list[dict], str | None]:
    data = get_json(
        "https://api.twelvedata.com/time_series",
        params={
            "symbol": symbol,
            "interval": "1day",
            "outputsize": outputsize,
            "order": "DESC",
            "timezone": "UTC",
            "apikey": api_key,
        },
    )
    vals = data.get("values") or []
    if not vals:
        raise SourceError(f"No time-series values returned for {symbol}")
    return vals, data.get("name")


def td_resolve_symbol(api_key: str, query: str, exact_names=()) -> str | None:
    data = get_json(
        "https://api.twelvedata.com/symbol_search",
        params={"symbol": query, "outputsize": 30, "apikey": api_key},
    )
    rows = data.get("data") or []
    q = query.upper()
    for r in rows:
        if str(r.get("symbol", "")).upper() == q:
            return r.get("symbol")
    names = tuple(n.lower() for n in exact_names)
    for r in rows:
        n = str(r.get("instrument_name") or r.get("name") or "").lower()
        if any(x in n for x in names):
            return r.get("symbol")
    return None


def td_resolve_commodity(api_key: str, name_contains: str) -> str | None:
    # Reference catalog is safer than guessing provider-specific commodity symbols.
    data = get_json("https://api.twelvedata.com/commodities", params={"outputsize": 500, "apikey": api_key})
    for r in data.get("data") or []:
        if name_contains.lower() in str(r.get("name", "")).lower():
            return r.get("symbol")
    return None


def latest_pair(vals: list[dict]) -> tuple[dict, dict]:
    if len(vals) < 2:
        raise SourceError("Need at least two daily observations")
    return vals[0], vals[1]


def compact_series(vals: list[dict], n: int = 14) -> dict:
    use = list(reversed(vals[:n]))
    pts = [{"x": v["datetime"][:10], "y": round2(f(v["close"]))} for v in use]
    ys = [p["y"] for p in pts]
    lo, hi = min(ys), max(ys)
    pad = max((hi - lo) * 0.12, max(1.0, hi * 0.002))
    return {
        "label": "XAU/USD daily close (Twelve Data)",
        "unit": "USD / troy oz",
        "yMin": round2(lo - pad),
        "yMax": round2(hi + pad),
        "points": pts,
    }


def generic_series(vals: list[dict], label: str, unit: str, n: int = 14) -> dict:
    use = list(reversed(vals[:n]))
    pts = [{"x": v["datetime"][:10], "y": round3(f(v["close"]))} for v in use]
    ys = [p["y"] for p in pts]
    lo, hi = min(ys), max(ys)
    pad = max((hi - lo) * 0.12, 0.05)
    return {"label": label, "unit": unit, "yMin": round3(lo - pad), "yMax": round3(hi + pad), "points": pts}


def pivot_levels(day: dict) -> tuple[list[float], list[float]]:
    h, l, c = f(day["high"]), f(day["low"]), f(day["close"])
    p = (h + l + c) / 3.0
    r1 = 2 * p - l
    s1 = 2 * p - h
    r2 = p + (h - l)
    s2 = p - (h - l)
    r3 = h + 2 * (p - l)
    s3 = l - 2 * (h - p)
    return [round2(r1), round2(r2), round2(r3)], [round2(s1), round2(s2), round2(s3)]


def fred_dgs10(api_key: str) -> tuple[float, float, str]:
    data = get_json(
        "https://api.stlouisfed.org/fred/series/observations",
        params={
            "series_id": "DGS10",
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 12,
        },
    )
    valid = [o for o in data.get("observations", []) if o.get("value") not in (None, ".")]
    if len(valid) < 2:
        raise SourceError("FRED DGS10 returned fewer than two usable observations")
    a, b = valid[0], valid[1]
    return f(a["value"]), f(b["value"]), a["date"]


def newsapi_recent(api_key: str, since: datetime) -> list[dict]:
    q = '(gold OR XAUUSD) AND (Fed OR dollar OR yield OR inflation OR "central bank")'
    data = get_json(
        "https://newsapi.org/v2/everything",
        params={
            "q": q,
            "from": since.astimezone(timezone.utc).isoformat(timespec="seconds"),
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 12,
        },
        headers={"X-Api-Key": api_key},
    )
    out = []
    for a in data.get("articles") or []:
        title = (a.get("title") or "").strip()
        if not title or title == "[Removed]":
            continue
        desc = (a.get("description") or "").strip()
        signal, impact = classify_headline(title + " " + desc)
        pub = a.get("publishedAt") or ""
        out.append({
            "time": pub[:16].replace("T", " ") + (" UTC" if pub else ""),
            "title": title,
            "summary": desc[:300],
            "source": (a.get("source") or {}).get("name") or "NewsAPI source",
            "url": a.get("url") or "",
            "impact": impact,
            "signal": signal,
            "impactPct": None,
        })
    return out[:8]


def classify_headline(text: str) -> tuple[str, str]:
    """Transparent keyword heuristic only; does not invent a numeric price impact."""
    t = text.lower()
    down = ["higher yields", "yield rises", "dollar rises", "dollar strengthens", "rate hike", "hawkish", "inflation rises", "stronger dollar"]
    up = ["lower yields", "yield falls", "dollar falls", "dollar weakens", "rate cut", "dovish", "safe haven", "geopolitical risk"]
    sd = sum(k in t for k in down)
    su = sum(k in t for k in up)
    if sd > su:
        return "DOWN", "bearish"
    if su > sd:
        return "UP", "bullish"
    return "NEUTRAL", "neutral"


def fed_speeches() -> list[dict]:
    year = now_local().year
    url = f"https://www.federalreserve.gov/newsevents/{year}-speeches.htm"
    html = get_text(url)
    soup = BeautifulSoup(html, "html.parser")
    items = []
    # Fed markup can change; use broad anchors and nearby text, then dedupe.
    for a in soup.select('a[href*="/newsevents/speech/"]'):
        title = " ".join(a.stripped_strings).strip()
        if not title:
            continue
        container = a.find_parent(["div", "article", "li"]) or a.parent
        text = " ".join(container.stripped_strings) if container else title
        date_m = re.search(r"\b\d{1,2}/\d{1,2}/\d{4}\b", text)
        speaker = "Federal Reserve speaker"
        # Common titles/names are usually adjacent; retain text excerpt without claiming stance.
        snippet = re.sub(r"\s+", " ", text)[:260]
        items.append({
            "name": title,
            "role": speaker,
            "side": "neutral",
            "signal": "NEUTRAL",
            "quote": snippet,
            "impact": "Official Fed speech listing; stance is not automatically inferred.",
            "date": date_m.group(0) if date_m else str(year),
            "source": "Federal Reserve",
            "url": urljoin("https://www.federalreserve.gov", a.get("href", "")),
            "w": 0.0, "s": 0.0, "f": 0.0, "impactPct": 0.0,
        })
        if len(items) >= 6:
            break
    # Exact URL dedupe
    seen, deduped = set(), []
    for i in items:
        if i["url"] in seen:
            continue
        seen.add(i["url"]); deduped.append(i)
    return deduped


def pressure_model(dxy_pct: float | None, y10_bp: float | None, gold_pct: float) -> tuple[dict, list[dict]]:
    factors = []
    score = 0.0
    weight_sum = 0.0
    if dxy_pct is not None:
        # Positive USD change is typically a headwind for dollar-priced gold.
        v = max(-1.0, min(1.0, dxy_pct / 0.8))
        score += -0.45 * v; weight_sum += 0.45
        factors.append({"label": "USD daily move", "level": f"{dxy_pct:+.2f}%", "w": min(100, int(abs(v) * 100)), "dir": "down" if dxy_pct > 0 else "up"})
    if y10_bp is not None:
        v = max(-1.0, min(1.0, y10_bp / 12.0))
        score += -0.45 * v; weight_sum += 0.45
        factors.append({"label": "US 10Y daily move", "level": f"{y10_bp:+.1f} bp", "w": min(100, int(abs(v) * 100)), "dir": "down" if y10_bp > 0 else "up"})
    # Gold's own daily move is observational, not a causal macro input; keep a small weight.
    gv = max(-1.0, min(1.0, gold_pct / 1.5))
    score += 0.10 * gv; weight_sum += 0.10
    factors.append({"label": "Observed XAU momentum", "level": f"{gold_pct:+.2f}%", "w": min(100, int(abs(gv) * 100)), "dir": "up" if gold_pct >= 0 else "down"})
    score = score / weight_sum if weight_sum else 0.0
    bias = "UPWARD" if score > 0.15 else "DOWNWARD" if score < -0.15 else "MIXED"
    tone = "BULLISH" if score > 0.15 else "BEARISH" if score < -0.15 else "NEUTRAL"
    sig = "UP" if score > 0.15 else "DOWN" if score < -0.15 else "NEUTRAL"
    confidence = min(95, 45 + int(weight_sum * 45))
    summary = "Mechanical daily pressure model using sourced USD/yield moves plus a small observed XAU-momentum term. It is not a forecast or trade instruction."
    return {
        "bias": bias,
        "goldTone": tone,
        "score": round(score, 3),
        "confidence": confidence,
        "summary": summary,
        "netSpeechSignal": sig,
        "netSpeechPct": 0.0,
        "netNote": "Direction only. No fabricated percentage impact is assigned to headlines or speeches.",
    }, factors


def source_entry(ok: bool, label: str, detail: str = "", timestamp: str | None = None) -> dict:
    return {"ok": bool(ok), "label": label, "detail": detail, "timestamp": timestamp or now_local().isoformat(timespec="seconds")}


# Market board: FX majors, minors/crosses, metals, digital assets.
# Best-effort per symbol: each missing symbol is published as UNAVAILABLE
# with the provider detail. Daily closes only — never a live quote.
BOARD_SYMBOLS: list[tuple[str, str, str]] = [
    ("EUR/USD", "fx", "major"), ("GBP/USD", "fx", "major"), ("USD/JPY", "fx", "major"),
    ("USD/CHF", "fx", "major"), ("AUD/USD", "fx", "major"), ("USD/CAD", "fx", "major"),
    ("NZD/USD", "fx", "major"),
    ("EUR/GBP", "fx", "minor"), ("EUR/JPY", "fx", "minor"), ("GBP/JPY", "fx", "minor"),
    ("AUD/JPY", "fx", "minor"), ("EUR/AUD", "fx", "minor"),
    ("XAG/USD", "metal", "metal"),
    ("BTC/USD", "digital", "digital"), ("ETH/USD", "digital", "digital"),
]


def collect_board(
    api_key: str,
    status: dict[str, dict],
    *,
    fetch=None,
    sleep=None,
    board_symbols: list[tuple[str, str, str]] = BOARD_SYMBOLS,
    pace_seconds: float = 10.0,
    window_seconds: float = 60.0,
    elapsed_since_preboard: float = 0.0,
) -> dict:
    """Collect the desk board (FX majors/minors, metals, digital).

    ``fetch(api_key, symbol, outputsize) -> (values, name|None)`` is injectable
    for tests; ``sleep`` defaults to time.sleep resolved at call time.
    ``pace_seconds`` fits the free-tier credit limit (8 credits/min): 15
    symbols at 10s spacing = 6/min. The free limit is a ROLLING 60s window
    and the pre-board XAU/DXY/Brent calls land in the board's first window —
    so before the first symbol we settle ``max(0, window - elapsed_since_
    preboard)`` (the remaining time for pre-board credits to exit the
    window). This is prevention, not a retry: after the settle the steady
    6/min pace is self-sustaining. A 429 still fails fast (RateLimitError,
    no retry) and labels the symbol UNAVAILABLE; it self-heals next run.
    Matches BACKFILL_PACE_MS=10000 house value.
    """
    if fetch is None:
        fetch = td_time_series
    if sleep is None:
        sleep = time.sleep
    # Settle the rolling credit window so pre-board credits have fully
    # exited before the board's first call (see docstring).
    settle = max(0.0, window_seconds - max(0.0, elapsed_since_preboard))
    if settle > 0:
        sleep(settle)
    entries: dict[str, dict] = {}
    for symbol, asset_class, group in board_symbols:
        entry: dict[str, Any] = {
            "symbol": symbol, "assetClass": asset_class, "group": group,
            "ok": False, "last": None, "changePct": None, "barDate": None, "detail": "",
        }
        try:
            vals, _name = fetch(api_key, symbol, 2)
            a, b = latest_pair(vals)
            la, lb = f(a["close"]), f(b["close"])
            entry.update(
                ok=True,
                last=round3(la) if group == "metal" else round(la, 5),
                changePct=round2(pct_change(la, lb)),
                barDate=str(a.get("datetime", ""))[:10],
                detail=f"provider bar {str(a.get('datetime', ''))[:10]}",
            )
            status[f"board_{symbol.replace('/', '_')}"] = source_entry(True, f"Board {symbol}", f"provider bar {entry['barDate']}")
        except Exception as exc:
            entry["detail"] = str(exc)
            status[f"board_{symbol.replace('/', '_')}"] = source_entry(False, f"Board {symbol}", str(exc))
        entries[symbol] = entry
        sleep(pace_seconds)
    return {
        "label": "FX majors / minors, metals, digital assets — provider daily closes",
        "priceType": "DAILY_CLOSE",
        "note": "Daily reference closes for the desk board. Each symbol is independent: unavailable symbols are labelled, never substituted.",
        "symbols": entries,
    }


def main() -> int:
    td_key = os.getenv("TWELVE_DATA_API_KEY", "").strip()
    fred_key = os.getenv("FRED_API_KEY", "").strip()
    news_key = os.getenv("NEWS_API_KEY", "").strip()
    if not td_key:
        print("ERROR: TWELVE_DATA_API_KEY is required. Refusing to generate a fake snapshot.", file=sys.stderr)
        return 2

    generated = now_local()
    status: dict[str, dict] = {}
    warnings: list[str] = []
    # Monotonic reference for the board's credit-window settle: pre-board
    # XAU/DXY/Brent credits enter the rolling 60s limit window, and the
    # board must not start until enough of that window has elapsed.
    t0 = time.monotonic()

    # --- XAU/USD: mandatory ---
    try:
        xau, _xau_name = td_time_series(td_key, "XAU/USD", 370)
        latest, prev = latest_pair(xau)
        spot, prev_close = f(latest["close"]), f(prev["close"])
        change = spot - prev_close
        change_pct = pct_change(spot, prev_close)
        h, l = f(latest["high"]), f(latest["low"])
        approx_1m = f(xau[min(21, len(xau)-1)]["close"])
        # first observation at/after Jan 1 within the returned recent history
        year = generated.year
        year_obs = [v for v in reversed(xau) if str(v.get("datetime", "")).startswith(str(year))]
        year_base = f(year_obs[0]["close"]) if year_obs else f(xau[-1]["close"])
        status["xau"] = source_entry(True, "Twelve Data XAU/USD", f"latest daily bar {latest['datetime']}")
    except Exception as exc:
        print(f"ERROR: XAU/USD fetch failed: {exc}", file=sys.stderr)
        return 3

    # --- DXY: best effort; never substitute another index silently ---
    dxy_item = {"label": "DXY", "value": "—", "delta": "unavailable", "tone": "", "note": "Provider symbol not confirmed"}
    dxy_pct = None
    dxy_series = None
    try:
        sym = td_resolve_symbol(td_key, "DXY", ("US Dollar Index", "U.S. Dollar Index"))
        if not sym:
            raise SourceError("No exact/confirmed DXY symbol found")
        dxy, _dxy_name = td_time_series(td_key, sym, 45)
        da, db = latest_pair(dxy)
        dv, dp = f(da["close"]), f(db["close"])
        dxy_pct = pct_change(dv, dp)
        dxy_item = {"label": "DXY", "value": f"{dv:.2f}", "delta": f"{dxy_pct:+.2f}%", "tone": "bad" if dxy_pct > 0 else "good", "note": f"Twelve Data {sym}; daily close"}
        dxy_series = generic_series(dxy, f"DXY daily close ({sym})", "index", 14)
        status["dxy"] = source_entry(True, "Twelve Data DXY", f"symbol {sym}; latest {da['datetime']}")
    except Exception as exc:
        status["dxy"] = source_entry(False, "Twelve Data DXY", str(exc))
        warnings.append("DXY unavailable; dashboard shows — rather than substituting an unverified dollar index.")

    # --- Brent: best effort with catalog discovery ---
    brent_item = {"label": "Brent", "value": "—", "delta": "unavailable", "tone": "", "note": "Provider symbol not confirmed"}
    try:
        bsym = td_resolve_commodity(td_key, "Brent")
        if not bsym:
            raise SourceError("Brent symbol not found in Twelve Data commodity catalog")
        br, _br_name = td_time_series(td_key, bsym, 3)
        ba, bb = latest_pair(br)
        bv, bp = f(ba["close"]), f(bb["close"])
        bpc = pct_change(bv, bp)
        brent_item = {"label": "Brent", "value": f"${bv:.2f}", "delta": f"{bpc:+.2f}%", "tone": "bad" if bpc > 0 else "good", "note": f"Twelve Data {bsym}; daily close"}
        status["brent"] = source_entry(True, "Twelve Data Brent", f"symbol {bsym}; latest {ba['datetime']}")
    except Exception as exc:
        status["brent"] = source_entry(False, "Twelve Data Brent", str(exc))
        warnings.append("Brent unavailable for this run.")

    # --- Market board: FX majors, minors/crosses, metals, digital assets ---
    board = collect_board(td_key, status, elapsed_since_preboard=time.monotonic() - t0)
    # XAU/USD is the desk's authority instrument: surface its verified daily
    # close on the metals board too (same bar, same rounding as the hero).
    board["symbols"]["XAU/USD"] = {
        "symbol": "XAU/USD", "assetClass": "metal", "group": "metal",
        "ok": True, "last": round2(spot), "changePct": round2(change_pct),
        "barDate": str(latest.get("datetime", ""))[:10],
        "detail": f"provider bar {str(latest.get('datetime', ''))[:10]}",
    }
    status["board_XAU_USD"] = source_entry(True, "Board XAU/USD", f"provider bar {str(latest.get('datetime', ''))[:10]}")

    # --- US 10Y from FRED: optional official macro source ---
    y10_item = {"label": "US 10Y", "value": "—", "delta": "configure FRED_API_KEY", "tone": "", "note": "FRED DGS10 not configured"}
    y10_bp = None
    if fred_key:
        try:
            yv, yp, ydate = fred_dgs10(fred_key)
            y10_bp = (yv - yp) * 100.0
            y10_item = {"label": "US 10Y", "value": f"{yv:.3f}%", "delta": f"{y10_bp:+.1f} bp", "tone": "bad" if y10_bp > 0 else "good", "note": f"FRED DGS10 · {ydate}"}
            status["us10y"] = source_entry(True, "FRED DGS10", f"latest {ydate}")
        except Exception as exc:
            status["us10y"] = source_entry(False, "FRED DGS10", str(exc))
            warnings.append("FRED DGS10 request failed; US 10Y left unavailable.")
    else:
        status["us10y"] = source_entry(False, "FRED DGS10", "FRED_API_KEY not configured")
        warnings.append("FRED_API_KEY not configured; US 10Y will show —.")

    # --- Recent news: optional; no numeric impact invented ---
    news = []
    if news_key:
        try:
            news = newsapi_recent(news_key, generated - timedelta(hours=30))
            status["news"] = source_entry(True, "NewsAPI", f"{len(news)} recent items")
        except Exception as exc:
            status["news"] = source_entry(False, "NewsAPI", str(exc))
            warnings.append("NewsAPI request failed; news list may be empty.")
    else:
        status["news"] = source_entry(False, "NewsAPI", "NEWS_API_KEY not configured")
        warnings.append("NEWS_API_KEY not configured; news feed will be empty.")

    # --- Official Fed speech listings: no stance hallucination ---
    speakers = []
    try:
        speakers = fed_speeches()
        status["fedSpeeches"] = source_entry(True, "Federal Reserve speeches", f"{len(speakers)} official listings")
    except Exception as exc:
        status["fedSpeeches"] = source_entry(False, "Federal Reserve speeches", str(exc))
        warnings.append("Federal Reserve speech listing could not be retrieved.")

    sentiment, pressure = pressure_model(dxy_pct, y10_bp, change_pct)
    resist, support = pivot_levels(prev)
    # Add 20-day extremes as a fourth mechanically-derived level where possible.
    recent20 = xau[: min(20, len(xau))]
    resist.append(round2(max(f(v["high"]) for v in recent20)))
    support.append(round2(min(f(v["low"]) for v in recent20)))
    resist = sorted(set(resist))
    support = sorted(set(support), reverse=True)

    price_series = compact_series(xau, 14)
    macro_series = dxy_series or {
        "label": "DXY unavailable",
        "unit": "index",
        "yMin": 0, "yMax": 1,
        "points": [{"x": generated.strftime("%Y-%m-%d"), "y": 0}],
    }

    # Keep model keys for backward-compatible rendering, but explicitly describe them as heuristic.
    model = {
        "base": 0.0,
        "formula": "dailyPressure = weighted(ΔDXY, ΔUS10Y, observed ΔXAU)",
        "note": "Transparent heuristic over sourced daily data. No headline/speech percentage impact is fabricated.",
        "weights": [{"k": "DXY daily move", "v": 0.45}, {"k": "US 10Y daily move", "v": 0.45}, {"k": "Observed XAU momentum", "v": 0.10}],
        "strength": [{"k": "Source available", "v": 1.0}, {"k": "Source unavailable", "v": 0.0}],
        "surprise": [{"k": "Not auto-estimated", "v": 0.0}],
    }

    meta = {
        "pipelineVersion": "2.0.0",
        "generatedAt": generated.isoformat(timespec="seconds"),
        "timezone": "Asia/Kuala_Lumpur",
        "cadence": "daily",
        "expectedUpdateLocal": "07:10",
        "staleAfterHours": 30,
        "verified": True,
        "seed": False,
        "sourceStatus": status,
        "warnings": warnings,
    }

    snapshot = {
        "meta": meta,
        "updated": generated.strftime("%Y-%m-%d %H:%M MYT"),
        "session": "Daily verified snapshot · sourced data + labelled heuristic overlays",
        "price": {
            "spot": round2(spot),
            "change": round2(change),
            "changePct": round2(change_pct),
            "dayRange": f"{l:,.2f} - {h:,.2f}",
            "monthPct": round2(pct_change(spot, approx_1m)),
            "yearPct": round2(pct_change(spot, year_base)),
            "ath": round2(max(f(v["high"]) for v in xau)),
            "note": f"Latest provider daily bar: {latest['datetime']}; rolling history used: {len(xau)} bars",
        },
        "macro": [dxy_item, y10_item, brent_item],
        "sentiment": sentiment,
        "model": model,
        "news": news,
        "speakers": speakers,
        "levels": {"resistance": resist, "support": support, "note": "Classic pivot levels from previous daily OHLC plus recent 20-day extreme; mechanical, not guarantees."},
        "board": board,
        "calendar": [],
        "pressure": pressure,
        "priceSeries": price_series,
        "macroSeries": macro_series,
        # Backward compatibility for older renderer builds.
        "oddsSeries": macro_series,
        "sources": [
            "Twelve Data — XAU/USD daily market data",
            "Federal Reserve — official speech listings",
        ] + (["FRED — DGS10 US 10-Year Treasury Constant Maturity Rate"] if fred_key else []) + (["NewsAPI — recent gold/macro headlines"] if news_key else []),
    }

    text = "/* AUTO-GENERATED by scripts/update_xauusd.py. Do not hand-edit. */\nwindow.XAUUSD_DATA = " + json.dumps(snapshot, ensure_ascii=False, indent=2) + ";\n"
    OUT.write_text(text, encoding="utf-8")
    print(f"Wrote {OUT} at {snapshot['updated']} with {sum(1 for s in status.values() if s['ok'])}/{len(status)} sources OK")
    for w in warnings:
        print("WARNING:", w)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
