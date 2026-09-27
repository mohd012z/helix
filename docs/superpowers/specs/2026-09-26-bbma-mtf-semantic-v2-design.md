# BBMA MTF Semantic V2 — Design Specification

Date: 2026-09-26
Branch: `feature/bbma-mtf-d1-mn-hardening`
Scope: BBMA multi-timeframe semantic/confluence hardening only. Shadow/replay/evidence remains non-executing.

## 1. Purpose

Separate multi-timeframe BBMA evidence into explicit semantic layers so MN/W1 context cannot accidentally behave like an entry signal or silently reverse the setup direction. Preserve existing BBMA detector behaviour while making the downstream decision path transparent, deterministic, testable, and replayable.

## 2. Non-goals / safety boundary

This change MUST NOT:
- place broker orders;
- create live BUY/SELL orders;
- calculate lot size, SL, or TP;
- allow news to originate trading direction;
- enable live cutover;
- replace existing BBMA detector mathematics without separate evidence and approval.

News remains contextual/gating evidence. BBMA remains the source of technical direction.

## 3. Timeframe semantic model

Timeframes are grouped by responsibility:

| Layer | Timeframes | Responsibility |
|---|---|---|
| Macro regime | MN, W1 | Long-horizon structural context |
| Structural bias | D1, H4 | Major directional alignment/conflict |
| Setup development | H1, M30 | BBMA setup maturity |
| Trigger/confirmation | M15, M5 | Lower-timeframe trigger maturity |

MN/W1 are contextual. Missing MN/W1 MUST NOT by itself make a valid lower-timeframe setup globally INCOMPLETE.

D1/H4 are stronger structural controls. A material D1/H4 conflict may block progression according to existing confluence rules.

## 4. Required semantic outputs

The MTF semantic/confluence result must expose independent fields rather than one overloaded state:

- `setup_direction`: `BUY | SELL | null`
- `macro_context.state`: `ALIGNED | OPPOSED | MIXED | NEUTRAL | UNAVAILABLE`
- `macro_context.supporting_timeframes`
- `macro_context.conflict_timeframes`
- `macro_context.unavailable_timeframes`
- `structural_bias.state`: `ALIGNED | OPPOSED | MIXED | NEUTRAL | INCOMPLETE`
- `structural_bias.supporting_timeframes`
- `structural_bias.conflict_timeframes`
- `setup_state`: maturity derived from H1/M30
- `trigger_state`: maturity derived from M15/M5
- existing `direction` compatibility field during migration
- existing `readiness`
- `reason_codes`
- `data_status`
- `rule_version`

All returned evidence must remain deterministic and immutable/frozen where current contracts require it.

## 5. Direction ownership

Direction must not originate from MN/W1 or news.

The semantic direction path is:

`BBMA detector evidence -> structural/setup interpretation -> setup_direction`

MN/W1 can support, oppose, be mixed, or be unavailable relative to that direction. They cannot silently convert BUY to SELL or SELL to BUY.

News/macro can contextualize or gate a candidate after BBMA direction exists. News cannot manufacture a direction when BBMA has none.

## 6. Data-shape contract

A single canonical adapter must normalize MTF evidence before confluence evaluation. It must accept the repository's canonical keyed timeframe representation and, during migration only, legacy array fixtures if required by existing tests.

Canonical normalized lookup keys:

`MN, W1, D1, H4, H1, M30, M15, M5`

Consumers must not independently reinterpret the raw evidence shape.

## 7. Incomplete vs unavailable semantics

`INCOMPLETE` means required evidence for the relevant decision layer is missing or invalid.

`UNAVAILABLE` means optional contextual evidence is absent but the lower decision layer can still be evaluated.

Therefore:
- MN/W1 missing -> macro context `UNAVAILABLE` or partial context; not automatically global `INCOMPLETE`.
- Required D1/H4/setup evidence missing -> may produce `INCOMPLETE/BLOCKED` according to the decision contract.
- Stale or malformed required data -> data-health reason and blocking behaviour where applicable.

## 8. Confluence behaviour

Confluence V2 evaluates independent dimensions:

1. Determine BBMA setup direction from eligible technical evidence.
2. Evaluate D1/H4 structural relationship to that direction.
3. Evaluate H1/M30 setup maturity.
4. Evaluate M15/M5 trigger maturity.
5. Evaluate MN/W1 macro context relative to the already-established direction.
6. Produce readiness and explicit reason codes.

Readiness retains the existing progression vocabulary where compatible (`OBSERVED`, `WATCHABLE`, `SETUP_READY`, `CONFIRMABLE`, `BLOCKED`).

Macro opposition alone is evidence/context, not an implicit direction reversal. It should not become a hard veto unless replay evidence later justifies a separately specified policy.

## 9. Transparent reason codes

Reason codes must make the decision reconstructable without reading implementation internals. Expected families include:

- `DIRECTION_BUY`, `DIRECTION_SELL`
- `D1_H4_ALIGNED`
- `STRUCTURAL_BIAS_OPPOSED`
- `H1_M30_SETUP_ALIGNED`
- `M15_TRIGGER_PRESENT`
- `M5_CONFIRMATION_MISSING`
- `MN_W1_MACRO_ALIGNED`
- `MN_W1_MACRO_OPPOSED`
- `MN_W1_MACRO_MIXED`
- `MN_W1_MACRO_UNAVAILABLE`
- `INCOMPLETE_DATA`
- `STALE_DATA`
- `DIRECTION_CONFLICT`
- `HIGHER_TIMEFRAME_CONFLICT`

Codes should be stable enough for replay/evidence aggregation; renaming requires test updates and migration awareness.

## 10. Downstream propagation

`shadow-candidate` must propagate the semantic context rather than discard it. Shadow observations/replay records must retain enough fields to answer:

- What BBMA direction existed?
- What was D1/H4 structural bias?
- What were MN/W1 doing?
- How mature were H1/M30 and M15/M5?
- What news/data-health gate applied?
- Why did lifecycle progression occur or stop?

This is evidence metadata only; it does not add execution behaviour.

## 11. Lifecycle contract

Existing lifecycle safety invariants remain:

- blocked candidates cannot progress;
- direction reversal cannot silently mutate an active signal;
- confirmation requires eligible BBMA readiness plus an allowing confirmation gate;
- invalidation/expiry remains explicit;
- news cannot create a missing BBMA direction.

## 12. Error handling

Malformed top-level evidence -> explicit type/contract error.

Known timeframe with insufficient data -> semantic unavailable/incomplete state as appropriate, not an exception.

Unknown/extra timeframe -> ignored for V2 semantic decisions unless separately supported.

Duplicate timeframe in legacy-array input -> deterministic rejection or deterministic normalization; implementation plan must choose one behaviour and test it. Preferred behaviour: reject duplicates to avoid ambiguous evidence.

## 13. Testing strategy

Implementation follows TDD. Add failing tests before production changes.

Required test groups:

1. Canonical evidence-shape adapter.
2. MN/W1 aligned macro context.
3. MN/W1 opposed macro context.
4. MN/W1 mixed macro context.
5. MN/W1 unavailable without global incomplete.
6. D1/H4 structural conflict.
7. H1/M30 setup maturity.
8. M15/M5 partial/full trigger maturity.
9. Stale/insufficient required data.
10. Direction ownership: MN/W1 cannot reverse setup direction.
11. News ownership: news cannot originate direction.
12. End-to-end `aggregate -> confluence -> shadow candidate -> observation` propagation.
13. Lifecycle regression tests.
14. Replay/evidence serialization regression.
15. Full repository test suite and cloud CI.

## 14. Migration/compatibility

Do not perform a broad rewrite. Introduce semantic V2 behind the existing module boundaries where possible.

Keep compatibility fields (`direction`, existing readiness fields) until all downstream consumers are migrated and tested. New structured semantic fields become the source for transparency/evidence reporting.

No production/live cutover is part of this migration.

## 15. Acceptance criteria

The change is accepted only when:

- MN/W1 are first-class macro context;
- MN/W1 absence alone does not globally invalidate otherwise sufficient setup evidence;
- setup direction remains BBMA-owned;
- D1/H4 structural conflict is explicit;
- H1/M30 setup and M15/M5 trigger states are separately inspectable;
- semantic fields propagate into shadow evidence;
- reason codes explain every readiness/blocking result;
- existing lifecycle/news safety invariants remain covered;
- targeted tests pass;
- full local/repository tests pass where runnable;
- fresh GitHub Actions CI for the implementation SHA is GREEN before any completion claim.

## 16. Target flow

```text
Market data
   -> BBMA detector per timeframe
   -> canonical MTF evidence
   -> Semantic V2
      -> MN/W1 macro context
      -> D1/H4 structural bias
      -> H1/M30 setup state
      -> M15/M5 trigger state
   -> Confluence/readiness + reason codes
   -> data health
   -> news/confirmation gate
   -> lifecycle
   -> shadow observation
   -> replay/outcome/evidence report
```

The architecture intentionally ends at evidence. Broker execution, automatic trade creation, position sizing, SL/TP, and live cutover remain outside scope.
