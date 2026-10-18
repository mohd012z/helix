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
