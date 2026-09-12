# Contributing

Contributions are welcome, including from people who have never touched option
pricing. The dashboard, the estimator and the docs all need different skills and
you do not need all three.

## Getting set up

The dashboard needs [Bun](https://bun.sh). The estimator needs Python 3.11+.
Neither depends on the other, so install only the half you plan to work on.

```bash
git clone https://github.com/lukaadzic/financial-bubble-detection-dashboard
cd financial-bubble-detection-dashboard

# Dashboard
bun install
bun run dev          # http://localhost:3000

# Estimator
python -m venv .venv && source .venv/bin/activate
pip install -r research/requirements.txt
pytest research -q
```

There is nothing to configure. The dashboard reads its data from a public,
read-only blob store, so it works immediately after `bun install`. You only need
a `BLOB_READ_WRITE_TOKEN` if you are uploading new estimator output, which is
covered in [`docs/blob-storage.md`](docs/blob-storage.md).

## Before opening a pull request

```bash
bun run check        # biome lint + format
bunx tsc --noEmit    # typecheck
bun run build        # production build
pytest research -q   # only if you touched research/
```

All four are run by CI on every pull request. `bun run check --write` fixes most
formatting complaints on its own.

Please also load the page and look at it. The charts render from a 12MB payload
and a lot of the failure modes here are visual rather than something a test
catches.

## Good first issues

Ordered roughly by how much context you need.

**No finance background needed**

- The per-ticker JSON files are 12MB and served uncompressed. A columnar or
  binary format would cut the payload by most of that. This is the single
  biggest thing holding the dashboard back.
- There is no loading progress while that 12MB downloads, just a spinner.
- Keyboard navigation through the asset selector and heatmap has not been
  tested with a screen reader.
- The dashboard has no tests. Vitest and Testing Library are already installed
  and unused.

**Some finance background helps**

- `MARKET_EPISODES` in `src/types/bubbleData.ts` shades three windows. More
  episodes, or better-sourced dates for the existing three, would make the
  charts easier to read against events people remember.
- The summary panel reports a percentile against the asset's own history. A
  cross-sectional percentile (where does SPX sit against all 26 today) would be
  more useful and the data for it is already in `public/data/cross-asset.json`.

**Estimator work**

- `research/bubble.py` implements the core identity but not the paper's
  nonparametric smoothing step across strikes. That is the most substantial
  open piece.
- The confidence interval assumes independent quote noise across strikes. It
  is not: adjacent strikes share market makers and move together. A
  heteroskedasticity- and autocorrelation-consistent standard error would be
  more honest.
- The estimator has never been run against real option data in this repo, only
  against synthetic surfaces. A worked example on any public options snapshot
  would be valuable.

## House style

- **Code**: biome decides formatting, so do not argue with it. Tabs, double
  quotes, that is the config.
- **Comments**: explain why, not what. A comment restating the line above it is
  noise. A comment recording why a threshold is 0.8 and not 0.5 is worth
  keeping.
- **Claims about the method**: if you assert something about what the estimator
  does or what the data shows, it needs to be checkable, either from the paper
  or from a test. Plausible-sounding financial reasoning that nobody verified is
  how this repo previously ended up describing a price-unit quantity as a
  probability.

## Data and provenance

The bubble estimates come from research with Dr Simon Kwok at the University of
Sydney and are derived from OptionMetrics IvyDB, which is licensed. The derived
series in the blob store can be used under this repository's licence; the
underlying option data cannot be redistributed. Please do not open pull requests
adding raw option data.

## Reporting a problem

For a bug, say what you did, what you expected, and what happened, and include
the asset and date range. For something that looks wrong in the numbers rather
than in the interface, say which series and which dates, and CI failures are
more useful than screenshots.

Questions about the method itself are better directed at the
[paper](https://doi.org/10.1002/jae.2862) than at this repository, but an issue
asking what a chart means is a fair signal that the methodology section is not
doing its job.
