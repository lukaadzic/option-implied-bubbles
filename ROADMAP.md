# Roadmap

Where this is going, and what would have to be true to get there. Items marked
**open** have an issue and are looking for an owner.

This is a research artefact rather than a product, so the ordering is by how
much each item improves what someone can learn from the data, not by how many
users would notice.

## Near term: make the existing data usable

The estimates already cover 27 assets and 27 years. Most of the value left on
the table is in getting that data in front of people faster and with fewer
caveats.

- **Shrink the payload.** Each per-asset file is ~12MB of uncompressed JSON and
  there are 27 of them. A columnar layout (parallel typed arrays instead of
  7,000 repeated object literals) plus gzip should cut this by an order of
  magnitude. Nothing else in the project matters as much. **open**
- **Progressive loading.** Even after the format change, the first paint should
  not wait on the full history. Load a decimated series first, refine in the
  background. **open**
- **Dashboard test coverage.** Vitest and Testing Library are installed and
  unused. The data transforms in `utils/dataLoader.ts` and the interval logic in
  `BubbleSummaryPanel.tsx` are the highest-value targets. **open**
- **Accessibility pass.** Keyboard navigation and screen-reader behaviour have
  never been tested end to end. **open**

## Medium term: sharpen the estimator

`research/bubble.py` implements the core identity honestly but is not the full
published estimator, and its standard errors make an assumption that is known to
be false.

- **Nonparametric smoothing across strikes.** The published estimator smooths
  the strike dimension with a bandwidth rule; the `num_steps`,
  `optimization_threshold` and `h_number_sd` fields in the data's metadata come
  from that step. This is the largest gap between this implementation and the
  paper. **open**
- **Standard errors that survive contact with reality.** The current interval
  assumes independent quote noise across strikes. Adjacent strikes share market
  makers and move together, so the stated intervals are almost certainly too
  narrow. A HAC or cluster-robust estimator would be more honest. **open**
- **A worked example on real option data.** The estimator has only ever run on
  synthetic surfaces in this repository. Any public options snapshot would do,
  and it would turn the module from a demonstration into something verifiable.
  **open**
- **Bid-ask aware estimation.** Using mid prices throws away the spread, which
  is exactly the information that says how much to trust each strike.

## Longer term: more to compare

- **Cross-sectional ranking.** The summary panel reports where today sits in an
  asset's own history. Where it sits against all 27 assets today is a more
  useful question and the data is already in `cross-asset.json`. **open**
- **Extend the sample past August 2023.** Requires OptionMetrics access and a
  run of the estimation pipeline. Not something a contributor can do without a
  licence, but worth stating as the obvious limitation it is.
- **More assets, particularly non-US.** The method applies to any market with
  liquidly traded options. The Sydney write-up specifically names the ASX 100
  and the Australian banks.
- **Event study tooling.** The forward-return table in the README is suggestive
  and statistically underpowered. A proper event-study framework with
  non-overlapping windows and correct standard errors would let the repository
  make or refute a claim rather than gesture at one.

## Explicitly not planned

- **Real-time or live data.** This is a research artefact over a fixed sample.
  Turning it into a live signal would need a data licence, an operational
  pipeline, and a very different set of promises to whoever reads it.
- **Trading signals or backtests presented as strategy.** The paper reports a
  strategy result; reproducing it responsibly needs transaction costs, capacity
  analysis and out-of-sample discipline that this repository does not have. The
  README's forward-return table is deliberately framed as a caveat, not a
  finding, and should stay that way.
- **Native mobile apps.** The dashboard is responsive. That is enough.

## Suggesting something

Open a [discussion](https://github.com/lukaadzic/financial-bubble-detection-dashboard/discussions)
rather than an issue if it is a direction rather than a task. Issues are for
work someone could start this week.
