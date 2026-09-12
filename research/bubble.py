"""Option-implied bubble estimation.

A reference implementation of the identity behind Jarrow & Kwok (2021),
"Inferring financial bubbles from option data", Journal of Applied Econometrics
36(7), 1013-1046.

The idea in one line: an asset's fundamental value is the discounted
risk-neutral expectation of its future price, the option market prices that
expectation directly, and the gap between it and the traded price is the bubble.

    V_t(tau) = exp(-r*tau) * E^Q[S_{t+tau}]
    Pi_t(tau) = S_t - V_t(tau)

For European options, put-call parity gives V_t(tau) at every strike at once:

    C(K) - P(K) = exp(-r*tau) * (E^Q[S_{t+tau}] - K)
    =>  V_t(tau) = C(K) - P(K) + K * exp(-r*tau)

In a frictionless market with no bubble that expression is the spot price, and
it is the same number at every strike. Two things break it. Microstructure noise
(bid-ask spreads, stale quotes) scatters the estimate across strikes, which is
what the confidence interval measures. A bubble shifts the whole cross-section
away from spot by the same amount, which is what the point estimate measures.
That is the sense in which the bubble is a failure of put-call parity: under
Jarrow, Protter & Shimbo (2010), a price process that is a strict local
martingale rather than a true martingale violates parity by exactly the bubble.

Scope: this reproduces the estimator's core identity and its cross-sectional
standard error. The published estimator adds a nonparametric smoothing step over
the strike dimension with a bandwidth rule, which is not reproduced here. The
JSON series shipped with the dashboard come from that fuller pipeline, not from
this module.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import ArrayLike, NDArray
from scipy import stats

__all__ = [
    "BubbleEstimate",
    "OptionQuotes",
    "bubble_lower_bound_from_calls",
    "bubble_upper_bound_from_puts",
    "estimate_bubble",
    "implied_forward",
    "quotes_from_arrays",
]


@dataclass(frozen=True)
class OptionQuotes:
    """One maturity's cross-section of European option prices on one asset.

    Attributes:
        spot: Observed spot price of the underlying.
        strikes: Strike prices, one per quoted pair.
        calls: Call mid prices, aligned with ``strikes``.
        puts: Put mid prices, aligned with ``strikes``.
        rate: Continuously compounded risk-free rate, annualised.
        tau: Time to maturity in years.
    """

    spot: float
    strikes: NDArray[np.float64]
    calls: NDArray[np.float64]
    puts: NDArray[np.float64]
    rate: float
    tau: float

    def __post_init__(self) -> None:
        n = len(self.strikes)
        if not (len(self.calls) == len(self.puts) == n):
            raise ValueError("strikes, calls and puts must be the same length")
        if n < 2:
            raise ValueError("need at least two strikes to form an interval")
        if self.spot <= 0:
            raise ValueError("spot must be positive")
        if self.tau <= 0:
            raise ValueError("tau must be positive")
        if np.any(self.strikes <= 0):
            raise ValueError("strikes must be positive")

    @property
    def discount(self) -> float:
        """exp(-r*tau), the discount factor to maturity."""
        return float(np.exp(-self.rate * self.tau))

    @property
    def moneyness(self) -> NDArray[np.float64]:
        """Strike over spot. 1.0 is at the money."""
        return self.strikes / self.spot


@dataclass(frozen=True)
class BubbleEstimate:
    """Point estimate and confidence interval, in the price units of the asset.

    Attributes:
        mu: Point estimate of the bubble.
        lb: Lower confidence bound.
        ub: Upper confidence bound.
        n_strikes: Strikes that survived filtering.
        fundamental: Implied fundamental value, ``spot - mu``.
    """

    mu: float
    lb: float
    ub: float
    n_strikes: int
    fundamental: float

    @property
    def significant(self) -> bool:
        """True when the interval excludes zero in either direction.

        The one-sided bounds leave the uninformative end at an infinity, so this
        reads correctly for them too: a call-side lower bound above zero is
        evidence of a bubble on its own.
        """
        return self.lb > 0 or self.ub < 0

    def as_fraction_of(self, price: float) -> float:
        """The estimate as a share of ``price``. Raises on a non-positive price."""
        if price <= 0:
            raise ValueError("price must be positive to express a share of it")
        return self.mu / price


def quotes_from_arrays(
    spot: float,
    strikes: ArrayLike,
    calls: ArrayLike,
    puts: ArrayLike,
    rate: float,
    tau: float,
) -> OptionQuotes:
    """Build :class:`OptionQuotes` from anything array-like."""
    return OptionQuotes(
        spot=float(spot),
        strikes=np.asarray(strikes, dtype=np.float64),
        calls=np.asarray(calls, dtype=np.float64),
        puts=np.asarray(puts, dtype=np.float64),
        rate=float(rate),
        tau=float(tau),
    )


def implied_forward(quotes: OptionQuotes) -> NDArray[np.float64]:
    """Per-strike implied forward price, ``E^Q[S_{t+tau}]``.

    Inverting put-call parity at each strike separately. In the absence of noise
    every entry is identical; the spread across entries is the microstructure
    noise the confidence interval is built from.
    """
    return (quotes.calls - quotes.puts) / quotes.discount + quotes.strikes


def _moneyness_filter(
    quotes: OptionQuotes, band: tuple[float, float]
) -> NDArray[np.bool_]:
    """Strikes inside the moneyness band, with finite, non-negative prices.

    Deep in- and out-of-the-money contracts are dropped because their quotes are
    dominated by the spread. A call worth two cents with a one-cent spread
    carries a 50% pricing error into an estimate denominated in dollars.
    """
    lo, hi = band
    m = quotes.moneyness
    return (
        (m >= lo)
        & (m <= hi)
        & np.isfinite(quotes.calls)
        & np.isfinite(quotes.puts)
        & (quotes.calls >= 0)
        & (quotes.puts >= 0)
    )


def _interval(
    values: NDArray[np.float64], spot: float, confidence: float
) -> BubbleEstimate:
    """Point estimate and interval from the per-strike bubble estimates.

    The mean across strikes is the point estimate and the standard error of that
    mean gives the interval, on a t distribution because the strike count per
    maturity is small (typically 5 to 40, not thousands).
    """
    n = values.size
    mu = float(np.mean(values))

    if n < 2:
        # One strike gives a point estimate but no way to measure dispersion.
        # Returning a zero-width interval here would make `significant` true
        # for any non-zero estimate, which is exactly backwards: a single
        # observation is never evidence that a reading differs from zero.
        return BubbleEstimate(
            mu=mu,
            lb=float("-inf"),
            ub=float("inf"),
            n_strikes=n,
            fundamental=spot - mu,
        )

    # ddof=1: the sample mean is estimated from the same data.
    se = float(np.std(values, ddof=1) / np.sqrt(n))
    half_width = float(stats.t.ppf(0.5 + confidence / 2, df=n - 1) * se)

    return BubbleEstimate(
        mu=mu,
        lb=mu - half_width,
        ub=mu + half_width,
        n_strikes=n,
        fundamental=spot - mu,
    )


def estimate_bubble(
    quotes: OptionQuotes,
    *,
    moneyness_band: tuple[float, float] = (0.8, 1.2),
    confidence: float = 0.95,
) -> BubbleEstimate:
    """Estimate the bubble from puts and calls jointly.

    This is the ``combined`` series in the dashboard, and the one to read for a
    headline number: it uses both sides of the market at the same strike, so
    neither of the one-sided bounds' liquidity problems arises.

    Args:
        quotes: One maturity's cross-section.
        moneyness_band: Strike-over-spot range to keep.
        confidence: Interval coverage, e.g. 0.95.

    Returns:
        The estimate, in the asset's price units.

    Raises:
        ValueError: If no strike survives the moneyness filter.
    """
    keep = _moneyness_filter(quotes, moneyness_band)
    if not keep.any():
        raise ValueError(
            f"no strikes inside moneyness band {moneyness_band}; "
            f"observed range {quotes.moneyness.min():.2f}-{quotes.moneyness.max():.2f}"
        )

    forwards = implied_forward(quotes)[keep]
    per_strike_bubble = quotes.spot - quotes.discount * forwards
    return _interval(per_strike_bubble, quotes.spot, confidence)


def bubble_lower_bound_from_calls(
    quotes: OptionQuotes,
    *,
    moneyness_band: tuple[float, float] = (0.8, 1.2),
) -> BubbleEstimate:
    """Lower bound on the bubble, using call prices only.

    A call is worth at least its intrinsic value in expectation:

        C(K) = exp(-r*tau) * E^Q[(S_T - K)^+]
             >= exp(-r*tau) * E^Q[S_T - K]
             =  V - K * exp(-r*tau)

    so ``V <= C(K) + K*exp(-r*tau)`` at every strike, and the bubble
    ``S - V >= S - (C(K) + K*exp(-r*tau))``. Taking the tightest strike gives
    the sharpest bound.

    ``C(K) + K*exp(-r*tau)`` is increasing in K, so the bound is tightest at the
    smallest strike available. That is the practical difficulty: the sharpest
    call-side bound needs deep in-the-money calls, which are the least liquid
    contracts on the board. Restricting to a liquid moneyness band loosens the
    bound, and a lower bound that is not tight reads low. This is why the
    call-only series in the dashboard sits persistently below the combined one.

    Unlike :func:`estimate_bubble` this involves no extrapolation and no
    distributional assumption, so it holds whatever the true dynamics are. The
    cost is that it is a bound, not a point estimate: ``lb`` is the informative
    number and ``ub`` is left at positive infinity.
    """
    keep = _moneyness_filter(quotes, moneyness_band)
    if not keep.any():
        raise ValueError("no strikes inside moneyness band")

    k = quotes.strikes[keep]
    upper_bounds_on_value = quotes.calls[keep] + k * quotes.discount
    fundamental = float(np.min(upper_bounds_on_value))
    mu = quotes.spot - fundamental

    return BubbleEstimate(
        mu=mu,
        lb=mu,
        ub=float("inf"),
        n_strikes=int(keep.sum()),
        fundamental=fundamental,
    )


def bubble_upper_bound_from_puts(
    quotes: OptionQuotes,
    *,
    moneyness_band: tuple[float, float] = (0.8, 1.2),
) -> BubbleEstimate:
    """Upper bound on the bubble, using put prices only.

    The mirror of :func:`bubble_lower_bound_from_calls`:

        P(K) = exp(-r*tau) * E^Q[(K - S_T)^+]
             >= exp(-r*tau) * E^Q[K - S_T]
             =  K * exp(-r*tau) - V

    so ``V >= K*exp(-r*tau) - P(K)`` and the bubble is at most
    ``S - (K*exp(-r*tau) - P(K))``. ``K*exp(-r*tau) - P(K)`` is increasing in K,
    so this bound is tightest at the largest strike, meaning deep in-the-money
    puts. Same liquidity problem, opposite direction: a loose upper bound reads
    high, which is why the put-only series sits persistently above the combined
    one.

    ``ub`` is the informative number here; ``lb`` is left at negative infinity.
    """
    keep = _moneyness_filter(quotes, moneyness_band)
    if not keep.any():
        raise ValueError("no strikes inside moneyness band")

    k = quotes.strikes[keep]
    lower_bounds_on_value = k * quotes.discount - quotes.puts[keep]
    fundamental = float(np.max(lower_bounds_on_value))
    mu = quotes.spot - fundamental

    return BubbleEstimate(
        mu=mu,
        lb=float("-inf"),
        ub=mu,
        n_strikes=int(keep.sum()),
        fundamental=fundamental,
    )
