# HELIX Market Lab: independent Elite-class research workspace

**Status:** independent, read-only implementation. It is **not a Finviz clone**, licensed Finviz product, live-data feed, stock recommendation, or copy-trading engine.

Research reference: https://finviz.com/elite (reviewed October 2026).

## External product feature assessment

Finviz Elite advertises customizable multi-layout charts, advanced screening and presets, 10-second screener auto-refresh, extended-hours US equity quotes, market maps, ETF holdings, portfolio comparison, price/screener/calendar alerts, and CSV/Excel/API exports. These functions depend on its own backend, licensed market-data agreements and proprietary application. Finviz states that stock quotes are real-time for Elite while futures are delayed 20 minutes.

A user-facing replica cannot acquire these capabilities by cloning an HTML page. In particular, real-time data, 8 years of licensed filings, full ETF holdings, alerts delivered when the browser is closed, and 100 synced portfolios are **not** available from a static GitHub Pages site by default.

## What HELIX actually implements

| Capability | Current implementation | Restriction |
| --- | --- | --- |
| Overview / multi-page responsive workspace | Original responsive HTML/CSS/JS | Not Finviz source code / visual assets |
| Historical chart | Verified HELIX XAU/USD daily close (if available) | Never labeled live |
| Multi-chart layout | 1, 2 or 4 panels | Extra panels explicitly unavailable without series |
| Candlestick OHLC | Manually imported validated genuine OHLC records | No conversion from daily closes into fabricated candles |
| Indicators | SMA(5), SMA(20), RSI(14) | Historical descriptive indicators, not forecasts |
| Advanced screener | Symbol/name search, sector, minimum market cap, volume, change, sortable columns | Only user-imported stocks, no provider-wide universe |
| Screener presets | Browser local storage | At most 30, no account sync |
| Sector heatmap | Imported stocks grouped by sector; missing performance neutral | Not a full-market heatmap |
| Watchlist | Up to 300 ticker strings stored locally | No synced market prices |
| Alert check | Manual threshold comparison against loaded price | No background polling, email or push |
| CSV export | Filtered rows, escaped values/formula prefix defense | No Excel XLSX generator |
| Fake example | Optional clearly labeled fictional EXM1...EXM4 | Never passed as current market data |
| Secrets and execution | No credentials, no broker, no trading orders | Read-only |
| Live quotes & extended hours | NOT CONNECTED | Needs authorized backend + market-data contract |
| PyTorch AI insights | Research blueprint only | Not trained or claiming prediction ability |

## Sources and suitable libraries

- [Finviz Elite feature table](https://finviz.com/elite), [screener guide](https://finviz.com/knowledge-base/screener/getting-started-with-screener/introduction-to-screener), and [chart templates](https://finviz.com/blog/create-custom-chart-templates-for-screener-stock-pages-and-more/) for publicly documented workflow analysis.
- [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) is Apache 2.0 and supports streaming chart updates **when you supply your own permitted data**. Its attribution/NOTICE requirement applies when bundling that library. This first phase uses a standalone SVG chart to avoid dependency and redistribution issues.
- [Apache ECharts](https://echarts.apache.org/) is Apache 2.0 and offers candlestick, heatmap, multi-axis and dataZoom components. A good future implementation candidate after integration tests.
- [OpenCharts](https://github.com/cklawkc/opencharts) is a separate MIT-licensed self-hosted charting project built around Lightweight Charts. Its backend stack is heavier than HELIX's static Pages model; audit transitive license notices before reuse.
- [PyTorch Forecasting](https://pytorch-forecasting.readthedocs.io/en/stable/) can assist offline anomaly studies. It is not a source of live quotes.

## Guardrails / softrails

**Hard guardrails**: 2 MB import cap; no more than 2,000 imported stocks and 5,000 candles; strict dates, high/low consistency, finite numeric values, deduplication; no dynamically inserted raw HTML from user fields; no private API key inputs; CSV formula injection guards; and clear verified-vs-imported provenance. Missing fields never satisfy numeric screening criteria. A stale/future/unverified snapshot never becomes a live quote.

**Softrails**: warnings for imported unverified data, fictional demonstration status, market coverage gaps, local threshold-only alerts, optional indicator limitations, and disconnected live streams.

**AI research (not deployed):** implement a separate, opt-in offline training pipeline when licensed history is available. Keep chronological train/validation/test splits, embargo overlapping windows, run walk-forward evaluations with transaction-cost assumptions, compare trivial baselines, flag drift, report error intervals and calibration, and never turn model output into a verified market-data price. PyTorch never replaces source validation. Do not publish trained model predictions until validated.

## Data contracts

Stock CSV columns (required: `symbol`; other columns optional):

```csv
symbol,name,sector,industry,price,changePct,volume,marketCap,pe,low52,high52
```

All monetary and volume values are absolute numeric quantities in the supplied file's units. The interface does not infer currency or exchange for imported securities. Example data is fictional and should not be interpreted as current prices.

OHLC CSV (required: `date,open,high,low,close`; optional: `volume`):

```csv
date,open,high,low,close,volume
```

Dates must be ISO calendar days (YYYY-MM-DD). Bars must have high >= open/close, low <= open/close, positive prices and no duplicated dates. It is not possible to faithfully reconstruct OHLC from only a daily-close series.

## Verification commands

```bash
node --check market-lab/core.mjs
node --check market-lab/market-lab.mjs
node --test tests/js/market-lab.test.mjs
node --test tests/js/*.test.mjs
```

The CI workflow has been extended to include this module's tests and syntax checks, and Pages copies `market-lab/` to the published directory. Browser smoke testing and deployment verification are still required.

## Later engineering phases

1. Add a server-side gateway with **contract-authorized** market-data licensing, HTTPS/WSS, server-only secrets, subscription multiplexing, token rotation, retry/backoff, rate-limit and sequence checks, and feed-heartbeat diagnostics.
2. Add provider-approved stock universe and fundamental-data APIs; store separate provenance and observed-time metadata for each field.
3. Add genuine intraday OHLC feeds, crosshair synchronization, saved workspaces and template editor.
4. Add server-owned alert evaluation and push/email delivery with opt-in, idempotency, quiet hours and audit trails.
5. Add audited ETF holdings, filings, SEC events and portfolio research, with appropriate entitlements and access control.
6. Evaluate PyTorch research offline only after baselines and leakage-resistant backtesting.

**No Finviz scraping, private API extraction, Finviz subscription bypass, credentials copied from browser storage, or reuse of proprietary scripts/assets is required or included.**

## October 2026 deeper template and source evaluation

| Source | Verified relevance | Adoption decision |
| --- | --- | --- |
| [Finviz Elite](https://finviz.com/elite) | Product behavior reference, premium real-time and screening integration | Study interface workflows only; do not copy copyrighted UI, private endpoints or redistribution-restricted data |
| [Finviz chart template guide](https://finviz.com/blog/create-custom-chart-templates-for-screener-stock-pages-and-more/) | Templates shared across screener/chart/stock page; visual themes and indicators | Independently implement 4 preset styles with strict schema validation |
| [Finviz screener chart collections](https://finviz.com/blog/see-your-screener-results-w-fully-customizable-charts/) | Filtered result tiles become a chart collection | Added bounded 24-card imported-OHLC view with honest NO_MATCHING_OHLC placeholders |
| [OpenTerminal](https://github.com/LeonJS/openterminal) | React grid, keyboard palette and modular chart/quote components; root MIT LICENSE checked | Good **architecture study** reference. Do not import its third-party reverse-engineered quote endpoints without provider authorization |
| [FinView EODHD demonstration](https://github.com/Kevinelectronics/finviz-clone-claude-code-eodhd) | React, Tailwind, Recharts, provider-gateway idea | README claims MIT, but root LICENSE file was absent on inspection. Do not copy its source until permissions and dependency terms are verified |
| [Lightweight Charts](https://www.tradingview.com/lightweight-charts/) | Efficient financial Canvas engine, time scales, crosshair, streamed updates | Suitable future renderer after required Apache 2.0 NOTICE attribution and tested asset bundling |
| [Apache ECharts](https://github.com/apache/echarts) | Candles, financial visualization, zoom, treemaps and heatmaps | Apache 2.0 alternative; verify bundle size and licenses before integration |

### New chart-template capability

- **Calm / low-noise:** historical line, 90 bars, SMA overlay, no RSI.
- **Compact technical:** genuine OHLC candles, 60 bars, SMA, RSI.
- **High-contrast:** line, 120 bars, SMA/RSI, accessible palette.
- **Minimal reference:** line, 30 bars, no indicator overlays.

Templates can be selected in Charts, applied consistently, and saved locally under user-provided names (maximum 20 custom templates). Color themes and chart settings are validated against an explicit allowlist; arbitrary markup/CSS input cannot become chart settings.

A second screener result mode shows the **first 24 filtered stocks** as chart cards. Cards contain historical bars **only when the corresponding ticker has a separately imported and validated OHLC history**. Absent bars produce a visible unavailable state, not a substituted market chart. OHLC imports may carry an optional `symbol` field; if any record includes a symbol, every record must include one. Up to 200 different OHLC symbols are supported per file, with a total of 5,000 bars.

### Expanded importer contract

```csv
symbol,date,open,high,low,close,volume
ABC,2026-10-14,100,104,99,102,500000
ABC,2026-10-15,102,105,101,104,450000
XYZ,2026-10-14,50,52,48,51,200000
```

The records above illustrate the **file format only**, not actual prices. Do not interpret them as quotes. The existing symbol-free OHLC format remains supported as a single `IMPORTED` series; it must not be associated with a real ticker without accompanying identity evidence.

**Further gaps relative to Finviz Elite:** the initial workspace still lacks licensed live stock quotes, after-hours trading data, complete equity universe, chart drawing tools, events/filing feeds, and provider-level fundamentals. Static Pages cannot run the server-side jobs needed for persistent alerts. Templates are locally saved only, not synced to an account. No machine-learning model or PyTorch model has been trained or validated, and the UI makes no predictive claims.

New verification gate: `node --test tests/js/market-lab-templates.test.mjs`, included automatically by the existing test-glob workflow. Keep this draft PR unmerged until all relevant CI and browser smoke tests pass.

## Phase 2: historical asset comparison (2026-10-18)

Finviz's [April 9, 2026 Compare release](https://finviz.com/blog/how-to-compare-stocks-and-etfs-in-seconds/) adds synchronized comparison charts, historical returns, monthly heatmaps, fundamental comparisons and relative-performance views. HELIX now implements an independent **historical price** subset in a distinct `Compare` view.

### Implemented
- Exactly observed, matching calendar days across 1–8 selected price histories. Non-overlapping dates are excluded and counted explicitly.
- Rebased price index starting at **100** on the earliest commonly observed date, plus original first/last closes, period total return and historical performance ordering.
- Pearson correlation of **log returns over aligned observed intervals**. A correlation is unavailable when data are sparse (under three return intervals) or constant; no value is invented.
- Month-end closing-price changes only when the immediately preceding calendar month is present. Missing months remain N/A; a partial last month is possible and should not be treated as complete.
- Optional inclusive date-range controls and a source-separated `HELIX.XAU/USD` identifier. Imported tickers stay unverified and cannot silently replace HELIX's verified XAU history.
- Stable DOM construction using `textContent` and SVG nodes; no copied Finviz scripts or external data calls.
- Numerical overflow checks reject rebased values/return sequences that cannot safely be represented.

### Verification evidence and limitations
- `node --test tests/js/market-lab-comparison.test.mjs`: 9 local focused tests pass, including sparse dates, overlap, invalid inputs, numeric overflow and undefined correlation.
- Focused Playwright/Chromium **component** test at 420 × 820 pixels: 2 comparison rows, SVG chart and correlations rendered without browser errors.
- The full deployed HELIX page, visual responsive layout on physical iOS/Android devices, data provider entitlement, and production deployment **have not been verified** by that component test.
- Relative performance uses historical closing prices; it does **not** incorporate corporate-action adjustments, dividends, exchange-rate translation or transaction fees unless the source data already encodes them.
- Correlation of irregularly spaced aligned observations describes those *intervals*, not a standardized daily statistic. With different market calendars, users should inspect the number and spacing of matching dates before interpretation.
- The result is **not** a live market data feed, stock forecast, recommendation or brokerage function.

### Secure, authorized real-time phase: source architecture

Twelve Data's [WebSocket FAQ](https://support.twelvedata.com/en/articles/5194610-websocket-faq) states that WebSocket streaming primarily supplies price updates, not native OHLC or technical-indicator streams. Twelve Data distinguishes separate API and WebSocket quotas; published [credits documentation](https://support.twelvedata.com/en/articles/5615854-credits) describes HTTP 429 on credit exhaustion. Live stock display and redistribution require permission and appropriate exchange/provider entitlements.

Recommended service boundary:

```text
Approved licensed market data
      |
Private backend collector (server-only key, entitlement check, rate budget)
      |
Provider-specific parse, instrument metadata, exchange sessions and sequence audit
      |
Canonical envelope {symbol, market, price, eventTime, receivedTime, session, provenance}
      |
Time and symbol validation / duplicate rejection / outage detection
      |
Authorized client transport (HTTPS snapshots + authenticated WSS subscriptions)
      |
HELIX read-only chart layer: LIVE only when the licensed channel is healthy
```

Stop new subscriptions after HTTP 429 / quota exhaustion and honor published retry guidance; never substitute guessed ticks or label the daily-close snapshot LIVE. Aggregate OHLC only from an authorized, sequence-checked and sufficiently complete tick feed; otherwise expose `GAP/UNAVAILABLE`.

For a future optional PyTorch module, keep model output separate from measured prices, use chronological and embargoed validation splits, include benchmark comparisons and nonstationarity/drift checks, and never advertise synthetic predictions as live quotes. No neural-network model has been trained, deployed or performance-verified in this PR.

### Relevant official feature references

- [Finviz Elite capabilities](https://finviz.com/elite), including multi-layout charts and the expanded stock screener.
- [April 2026 Compare research](https://finviz.com/blog/how-to-compare-stocks-and-etfs-in-seconds/).
- [August 2026 unified asset pages](https://finviz.com/blog/a-better-way-to-explore-futures-indexes-and-crypto-on-finviz/).
- [July 2026 screener-to-chart collections](https://finviz.com/blog/see-your-screener-results-w-fully-customizable-charts/).
- [Lightweight Charts v5 documentation](https://tradingview.github.io/lightweight-charts/docs/5.0) and its required NOTICE attribution if bundled later.

## Phase 3: original Matrix and user-authorized Finviz Maps (18 October 2026)

**Source-backed research**
- Finviz [September 8 Matrix announcement](https://finviz.com/blog/the-finviz-matrix-market-breadth-visualized/) describes industry-by-market-cap grid/cluster views, metric switching and a colorblind palette.
- Finviz [October 9 Maps Embed announcement](https://finviz.com/blog/you-can-now-embed-finviz-maps-on-your-website-blog-or-app/) documents its official self-service iframe generator (Maps → Embed Map). It allows members to select markets, performance periods, map dimensions and color palettes. It does **not** publish one universal iframe source URL in that article.

**Implemented in HELIX**
- Added `Matrix` page: each row is a pair of *sector + industry*, columns classify imported market caps as Mega (≥$200B), Large (≥$10B), Mid (≥$2B), Small (≥$300M), Micro, and Unknown. These are HELIX's **own tier conventions**, not an official Finviz dataset or classification.
- Supports selecting imported change %, price versus 52-week high/low, P/E, and absolute volume. Each cell shows the **median of available observations**, not an imaginary average market return, and reports `observations/total`; missing values remain N/A. Data from other currencies must be normalized to USD **before** market-cap tiering—the module does not perform FX conversion.
- Search industries, filter sectors, switch to a colorblind-friendly palette, paginate 50 industries at a time, select a cell to inspect source tickers and jump back to the screener.
- No quote polling, web scraping, trade placement, Finviz source code, charts, icon files or proprietary assets copied.
- Added optional `Hosted Maps` view, which has **no automatic external request**. Open Finviz Maps in a new tab, use the official `Embed Map` dialog, copy the generated iframe code, paste it into HELIX, and press **Preview authorized map**. The code is parsed but is **never inserted as HTML**. Only HTTPS map-scoped URLs with the precise Finviz hostname are accepted; javascript: URLs, credentials, sensitive query names and lookalike domains are rejected.
- A third-party iframe uses lazy loading, restrictive sandbox flags, scoped referrer policy and explicit attribution. The embed's working behavior depends on Finviz's current code and browser policy; HELIX does not authenticate its feed, infer live quote status or override Finviz sign-in restrictions. If the generator emits a different URL shape, validation intentionally rejects it until the pattern is reviewed against official documentation.

**Verification**
- `tests/js/market-lab-matrix.test.mjs`: 8 new tests covering tier thresholds, sector/industry identity, proper medians, missing observations, bounded sizes, strict HTTPS/host/path embed checks and rejected malicious snippets.
- `tests/js/market-lab-ui-contract.test.mjs`: checks both tabs and HTML IDs used by the Matrix/Maps controller, and prohibits raw HTML injection or remote fetch in the new renderer.
- `.github/workflows/macro-desk-ci.yml`: syntax-checks `matrix.mjs`, `matrix-view.mjs`, `map-embed.mjs` and runs all JavaScript tests.
- Latest verified run: **HELIX VEYRA CI passed; Migration Gate passed.** Independent Market Board Provider Verify failed on Twelve Data HTTP 429 quota while regenerating XAU daily snapshot; this remains an external data-quality blocker, not a UI pass. 
- The new hosted embed has **not** been tested against a real member-generated embed URL. Full production GitHub Pages, physical phone layouts and live third-party iframe rendering are still unverified. Keep PR #33 in Draft.

**Further requirements before feature equivalence:** provider-approved market universe and normalized reporting currency, historical fundamental updates, licensed intraday/extended-hours streaming, chart/heatmap accessibility audit, persisted per-user views with authentication, and opt-in server-side alert delivery. The embedded Finviz map, when authorized and available, is Finviz-hosted content, not a license to redistribute its underlying data.

## Phase 4: actual browser release gates (18 October 2026)

HELIX now has an independent [Chromium browser CI workflow](../.github/workflows/market-lab-browser.yml) on pull requests affecting Market Lab UI and its data snapshot. It uses the official Playwright container with an exact package version (`1.64.0`), launches the actual HTML+JS+CSS from an isolated local Node HTTP server, and blocks **all** third-party network traffic from the browser. The test does not scrape Finviz, does not request quotes, and uses only fictional fixtures.

**Scenarios covered on all three widths:** phone portrait (390×844, mobile/touch), tablet (820×1180, touch), and desktop (1440×900). Assertions check navigation availability and no document-level horizontal overflow; fictional sample display and labels; importing permitted local stock JSON and checking Matrix statistics; accessible Matrix palette and cell drilldown; importing *synthetic* OHLC series and verifying comparison chart, ranking and correlation tables; rejection of hostile map-embed hosts with no network requests; opt-in frame creation for allowed URLs; and removal of the frame. Browser runtime exceptions fail the build.

Evidence from the first successful full-page run (before the subsequent currency-disclosure edit):
- GitHub Actions run: https://github.com/mohd012z/helix/actions/runs/39129747281
- Browser screenshots: https://github.com/mohd012z/helix/actions/runs/39129747281/artifacts/12137770735
- Browser log recorded PASS for all 3 viewports and confirmed no outside network requests. These are **emulated Chromium viewport/device checks**, not physical Safari/iOS or Android Chrome tests.
- HELIX VEYRA CI and Migration Gate passed on the same tested head. The independent live-provider check returned `429 rate limit` while fetching XAU; it is not proof of a page defect. A previous PR head `848935e` had all three older workflows passing.

For manual reproduction from a checkout:
```sh
npm install --prefix tests/browser --ignore-scripts --no-audit --no-fund
npx --prefix tests/browser playwright install chromium
node tests/browser/market-lab-smoke.mjs
```

The browser workflow uses `mcr.microsoft.com/playwright:v1.64.0-noble` to match its browser binary to the pinned Playwright library. Screenshot artifacts are attached to GitHub Actions runs for 7 days. GitHub Pages continues to deploy **only from main**, so this Draft PR is not an independently accessible production URL.

**Release is still held:** no physical mobile device verification, no source-backed real Finviz member iframe payload, no authenticated/licensed real-time stock data, no accessible screen-reader audit, and no deployment validation on production Pages. Do not merge until all required branch policy and source verification checks are satisfied.

**Imported currency warning:** HELIX currently assumes values called `marketCap` represent USD and does not convert exchange rates. For non-USD data, tier assignments and `$` formatting may be wrong; use normalized/authorized USD values or treat the classification as unverified. This warning now appears inside both Screener and Matrix views.
