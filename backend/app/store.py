"""In-memory view of the committed Elexon snapshot."""

from __future__ import annotations

import json
from bisect import bisect_right
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import datetime
from functools import lru_cache

from .config import ACTUALS_FILE, FORECASTS_FILE


def parse_utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class WindData:
    """Actual and forecast wind generation, indexed for fast lookup.

    actuals:  half-hour start (UTC) -> MW
    runs:     forecast publish times (UTC), ascending
    forecast: publish time -> {target time (UTC) -> MW}
    """

    actuals: dict[datetime, float]
    runs: list[datetime]
    forecast: dict[datetime, dict[datetime, float]]
    fetched_at: str

    def runs_published_by(self, cutoff: datetime) -> Iterator[datetime]:
        """Forecast runs available at `cutoff`, newest first."""
        for i in range(bisect_right(self.runs, cutoff) - 1, -1, -1):
            yield self.runs[i]


def build(actual_rows: list, forecast_rows: list, fetched_at: str = "") -> WindData:
    actuals = {parse_utc(t): float(g) for t, g in actual_rows}
    forecast: dict[datetime, dict[datetime, float]] = {}
    for publish, target, gen in forecast_rows:
        forecast.setdefault(parse_utc(publish), {})[parse_utc(target)] = float(gen)
    return WindData(actuals, sorted(forecast), forecast, fetched_at)


@lru_cache(maxsize=1)
def load() -> WindData:
    actuals = json.loads(ACTUALS_FILE.read_text())
    forecasts = json.loads(FORECASTS_FILE.read_text())
    return build(actuals["rows"], forecasts["rows"], forecasts["fetched_at"])
