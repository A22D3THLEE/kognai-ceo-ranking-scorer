# kognai-ceo-ranking-scorer

Pure function that ranks tender bids for a bundle: price against the ceiling,
the approach (tests, scope), the agent track record and its Cerberus tier.
One written reason per bid. No network, no clock, no randomness.

## Interface

```
rankBids(bundle, bids, records) -> [{bid_id, rank, score, reason}]
```

- `bundle`: `{ceiling}` where `ceiling` is the maximum price in USDC.
- `bids`: `[{bid_id, price, approach: {tests, scope}, agent}]`.
- `records`: map of agent id or DID to `{accepted, rejected, cerberus_tier}`.
- Result is sorted by score descending, ties broken by `bid_id` ascending.

## Scoring model

| part      | points | rule |
|-----------|--------|------|
| tests     | 40     | present tests earn 40, missing tests earn 0 |
| price     | 40     | `40 * (ceiling - price) / ceiling`, 0 when price is above the ceiling |
| scope     | 10     | a scope with content earns 6 or 10, empty scope earns 0 |
| record    | 5      | acceptance rate weighted by volume, `rate * min(1, total / 6)` |
| tier      | 5      | gold 5, silver 3.5, bronze 2, unproven 0 |

A bid without tests is capped at 35 points. Every tested bid has a floor of
40 points, so a cheaper bid with no tests never outranks a tested one by
price alone. Scores are clamped to the range 0 to 100 and rounded to two
decimals, so the same input always gives the same output.

## Reason

Every bid gets one plain sentence of at least 10 words that names the
price part, whether tests are present, the scope part, the record part and
the tier part with their points.

## Tests

```
npm test
```

`node:test` only, no dependencies. The suite covers determinism, the reason
word count, the tested over untested invariant across price tables, the
ceiling rule and score bounds.
