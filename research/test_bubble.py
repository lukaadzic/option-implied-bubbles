"""Tests for the bubble estimator.

The load-bearing test is :func:`test_monte_carlo_recovers_injected_bubble`: it
injects a known bubble into a noisy synthetic surface many times over and checks
that the estimator recovers it and that the stated confidence interval actually
covers it at roughly the stated rate. An estimator that returns plausible
numbers with intervals that never contain the truth is worse than no estimator.

Run with:  pytest research -q
"""

from __future__ import annotations

import numpy as np
import pytest

from .bubble import (
    OptionQuotes,
    bubble_lower_bound_from_calls,
    bubble_upper_bound_from_puts,
    estimate_bubble,
    implied_forward,
)
from .simulate import black_scholes_prices, simulate_quotes


def test_put_call_parity_holds_in_the_simulator():
    """The generated surface satisfies parity at the fundamental value.

    If this fails every other test is measuring the simulator, not the
    estimator.
    """
    quotes = simulate_quotes(fundamental=100.0, bubble=0.0, noise_bps=0.0)
    forwards = implied_forward(quotes)

    expected = 100.0 * np.exp(quotes.rate * quotes.tau)
    assert np.allclose(forwards, expected, rtol=1e-10)


def test_no_bubble_estimates_zero():
    quotes = simulate_quotes(fundamental=100.0, bubble=0.0, noise_bps=0.0)
    estimate = estimate_bubble(quotes)

    assert estimate.mu == pytest.approx(0.0, abs=1e-9)
    assert estimate.fundamental == pytest.approx(100.0, abs=1e-9)


@pytest.mark.parametrize("bubble", [-5.0, -1.0, 0.5, 3.0, 12.0])
def test_recovers_bubble_without_noise(bubble: float):
    """With clean quotes the identity is exact, so recovery should be too."""
    quotes = simulate_quotes(fundamental=100.0, bubble=bubble, noise_bps=0.0)
    estimate = estimate_bubble(quotes)

    assert estimate.mu == pytest.approx(bubble, abs=1e-8)
    assert estimate.fundamental == pytest.approx(100.0, abs=1e-8)


@pytest.mark.parametrize("tau", [0.25, 0.5, 1.0, 2.0])
def test_recovery_is_maturity_invariant(tau: float):
    """Discounting is handled correctly across the maturity groups in the data."""
    quotes = simulate_quotes(fundamental=100.0, bubble=2.5, tau=tau, noise_bps=0.0)
    assert estimate_bubble(quotes).mu == pytest.approx(2.5, abs=1e-8)


@pytest.mark.parametrize("rate", [0.0, 0.03, 0.08])
def test_recovery_is_rate_invariant(rate: float):
    quotes = simulate_quotes(fundamental=100.0, bubble=2.5, rate=rate, noise_bps=0.0)
    assert estimate_bubble(quotes).mu == pytest.approx(2.5, abs=1e-8)


def test_monte_carlo_recovers_injected_bubble():
    """Unbiased point estimate and honest coverage under quote noise.

    200 independent noisy surfaces, each with a 2.0 bubble on a fundamental of
    100. Checks two separate things: the average estimate lands on the truth
    (the estimator is unbiased), and the 95% intervals contain the truth about
    95% of the time (the intervals mean what they say).
    """
    rng = np.random.default_rng(20210805)
    truth = 2.0
    trials = 200

    estimates = []
    covered = 0
    for _ in range(trials):
        quotes = simulate_quotes(
            fundamental=100.0,
            bubble=truth,
            noise_bps=25.0,
            rng=rng,
        )
        estimate = estimate_bubble(quotes)
        estimates.append(estimate.mu)
        if estimate.lb <= truth <= estimate.ub:
            covered += 1

    estimates = np.array(estimates)
    standard_error = estimates.std(ddof=1) / np.sqrt(trials)

    # Unbiased: the mean estimate is within 4 standard errors of the truth.
    assert abs(estimates.mean() - truth) < 4 * standard_error

    # Honest: nominal coverage is 95%, so allow 88-99% over 200 draws.
    coverage = covered / trials
    assert 0.88 <= coverage <= 0.99, f"coverage was {coverage:.2%}"


def test_interval_widens_with_noise():
    """More quote noise means a wider interval, not a differently-placed one."""
    rng = np.random.default_rng(7)
    quiet = estimate_bubble(
        simulate_quotes(bubble=1.0, noise_bps=5.0, rng=rng),
    )
    noisy = estimate_bubble(
        simulate_quotes(bubble=1.0, noise_bps=100.0, rng=rng),
    )
    assert (noisy.ub - noisy.lb) > (quiet.ub - quiet.lb)


def test_significance_flag_tracks_the_interval():
    clean = estimate_bubble(simulate_quotes(bubble=10.0, noise_bps=1.0))
    assert clean.significant

    rng = np.random.default_rng(99)
    indistinguishable = estimate_bubble(
        simulate_quotes(bubble=0.0, noise_bps=200.0, rng=rng),
    )
    assert not indistinguishable.significant


@pytest.mark.parametrize("bubble", [0.0, 4.0, -3.0])
def test_one_sided_bounds_bracket_the_truth(bubble: float):
    """The call and put bounds contain the true bubble, and straddle it.

    Neither bound assumes anything about the price dynamics, so they must hold
    on any surface. They are loose rather than wrong: the call side reads low
    and the put side reads high, which is the asymmetry the dashboard's
    put-only and call-only series show against the combined one.
    """
    quotes = simulate_quotes(fundamental=100.0, bubble=bubble, noise_bps=0.0)

    lower = bubble_lower_bound_from_calls(quotes)
    upper = bubble_upper_bound_from_puts(quotes)

    assert lower.mu <= bubble + 1e-8, "call-side lower bound was violated"
    assert upper.mu >= bubble - 1e-8, "put-side upper bound was violated"
    assert lower.mu < upper.mu


def test_one_sided_bounds_tighten_with_a_wider_strike_range():
    """Both bounds are sharpest at the extremes of the strike range.

    ``C(K) + K*exp(-r*tau)`` is increasing in K and ``K*exp(-r*tau) - P(K)`` is
    too, so the informative observations are the deep in-the-money contracts.
    Widening the moneyness band should move both bounds toward the truth, which
    is the liquidity trade-off the one-sided series face on real data.
    """
    quotes = simulate_quotes(
        fundamental=100.0, bubble=2.0, n_strikes=61, moneyness=(0.4, 1.6),
        noise_bps=0.0,
    )

    narrow_low = bubble_lower_bound_from_calls(quotes, moneyness_band=(0.95, 1.05))
    wide_low = bubble_lower_bound_from_calls(quotes, moneyness_band=(0.4, 1.6))
    assert wide_low.mu > narrow_low.mu  # closer to the truth from below
    assert wide_low.mu <= 2.0 + 1e-8

    narrow_high = bubble_upper_bound_from_puts(quotes, moneyness_band=(0.95, 1.05))
    wide_high = bubble_upper_bound_from_puts(quotes, moneyness_band=(0.4, 1.6))
    assert wide_high.mu < narrow_high.mu  # closer to the truth from above
    assert wide_high.mu >= 2.0 - 1e-8


def test_single_strike_is_never_significant():
    """One strike cannot support a significance claim.

    A zero-width interval around a non-zero estimate would report a bubble as
    statistically significant on the strength of a single quote.
    """
    quotes = simulate_quotes(n_strikes=41, moneyness=(0.5, 1.5), noise_bps=0.0)

    # A band narrow enough that exactly one strike survives.
    one = estimate_bubble(quotes, moneyness_band=(0.99, 1.01))
    assert one.n_strikes == 1
    assert not one.significant
    assert one.lb == float("-inf")
    assert one.ub == float("inf")


def test_moneyness_band_filters_strikes():
    quotes = simulate_quotes(n_strikes=41, moneyness=(0.5, 1.5), noise_bps=0.0)

    wide = estimate_bubble(quotes, moneyness_band=(0.5, 1.5))
    narrow = estimate_bubble(quotes, moneyness_band=(0.95, 1.05))

    assert narrow.n_strikes < wide.n_strikes
    assert narrow.n_strikes >= 2


def test_empty_moneyness_band_raises():
    quotes = simulate_quotes(moneyness=(0.9, 1.1), noise_bps=0.0)
    with pytest.raises(ValueError, match="no strikes inside moneyness band"):
        estimate_bubble(quotes, moneyness_band=(2.0, 3.0))


def test_black_scholes_satisfies_parity():
    """Guards the pricer itself, which every simulated surface depends on."""
    strikes = np.linspace(70, 130, 13)
    forward, rate, tau = 103.0, 0.03, 1.0
    calls, puts = black_scholes_prices(forward, strikes, vol=0.25, rate=rate, tau=tau)

    discount = np.exp(-rate * tau)
    assert np.allclose(calls - puts, discount * (forward - strikes), atol=1e-10)


def test_rejects_malformed_input():
    with pytest.raises(ValueError, match="same length"):
        OptionQuotes(
            spot=100.0,
            strikes=np.array([90.0, 100.0, 110.0]),
            calls=np.array([12.0, 5.0]),
            puts=np.array([1.0, 4.0, 11.0]),
            rate=0.03,
            tau=1.0,
        )

    with pytest.raises(ValueError, match="at least two strikes"):
        OptionQuotes(
            spot=100.0,
            strikes=np.array([100.0]),
            calls=np.array([5.0]),
            puts=np.array([4.0]),
            rate=0.03,
            tau=1.0,
        )
