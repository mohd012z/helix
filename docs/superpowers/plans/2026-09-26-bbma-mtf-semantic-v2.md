# BBMA MTF Semantic V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a deterministic, transparent BBMA multi-timeframe semantic layer that separates MN/W1 macro context, D1/H4 structural bias, H1/M30 setup development, and M15/M5 trigger maturity without enabling live execution.

**Architecture:** Normalize all MTF evidence through one adapter, derive four independent semantic dimensions, and feed those into confluence while retaining compatibility fields. Propagate the semantic snapshot through shadow candidate/observation/replay so evidence reports can reconstruct why a candidate progressed or stopped.

**Tech Stack:** Node.js ES modules (`.mjs`), existing repository BBMA/news-shadow modules, Node test runner, GitHub Actions HELIX VEYRA CI.

**Spec:** `docs/superpowers/specs/2026-09-26-bbma-mtf-semantic-v2-design.md`

## Global Constraints

- BBMA remains the only source of technical direction.
- News/macro may contextualize or gate but may not originate BUY/SELL direction.
- MN/W1 opposition is context, not an automatic direction reversal or hard veto.
- Missing MN/W1 alone must not make otherwise sufficient lower-timeframe evidence globally `INCOMPLETE`.
- No broker execution, automatic order creation, lot sizing, SL/TP, or live cutover.
- Preserve deterministic/frozen evidence contracts and compatibility fields during migration.
- Duplicate timeframe entries in legacy array input are rejected deterministically with `MTF_DUPLICATE_TIMEFRAME`.

## Review Focus

- Legacy array input containing duplicate timeframe rows must fail deterministically rather than silently overwrite evidence.
- Partial macro availability (MN missing but W1 present, or vice versa) must remain inspectable and must not globally block a valid setup.
- Opposed MN/W1 with aligned D1/H4/H1/M30/M15/M5 must preserve BBMA setup direction and expose opposition only as context.
- Required structural/setup evidence that is malformed, stale, or insufficient must block at the correct layer rather than being mislabeled as optional context loss.
- Downstream shadow/replay serialization must preserve semantic fields without mutating or recomputing the original observation.

---

## File Structure

- Create `macro/bbma/mtf-normalize.mjs` — canonical evidence-shape adapter and duplicate validation.
- Create `macro/bbma/mtf-semantic.mjs` — pure semantic derivation for macro, structure, setup, and trigger layers.
- Modify `macro/bbma/mtf-evidence.mjs` — distinguish required decision evidence from optional MN/W1 context when deriving global completeness.
- Modify `macro/bbma/confluence.mjs` — consume normalized Semantic V2 output; retain compatibility `direction`/`readiness` fields and explicit reason codes.
- Modify the existing shadow candidate/observation modules that currently copy confluence metadata — propagate Semantic V2 snapshot without execution behavior.
- Modify replay/evidence serialization only where needed to preserve the semantic snapshot verbatim.
- Add focused tests beside the existing `tests/js/bbma-*.test.mjs` suites plus one end-to-end Semantic V2 contract test.

### Task 1: Canonical MTF Evidence Adapter

**Files:**
- Create: `macro/bbma/mtf-normalize.mjs`
- Test: `tests/js/bbma-mtf-normalize.test.mjs`

**Interfaces:**
- Produces: `normalizeMtfEvidence(evidence) -> { byTimeframe, ruleVersion, dataStatus, sourceState }`
- `byTimeframe` contains only `MN,W1,D1,H4,H1,M30,M15,M5` and is immutable.
- Duplicate legacy-array timeframe input throws an error carrying code `MTF_DUPLICATE_TIMEFRAME`.

- [ ] Write failing tests for keyed-object input, legacy-array compatibility, unknown timeframe ignore, and duplicate rejection.
- [ ] Run `node --test tests/js/bbma-mtf-normalize.test.mjs`; expected RED because adapter does not exist.
- [ ] Implement `normalizeMtfEvidence()` with one canonical normalization path and deterministic validation.
- [ ] Re-run the focused test; expected all PASS.
- [ ] Commit `feat: add canonical BBMA MTF evidence adapter`.

### Task 2: Correct Completeness Semantics

**Files:**
- Modify: `macro/bbma/mtf-evidence.mjs`
- Test: existing MTF evidence tests plus `tests/js/bbma-mtf-semantic-completeness.test.mjs`

**Interfaces:**
- Consumes existing per-timeframe detector evidence.
- Produces aggregate evidence where missing MN/W1 is contextual availability metadata, while missing required structural/setup evidence retains `INCOMPLETE` semantics.

- [ ] Add failing tests proving missing MN/W1 alone does not force global `INCOMPLETE`, while missing required decision evidence still does.
- [ ] Run focused tests and record expected RED assertions.
- [ ] Make the minimal aggregate-completeness change; do not alter detector mathematics.
- [ ] Run existing MTF evidence tests plus new completeness tests; expected PASS.
- [ ] Commit `fix: separate macro availability from BBMA completeness`.

### Task 3: Semantic V2 Engine

**Files:**
- Create: `macro/bbma/mtf-semantic.mjs`
- Test: `tests/js/bbma-mtf-semantic.test.mjs`

**Interfaces:**
- Consumes: output of `normalizeMtfEvidence()`.
- Produces: `evaluateMtfSemantics(normalized) -> { setup_direction, macro_context, structural_bias, setup_state, trigger_state, reason_codes, data_status, rule_version }`.
- Macro state values: `ALIGNED|OPPOSED|MIXED|NEUTRAL|UNAVAILABLE`.
- Structural state values: `ALIGNED|OPPOSED|MIXED|NEUTRAL|INCOMPLETE`.

- [ ] Write failing tests for BUY and SELL aligned cases, macro opposed/mixed/unavailable, partial macro availability, D1/H4 conflict, H1/M30 maturity, and M15/M5 partial/full trigger.
- [ ] Add explicit assertion that MN/W1 cannot reverse `setup_direction`.
- [ ] Run focused semantic tests; expected RED.
- [ ] Implement the pure semantic evaluator with no news, lifecycle, broker, or scoring dependencies.
- [ ] Re-run semantic tests; expected PASS.
- [ ] Commit `feat: add BBMA MTF semantic v2 evaluator`.

### Task 4: Confluence V2 Integration and Compatibility

**Files:**
- Modify: `macro/bbma/confluence.mjs`
- Test: `tests/js/bbma-confluence.test.mjs`
- Test: `tests/js/bbma-confluence-v2.test.mjs`

**Interfaces:**
- Consumes: raw aggregate evidence through the canonical adapter and Semantic V2 evaluator.
- Produces existing compatibility fields `direction`, `readiness`, `supporting_timeframes`, `conflict_timeframes`, `reason_codes`, `data_status`, `rule_version` plus `setup_direction`, `macro_context`, `structural_bias`, `setup_state`, `trigger_state`.

- [ ] Add failing V2 tests for aligned, opposed macro, structural conflict, unavailable macro, and compatibility fields.
- [ ] Run old and new confluence suites together; expected RED only for new contract/current known failures.
- [ ] Replace independent evidence-shape interpretation with adapter + Semantic V2 consumption.
- [ ] Keep readiness progression vocabulary `OBSERVED|WATCHABLE|SETUP_READY|CONFIRMABLE|BLOCKED`; do not introduce confidence percentages.
- [ ] Verify macro opposition alone does not reverse direction or automatically block readiness.
- [ ] Run both confluence suites; expected PASS.
- [ ] Commit `refactor: integrate semantic v2 into BBMA confluence`.

### Task 5: Data-Health and Reason-Code Transparency

**Files:**
- Modify only the existing BBMA data-health/confluence boundary modules identified by code search during execution.
- Test: `tests/js/bbma-semantic-data-health.test.mjs`

**Interfaces:**
- Produces stable reason-code families for incomplete/stale/structural/setup/trigger/macro states without changing detector direction ownership.

- [ ] Add failing tests for stale required data, insufficient required data, unavailable macro context, and opposed macro context.
- [ ] Run focused test; expected RED.
- [ ] Map each condition to stable reason codes including `STALE_DATA`, `INCOMPLETE_DATA`, `D1_H4_ALIGNED`, `STRUCTURAL_BIAS_OPPOSED`, `H1_M30_SETUP_ALIGNED`, `M15_TRIGGER_PRESENT`, `M5_CONFIRMATION_MISSING`, and MN/W1 macro codes where applicable.
- [ ] Run focused plus existing data-health tests; expected PASS.
- [ ] Commit `feat: expose transparent BBMA semantic reason codes`.

### Task 6: Shadow Candidate and Observation Propagation

**Files:**
- Modify: existing shadow candidate module found under the repository's BBMA/news-shadow stack.
- Modify: existing observation ledger/record builder that stores BBMA candidate metadata.
- Test: `tests/js/bbma-semantic-shadow-propagation.test.mjs`

**Interfaces:**
- Consumes Confluence V2 result.
- Produces immutable shadow evidence carrying `setup_direction`, `macro_context`, `structural_bias`, `setup_state`, `trigger_state`, and `reason_codes` verbatim.

- [ ] Add failing test proving Semantic V2 fields survive candidate -> observation without recomputation or loss.
- [ ] Add assertion that news cannot create direction when `setup_direction` is null.
- [ ] Run focused test; expected RED.
- [ ] Add semantic snapshot propagation only; do not add execution behavior.
- [ ] Re-run shadow/news tests; expected PASS.
- [ ] Commit `feat: propagate BBMA semantic context into shadow evidence`.

### Task 7: Replay and Evidence Preservation

**Files:**
- Modify replay/outcome/evidence modules only if current serialization drops the new semantic snapshot.
- Test: `tests/js/bbma-semantic-replay.test.mjs`

**Interfaces:**
- Consumes immutable observation semantic snapshot.
- Produces replay/evidence records that preserve the original semantics and allow grouping by macro/structural/setup/trigger strata.

- [ ] Add failing replay round-trip test for Semantic V2 metadata.
- [ ] Run focused replay test; expected RED if serialization currently drops fields.
- [ ] Make the minimal serialization/preservation change; do not recompute historical semantics from newer rules.
- [ ] Run Phase 5 replay/evidence suites; expected PASS.
- [ ] Commit `feat: preserve BBMA semantic strata in replay evidence`.

### Task 8: End-to-End Contract and Lifecycle Regression

**Files:**
- Create: `tests/js/bbma-mtf-semantic-e2e.test.mjs`
- Modify production code only if the E2E test reveals a real interface defect.

**Interfaces:**
- Exercises: aggregate -> normalize -> semantic -> confluence -> data/news gate -> lifecycle -> shadow observation -> replay/evidence.

- [ ] Add E2E fixtures for fully aligned BUY/SELL, macro opposed, macro unavailable, D1/H4 conflict, partial trigger, news blocked, stale required data, invalidated, and expired paths.
- [ ] Assert no fixture creates broker execution, order sizing, SL/TP, or news-originated direction.
- [ ] Run E2E suite; resolve only root-cause interface defects.
- [ ] Run existing lifecycle and confirmation-gate suites; expected PASS.
- [ ] Commit `test: cover BBMA semantic v2 end to end`.

### Task 9: Full Regression and Cloud Verification

**Files:**
- No planned production edits; fixes require returning to the owning task/root cause.

**Interfaces:**
- Produces verification evidence for the implementation SHA.

- [ ] Run the repository's full JavaScript test command exactly as configured in package/workflow files.
- [ ] Confirm zero failures locally/in the available execution environment; do not infer GREEN from targeted tests.
- [ ] Push implementation commits to `feature/bbma-mtf-d1-mn-hardening`.
- [ ] Verify a fresh HELIX VEYRA CI run is attached to the implementation HEAD SHA.
- [ ] Inspect failed job logs if any; patch root cause and repeat targeted + full verification.
- [ ] Declare GREEN only when the fresh implementation-SHA workflow is `completed/success` and the expected regression suite has zero failures.

## Acceptance Trace

- Canonical adapter: Tasks 1 and 4.
- MN/W1 optional context semantics: Tasks 2 and 3.
- Direction ownership: Tasks 3, 4, 6, 8.
- D1/H4 structural bias: Tasks 3 and 4.
- H1/M30 setup and M15/M5 trigger visibility: Tasks 3, 4, 6.
- Stable transparent reasons: Task 5.
- Shadow/replay traceability: Tasks 6 and 7.
- Lifecycle/news invariants: Tasks 6 and 8.
- Full CI evidence: Task 9.
