"""Synthetic option surfaces with a known bubble, for validating the estimator.

Real option data for this exercise comes from OptionMetrics IvyDB, which is
licensed and cannot be redistributed. That makes the estimator hard to check
against anything, so this module generates surfaces where the true bubble is
known by construction and can be compared against what the estimator recovers.

The construction is deliberately simple. Pick a fundamental value V, price
European options off V under Black-Scholes, then set the traded spot to
``S = V + bubble``. Under that setup put-call parity holds at V and fails at S
by exactly ``bubble``, which is the quantity :mod:`research.bubble` is supposed
to recover. Quote noise is added on top so the confidence intervals have
something to measure.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray
from scipy import stats

from .bubble import OptionQuotes

__all__ = ["black_scholes_prices", "simulate_quotes"]


def black_scholes_prices(
    forward: float,
    strikes: NDArray[np.float64],
    vol: float,
    rate: float,
    tau: float,
) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
    """European call and put prices under Black-Scholes, in forward terms.

    Args:
        forward: Risk-neutral expected price at maturity, ``E^Q[S_T]``.
        strikes: Strike prices.
        vol: Annualised lognormal volatility.
        rate: Continuously compounded risk-free rate.
        tau: Time to maturity in years.

    Returns:
        ``(calls, puts)``, aligned with ``strikes``.
    """
    discount = np.exp(-rate * tau)
    sqrt_t = vol * np.sqrt(tau)

    d1 = (np.log(forward / strikes) + 0.5 * sqrt_t**2) / sqrt_t
    d2 = d1 - sqrt_t

    calls = discount * (forward * stats.norm.cdf(d1) - strikes * stats.norm.cdf(d2))
    puts = discount * (strikes * stats.norm.cdf(-d2) - forward * stats.norm.cdf(-d1))
    return calls, puts


def simulate_quotes(
    *,
    fundamental: float = 100.0,
    bubble: float = 0.0,
    vol: float = 0.2,
    rate: float = 0.03,
    tau: float = 1.0,
    n_strikes: int = 21,
    moneyness: tuple[float, float] = (0.7, 1.3),
    noise_bps: float = 0.0,
    rng: np.random.Generator | None = None,
) -> OptionQuotes:
    """Generate one maturity's quotes around a known bubble.

    Args:
        fundamental: True fundamental value of the underlying.
        bubble: Amount by which the traded spot exceeds fundamental value.
        vol: Annualised volatility used to price the options.
        rate: Continuously compounded risk-free rate.
        tau: Time to maturity in years.
        n_strikes: Number of strikes in the cross-section.
        moneyness: Strike range as a fraction of the traded spot.
        noise_bps: Independent quote noise, in basis points of spot, applied to
            every option price. Stands in for the bid-ask spread.
        rng: Source of randomness. A fresh default generator when omitted.

    Returns:
        Quotes whose true bubble is ``bubble``.
    """
    if fundamental <= 0:
        raise ValueError("fundamental must be positive")

    rng = rng or np.random.default_rng()
    spot = fundamental + bubble

    strikes = np.linspace(moneyness[0] * spot, moneyness[1] * spot, n_strikes)

    # Options are priced off the fundamental value, not off the traded spot.
    # That is the whole point: the bubble is the wedge between them.
    forward = fundamental * np.exp(rate * tau)
    calls, puts = black_scholes_prices(forward, strikes, vol, rate, tau)

    if noise_bps > 0:
        scale = noise_bps / 10_000 * spot
        calls = calls + rng.normal(0.0, scale, size=calls.shape)
        puts = puts + rng.normal(0.0, scale, size=puts.shape)
        # A quote is never negative, however wide the spread.
        calls = np.maximum(calls, 0.0)
        puts = np.maximum(puts, 0.0)

    return OptionQuotes(
        spot=spot,
        strikes=strikes,
        calls=calls,
        puts=puts,
        rate=rate,
        tau=tau,
    )
