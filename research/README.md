# The estimator

A reference implementation of the identity behind the bubble estimates in this
repository, with a synthetic-data harness to check that it recovers a bubble it
is known to contain.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r research/requirements.txt
pytest research -q
```

## The idea

An asset's fundamental value is the discounted risk-neutral expectation of its
future price. The option market prices that expectation directly, so you can
read fundamental value off the board instead of assuming a pricing model for it.
The bubble is what is left over:

```
V_t(τ)  = e^(-rτ) · E^Q[S_{t+τ}]        fundamental value at horizon τ
Π_t(τ)  = S_t − V_t(τ)                  the bubble
```

For European options, put-call parity gives `V_t(τ)` at every strike at once:

```
C(K) − P(K) = e^(-rτ) · (E^Q[S_{t+τ}] − K)
⟹  V_t(τ)  = C(K) − P(K) + K · e^(-rτ)
```

In a frictionless market with no bubble that expression equals the spot price,
and it is the same number at every strike. Two things break it, and the
estimator reads one off each:

- **Microstructure noise** (spreads, stale quotes) scatters the estimate across
  strikes. That scatter is what the confidence interval measures.
- **A bubble** shifts the whole cross-section away from spot by the same amount.
  That common shift is the point estimate.

So the bubble is a failure of put-call parity. That is not a metaphor: under
Jarrow, Protter & Shimbo (2010), a price process that is a strict local
martingale rather than a true martingale violates parity by exactly the bubble.

## The one-sided bounds

`bubble_lower_bound_from_calls` and `bubble_upper_bound_from_puts` are bounds,
not point estimates, and they need no distributional assumption at all. A call is
worth at least its expected intrinsic value:

```
C(K) ≥ e^(-rτ)·E^Q[S_T − K] = V − K·e^(-rτ)   ⟹  V ≤ C(K) + K·e^(-rτ)
P(K) ≥ e^(-rτ)·E^Q[K − S_T] = K·e^(-rτ) − V   ⟹  V ≥ K·e^(-rτ) − P(K)
```

Calls bound fundamental value from above, so they bound the bubble from below.
Puts do the reverse. Both expressions are increasing in `K`, so each bound is
sharpest at deep in-the-money strikes, which are the least liquid contracts on
the board. Restricting to a liquid moneyness band loosens both.

That is the structure behind the put/call asymmetry in the dashboard: the
call-only series sits persistently below the combined one and the put-only
series above it, because one is a loose lower bound and the other a loose upper
bound on the same quantity. On a clean synthetic surface with a true bubble of
2.00 and a 0.8–1.2 moneyness band:

```
call-side lower bound   +0.62
combined point estimate +2.00
put-side upper bound    +4.70
```

## Validation

There is no public option dataset to test against: the estimates in this
repository come from OptionMetrics IvyDB, which is licensed and cannot be
redistributed. `simulate.py` fills the gap by generating surfaces whose bubble
is known by construction. Options are priced off a fundamental value `V` under
Black-Scholes, then the traded spot is set to `S = V + bubble`, so parity holds
at `V` and fails at `S` by exactly the injected amount.

Over 2,000 independent surfaces with 25bp of quote noise and a true bubble of
2.00 on a fundamental of 100:

| | |
|---|---|
| Mean estimate | 1.9997 |
| Bias | −0.0003 |
| Standard deviation | 0.1005 |
| 95% interval coverage | 94.5% |

The coverage number is the one that matters. An estimator that returns plausible
values with intervals that never contain the truth is worse than no estimator,
because it invites conclusions the data does not support. `pytest research -q`
asserts both properties, plus parity in the pricer, invariance to maturity and
rate, and that the one-sided bounds are never violated.

## What this is not

This reproduces the estimator's core identity and its cross-sectional standard
error. The published estimator adds a nonparametric smoothing step across the
strike dimension with a bandwidth rule; the metadata in the JSON files
(`num_steps: 200`, `optimization_threshold`, `h_number_sd: 5`) comes from that
fuller pipeline. The series the dashboard plots were produced by it, not by this
module.

## Reference

Jarrow, R. A., & Kwok, S. S. (2021). Inferring financial bubbles from option
data. *Journal of Applied Econometrics*, 36(7), 1013–1046.
<https://doi.org/10.1002/jae.2862>

Jarrow, R. A., Protter, P., & Shimbo, K. (2010). Asset price bubbles in
incomplete markets. *Mathematical Finance*, 20(2), 145–185.
