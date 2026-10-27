"""Forecast error statistics.

Sign convention used everywhere: error = forecast - actual (MW).
A positive error is an *over*-forecast: less wind turned up than expected, so
the buyer is short and must cover the gap at imbalance/intraday prices.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


def quantile(values: Sequence[float], q: float) -> float:
    """Linear-interpolated quantile (same as numpy's default method)."""
    if not values:
        return math.nan
    s = sorted(values)
    pos = (len(s) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


@dataclass(frozen=True)
class ErrorSummary:
    count: int
    mae: float  # mean absolute error, MW
    rmse: float  # root mean squared error, MW
    bias: float  # mean error, MW (+ = over-forecast)
    wape: float  # sum|error| / sum actual, %
    p10: float  # 10th percentile error, MW
    p90: float  # 90th percentile error, MW
    max_over: float  # largest over-forecast (shortfall), MW
    max_under: float  # largest under-forecast (surplus), MW


def summarize(forecast: Sequence[float], actual: Sequence[float]) -> ErrorSummary:
    if len(forecast) != len(actual):
        raise ValueError("forecast and actual must be the same length")
    errors = [f - a for f, a in zip(forecast, actual, strict=False)]
    n = len(errors)
    if n == 0:
        nan = math.nan
        return ErrorSummary(0, nan, nan, nan, nan, nan, nan, nan, nan)
    abs_sum = sum(abs(e) for e in errors)
    actual_sum = sum(actual)
    return ErrorSummary(
        count=n,
        mae=abs_sum / n,
        rmse=math.sqrt(sum(e * e for e in errors) / n),
        bias=sum(errors) / n,
        wape=100 * abs_sum / actual_sum if actual_sum else math.nan,
        p10=quantile(errors, 0.10),
        p90=quantile(errors, 0.90),
        max_over=max(max(errors), 0.0),
        max_under=min(min(errors), 0.0),
    )


def histogram(values: Sequence[float], width: float) -> list[tuple[float, int]]:
    """Fixed-width bins as (bin start, count), contiguous from min to max."""
    if not values:
        return []
    lo = math.floor(min(values) / width) * width
    hi = math.floor(max(values) / width) * width
    counts = {lo + i * width: 0 for i in range(int(round((hi - lo) / width)) + 1)}
    for v in values:
        counts[math.floor(v / width) * width] += 1
    return sorted(counts.items())
