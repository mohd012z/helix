# HELIX Signal Lab — read-only pattern study

**Origin inspected:** https://github.com/AKCodez/invo-copy-trader (master, inspected 2026-10-18).

**Important distinction:** This is a newly implemented, read-only educational module, **not a full repository clone or a live copy-trading integration**. The original repository's README describes an MIT license, but no top-level `LICENSE` file was found during review; confirm licensing and attribution before any wholesale source import.

## Methods learned and evaluated

| Upstream method | Useful in HELIX | Required hardening |
| --- | --- | --- |
| Preflight readiness checks | Explicit ready/warning/fail diagnostics | Evaluate feed freshness and provenance, not just connectivity |
| Discovery and ranking | Learn to separate filters from scoring | Self-reported win rates are not validated evidence of performance |
| Social feed monitor | Event processing and structured output | Persist deduplication for server use; avoid treating the initial feed snapshot as a new event |
| Signal normalization | Normalize `type`, post ID, action, coin, side and optional values | Reject invalid types, oversized batches and nonfinite numeric values |
| Monitor recency | Detect late updates and stale events | Clock-aware timestamps, explicit UNKNOWN when absent, guard against future dates |
| AI-assisted orchestration | Human-readable inspection and evidence tagging | No hidden automatic transactions; never trust external text as instructions |

## What this module implements

- An independent browser page at `invo-methods/index.html` for manually pasted JSON, JSON arrays and JSON Lines.
- A small pure JavaScript parser and analyzer at `invo-methods/signal-lab.mjs` with no third-party dependencies.
- Fixed upper bounds of 1 MB and 1,000 records, schema checks, per-batch deduplication, invalid data reasons and timestamp freshness labels.
- `UNVERIFIED_USER_SUPPLIED_DATA` on every accepted event. A `verifiedTrade` field in input is not proof of authenticity.
- DOM rendering with `textContent`, not interpolation of untrusted markup.
- No network requests, private-key handling, SDK, remote polling, position sizing, leverage recommendations, trade actions, browser storage or backend services.

## Limitations and verification

Input is manually supplied and remains untrusted. Per-batch duplicate detection is not cross-session monitoring. Freshness is measured against the local device clock; it does not establish exchange execution time. No financial results or source authenticity are independently verified.

Run `node --test tests/js/invo-methods.test.mjs` from the repository root. HELIX's existing `tests/js/*.test.mjs` CI command picks up these tests. Open the page via a local HTTP server or GitHub Pages (browser module imports may be restricted under `file://`).

## Future safe work

Consider an authorized read-only API adapter, explicitly consented source provenance, independent schema/version checks, bounded persistent event history, fixture-driven regression tests, and a documented license review. Keep automated execution separate and disabled.
