<div align="center">

# Option-Implied Bubble Detection

**How far did the market trade from what the options said it was worth?**

Daily bubble estimates for the S&P 500 and 26 US equities, 1996–2023, built on
the method in [Jarrow & Kwok (2021)](https://doi.org/10.1002/jae.2862).

[**Live dashboard →**](https://financial-bubble.vercel.app)

[![CI](https://github.com/lukaadzic/financial-bubble-detection-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/lukaadzic/financial-bubble-detection-dashboard/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Paper](https://img.shields.io/badge/paper-10.1002%2Fjae.2862-b31b1b.svg)](https://doi.org/10.1002/jae.2862)

</div>

---

## What this is

A bubble is the gap between what an asset trades for and what it is worth. The
hard part has always been the second number, because measuring it usually means
committing to a model of fundamental value and then arguing about the model.

Jarrow and Kwok's method sidesteps that. An asset's fundamental value is the
discounted risk-neutral expectation of its future price, and the option market
prices that expectation directly. So you can read fundamental value off the
option board instead of assuming it:

$$\hat{\Pi}_t(\tau) = S_t - e^{-r\tau}\,\mathbb{E}^{\mathbb{Q}}_t\!\left[S_{t+\tau}\right]$$

A positive reading means the market paid more than the options implied the asset
was worth. This repository is two things built on that idea:

- **A dashboard** ([live](https://financial-bubble.vercel.app)) showing the
  estimates for 27 assets across three maturity horizons, with confidence
  intervals and a cross-asset panel covering the full 1996–2023 sample.
- **An estimator** ([`research/`](research/)) implementing the underlying
  identity in Python, with a synthetic-data harness that verifies it recovers a
  bubble it is known to contain.

## Where this came from

The bubble estimates were produced in research work with **Dr Simon Kwok**
(School of Economics, University of Sydney), who co-authored the method with
**Professor Robert Jarrow** (Cornell). The University of Sydney wrote up the
result [here](https://www.sydney.edu.au/news-opinion/news/2021/08/05/how-to-predict-a-stock-market-bubble-in-real-time.html).

> Jarrow, R. A., & Kwok, S. S. (2021). Inferring financial bubbles from option
> data. *Journal of Applied Econometrics*, 36(7), 1013–1046.
> [doi:10.1002/jae.2862](https://doi.org/10.1002/jae.2862)

This repository is the visualization and a reference implementation. It is not
the paper's own code, and the authors are not responsible for anything here.

## Reading the charts

**The estimate is a price, not a probability.** For the S&P 500 it is in index
points; for a single name, in dollars. The dashboard divides by spot price by
default, because a 50-point bubble on a 600-point index in 1996 and a 50-point
bubble at 4,500 in 2023 are not the same event.

**Read the interval, not the midpoint.** Every estimate carries a confidence
band. When it contains zero, the data cannot distinguish that day from no bubble
at all, and the summary panel says so rather than reporting the sign of a noisy
number.

**Horizon matters more than you would expect.** Estimates are grouped into three
maturity windows (τ ≈ 0.25, 0.5 and 1 year) because option liquidity clusters
around common expiries. For the S&P 500 the 2006–07 run-up reads **+1.3% of
index at τ ≈ 1y** and only **+0.15% at τ ≈ 0.25y**. Looking at the short horizon
alone, you would conclude nothing happened before the GFC.

**Put-only and call-only bracket the combined series.** They disagree in a
structured way: a call price bounds fundamental value from above and a put price
bounds it from below, so the call-only series runs low and the put-only series
runs high. Both bounds are sharpest at deep in-the-money strikes, which are the
least liquid contracts on the board, so both stay loose in practice. Read the
combined series for a number and the spread between the other two as a measure
of how much the option market actually pins down. The mechanics are in
[`research/README.md`](research/README.md).

## Quick start

Nothing to configure. The dashboard reads from a public, read-only blob store.

```bash
git clone https://github.com/lukaadzic/financial-bubble-detection-dashboard
cd financial-bubble-detection-dashboard
bun install
bun run dev            # http://localhost:3000
```

The estimator is independent of the dashboard:

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r research/requirements.txt
pytest research -q     # 26 tests, under a second
```

## The estimator

`research/bubble.py` implements the identity. Put-call parity recovers
fundamental value at every strike at once:

$$V_t(\tau) = C(K) - P(K) + K e^{-r\tau}$$

In a frictionless market with no bubble that expression equals the spot price,
and it is the same number at every strike. Two things break it, and the
estimator reads one off each: microstructure noise scatters the estimate across
strikes, which is what the confidence interval measures, and a bubble shifts the
whole cross-section away from spot by the same amount, which is the point
estimate. Under [Jarrow, Protter & Shimbo
(2010)](https://doi.org/10.1111/j.1467-9965.2010.00394.x), a price process that
is a strict local martingale rather than a true martingale violates parity by
exactly the bubble.

```python
import numpy as np
from research.bubble import estimate_bubble
from research.simulate import simulate_quotes

# A surface with a bubble of exactly 2.00 injected, plus 25bp of quote noise.
quotes = simulate_quotes(
    fundamental=100.0, bubble=2.0, noise_bps=25.0,
    rng=np.random.default_rng(42),
)

estimate = estimate_bubble(quotes)
print(f"spot         {quotes.spot:.2f}")            # spot         102.00
print(f"fundamental  {estimate.fundamental:.2f}")   # fundamental   99.92
print(f"bubble      {estimate.mu:+.3f}")            # bubble       +2.080
print(f"interval    [{estimate.lb:+.3f}, {estimate.ub:+.3f}]")  # [+1.875, +2.285]
print(f"significant  {estimate.significant}")       # significant  True
```

`quotes_from_arrays` takes real quotes in the same shape: spot, strikes, call
and put mid prices, a rate and a maturity.

### Does it work?

There is no public option dataset to check against, because the estimates here
derive from OptionMetrics IvyDB, which is licensed. So `research/simulate.py`
generates surfaces whose bubble is known by construction: options are priced off
a fundamental value `V`, then the traded spot is set to `S = V + bubble`.

Over 2,000 independent surfaces with 25bp of quote noise and a true bubble of
2.00 on a fundamental of 100:

| | |
|---|---|
| Mean estimate | 1.9997 |
| Bias | −0.0003 |
| Standard deviation | 0.1005 |
| **95% interval coverage** | **94.5%** |

Coverage is the number that matters. An estimator returning plausible values
with intervals that never contain the truth is worse than no estimator, because
it invites conclusions the data does not support.

## Assets covered

27 assets, 1996–2023, though individual names start when their options do
(Tesla in 2010, Alibaba in 2014).

| | |
|---|---|
| **Index** | SPX |
| **Technology** | AAPL, MSFT, GOOG, AMZN, NVDA, INTC, CSCO, AMD, FB, BABA, TWTR |
| **Financials** | JPM, BAC, C, WFC, MS, AIG |
| **Industrials & other** | TSLA, F, GM, DIS, BA, GE, XOM, T |

## Project layout

```
src/
  components/
    Dashboard.tsx           page shell and layout
    BubbleSummaryPanel.tsx  latest reading, read off the interval
    CrossAssetHeatmap.tsx   all 26 assets, full sample
    PlotlyBubbleChart.tsx   the estimate charts
    MethodologyNote.tsx     what the numbers mean, on the page
    usePlotlyTheme.ts       shared palette + lazy plotly loader
  hooks/useDashboardData.ts data fetching and derived state
  utils/dataLoader.ts       blob fetching, transforms, summary stats
  types/bubbleData.ts       schema, asset list, the percent-of-price guard
research/
  bubble.py                 the estimator
  simulate.py               synthetic surfaces with a known bubble
  test_bubble.py            recovery and coverage tests
scripts/
  build-cross-asset.ts      builds the heatmap's monthly panel
  upload-to-blob.ts         publishes new estimator output
public/data/
  cross-asset.json          220KB monthly panel, committed
```

## Data

Per-asset estimator output lives in Vercel Blob storage, keyed by ticker. Each
file is a single JSON document:

```typescript
{
  metadata: {
    stockcode: "SPX",
    rolling_window_days: 63,
    tau_groups_info: [{ name: "tau_1", range: "0.15-0.35", mean: 0.25 }, ...],
    ...
  },
  time_series_data: [{
    date: "1996-04-03T00:00:00",
    stock_prices: { adjusted: 655.88 },
    bubble_estimates: {
      // one entry per tau group, ordered to match tau_groups_info
      daily_grouped: [{
        put:      { mu: 9.18, lb: 2.68, ub: 9.88 },
        call:     { mu: 0.14, lb: -2.66, ub: 5.49 },
        combined: { mu: 5.72, lb: 2.89, ub: 6.39 },
      }, ...]
    }
  }, ...]
}
```

The full schema is in [`src/types/bubbleData.ts`](src/types/bubbleData.ts).
Regenerating the cross-asset panel after new estimator output:

```bash
bun run build:cross-asset
```

### Known data issues

**GM, 2009.** The split-adjusted price is recorded as `0.00` through the June
2009 bankruptcy and under a dollar for weeks either side, which turns a −$15
estimate into −2,000% of price. `bubblePercent()` drops observations where the
bubble exceeds the entire price of the asset rather than plotting or clamping
them, so those dates appear as gaps.

**File size.** Each per-ticker file is roughly 12MB and served uncompressed, so
switching assets means a 12MB download. This is the biggest open problem in the
repo and a good place to contribute; see
[CONTRIBUTING.md](CONTRIBUTING.md#good-first-issues).

## Stack

React 19 · TypeScript · Vite 6 · TanStack Router · Plotly.js · Tailwind 4 ·
shadcn/ui · Biome · Bun · Vercel. Python side is numpy, scipy and pytest.

Plotly loads on demand rather than in the entry bundle, since it is 4.6MB and
nothing can be drawn until the data arrives anyway.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). There is a ranked list of open work
there, split by how much finance background it needs, and several items need
none at all.

## Licence

[Apache 2.0](LICENSE). The derived bubble series can be used under that licence;
the underlying OptionMetrics option data cannot be redistributed.

Research output, not investment advice. The estimates end in August 2023 and are
not updated in real time.
