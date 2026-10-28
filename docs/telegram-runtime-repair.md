# Persistent Telegram listener repair

## Scope and current evidence

The source repair is tested locally. No persistent host, bot credentials, live
webhook registration, or live Telegram reply was available in this session.
Installing a service file does not prove the bot is online. GitHub Actions
success proves a job completed, not continuous listening.

## Cutover on an existing Linux host

Use the existing host, not this transient development workspace. Do not create
a paid service for this repair. Provision a `telegram-bots` service user, place
the tested checkout at `/opt/telegram-bots/helix`, and install its dependencies.
For Python repositories create `.venv`; for BizCrax36 the listener is stdlib-only.
Keep credentials in `/etc/telegram-bots/helix.env` (root-owned, mode 0600),
never in git or shell history. The service file has concrete paths and no
embedded credentials.

Required host environment: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Node 22 or later is required. Set the GitHub repository variable
`TELEGRAM_RUNTIME=persistent` before starting the service; wait for any manual
callback workflow to finish. The service uses continuous callback polling and
an OS lock instead of the manual 50-second session. API requests have a
40-second transport timeout, and transient failures back off to 30 seconds.

Keep `BBMA_OBSERVATION_LEDGER` pointed at the canonical, updated observation
ledger. The callback process rereads it for new alerts; it does not produce or
synchronize market observations. Persistent mode never substitutes the
validation fixture for missing live data. Alerts owned by News_ifxhelper must
continue through its canonical sender/dedupe path; do not add another sender.
Confirm token ownership before allowing this listener to consume that bot's
callbacks. Restarting the process does not make stale observation data current.


Stop every other consumer of this same bot token, including processes on
other hosts, before activation. Local locks cannot prevent cross-host conflicts.
Do not delete an existing webhook automatically. Confirm its owner and stop
it as part of an intentional cutover. Do not drop pending updates.

Copy `deploy/telegram-helix.service` into `/etc/systemd/system/`, then run
`systemctl daemon-reload` and `systemctl enable --now telegram-helix` on that host.
For BizCrax36, grant the service user ownership of the checkout's `data/`;
for msasoup grant ownership of `logs/`. systemd creates the private state
directory and restarts transient crashes. Configuration exit 78 stays stopped
so conflicts and credential errors are visible rather than retried forever.
Review `systemctl status telegram-helix` and `journalctl -u telegram-helix`.

## Required live acceptance

- Service stays active across a host reboot and a transient network failure.
- An authorized `/start` (or existing BBMA callback for Helix) receives the
  correct response; unauthorized access remains denied.
- No Telegram 409 conflicts or webhook replacement occurs.
- State survives a graceful restart; pending updates are retained.
- A second local process fails immediately without stealing updates.
- Confirm the host uses this exact reviewed commit and the expected bot identity.

## Rollback

Stop the new service first. Restore the previous host configuration and saved
database if necessary. For Actions-owned consumers only, restore repository
variable `TELEGRAM_RUNTIME=actions` after the persistent service is stopped.
Do not run both modes as a fallback race.

## Local verification, 28 October 2026

`node --test tests/js/*.test.mjs`: **329 passed, zero failures**. Python compilation / Node syntax
checks and `git diff --check` passed. Service unit syntax was checked with
`systemd-analyze verify` using temporary copies whose Python executable paths
were substituted for the available interpreter. The real deployment paths,
service user, credentials, host reboot/restart behavior, ledger freshness, and
live Telegram replies remain **unverified**. No paid service was enabled and no
production webhook or deployment was changed.

## Hybrid operation

See [telegram-hybrid.md](telegram-hybrid.md) for the selected listener + Actions
roles, cutover, boundaries, limits and live acceptance gates.
