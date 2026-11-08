# HELIX — Codespaces from a phone

The GitHub Codespaces workspace supplies Python 3.12 plus Node.js 22 for HELIX development. Existing GitHub Actions remain authoritative for tests, snapshot production and GitHub Pages deployment. No PC or Coder.com server is required, but Codespaces consumes cloud usage.

## Start on a phone

1. Sign in at [HELIX on GitHub](https://github.com/mohd012z/helix) and open **Code → Codespaces** (enable desktop-site view in a mobile browser if needed).
2. Before this PR is merged, select `feat/mobile-codespaces-ci-20261019`; afterward, select `main`.
3. Choose the smallest available 2-core Codespace and let setup install Python dependencies from `requirements.txt`.
4. In the web terminal, run checks, edit files, commit on a feature branch and create a PR. Do not push directly to `main`.

## Test and preview

```bash
node --version
python --version
node --test tests/js/*.test.mjs
node --test tests/*.test.mjs
node tools/verify-migration.mjs
python -m http.server 8000
```

Open the **Ports** tab for port 8000 and its forwarded URL to preview the static site on a phone. Never expose private credentials through a forwarded port.

## CI, cost and security

The existing **HELIX VEYRA CI** and **HELIX VEYRA Migration Gate** still run the actual program tests. The daily market snapshot and GitHub Pages deployments are not modified. The new **Codespaces configuration check** validates only the devcontainer configuration and runs for related PR changes; it does not build the container, fetch live market prices or deploy to production.

Stop idle workspaces at [github.com/codespaces](https://github.com/codespaces) and monitor [billing](https://github.com/settings/billing/summary). Account allowances vary. Keep API tokens in GitHub secrets, never in source or Codespaces JSON. Review all existing checks and open a real Codespace to verify startup before merging.
