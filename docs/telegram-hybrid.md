# Helix hybrid mode

The persistent callback service owns Telegram getUpdates and immediate BBMA
button replies. Existing Actions workflows own bounded market-data/snapshot
processing. News_ifxhelper retains the canonical news/reminder sender and its
existing deduplication; no second signal producer or automatic order execution
is introduced. Outbound sends and one callback listener can coexist.

Set the repository variable TELEGRAM_RUNTIME=persistent only during the
intentional cutover to the single listener from the runtime repair. The
manual 50-second callback workflow then stays disabled. Do not run scheduled
polling as a concurrent fallback. An existing webhook is preserved and a
polling conflict stops the listener instead of starting an update-consumer race.

The listener rereads its canonical BBMA observation ledger for each callback.
Configure the existing producer/synchronization process to update that ledger
on the host; this listener does not invent market observations or automatically
claim a stale local checkout is live. Persistent mode never falls back to the
validation fixture. An absent ledger produces unavailable history, not a
synthetic live signal. Provider freshness remains a distinct verification gate.

Keep draft source PR checks offline: the provider verification job is skipped
for drafts and available on ready_for_review/manual invocation. No new paid
provider, key, billing setting, server, or runner plan is enabled by hybrid mode.
The earlier automatic provider run is not evidence of Telegram restoration.

Acceptance: verify a real authorized callback, one consumer, expected bot
identity, canonical ledger updates arriving from the existing producer, missing
history handled honestly, transient network recovery and host restart. Code
regressions pass locally; this session has not activated or verified a host.

## Source verification

Full local regression suite: **329 passed, zero failures**. Source compilation,
workflow/dispatch contract validation (where changed) and diff checks passed.
The live host, actual dispatch credentials, Telegram replies and deployment
cutover have not been verified. These counts do not claim production activation.
