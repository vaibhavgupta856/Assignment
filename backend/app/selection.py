"""Which forecast was available when the buyer had to decide?

This is the heart of the product. A forecast for target time T only counts if
it was *published* before the decision cutoff; among those we take the most
recent run that covers T. Rows a run publishes for times at or before its own
publish time are back-casts, not forecasts, and are never used.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from .config import UK_TZ
from .store import WindData

_EPSILON = timedelta(microseconds=1)


@dataclass(frozen=True)
class ForecastPoint:
    target: datetime
    value: float
    published: datetime

    @property
    def horizon_hours(self) -> float:
        return (self.target - self.published).total_seconds() / 3600


def to_utc(day: date, clock: time) -> datetime:
    """A UK wall-clock time on `day`, as UTC (handles GMT/BST)."""
    return datetime.combine(day, clock, tzinfo=UK_TZ).astimezone(UTC)


def delivery_day_bounds(day: date) -> tuple[datetime, datetime]:
    """[start, end) of a UK delivery day in UTC (23/24/25 hours long)."""
    return to_utc(day, time(0)), to_utc(day + timedelta(days=1), time(0))


def decision_cutoff(delivery_day: date, decision_time: time) -> datetime:
    """Decisions for day D are taken on D-1 at `decision_time` UK time."""
    return to_utc(delivery_day - timedelta(days=1), decision_time)


def latest_forecast(data: WindData, target: datetime, cutoff: datetime) -> ForecastPoint | None:
    """Most recent genuine forecast for `target` published at or before `cutoff`."""
    # Runs published at/after the target are back-casts, so cap the cutoff.
    for run in data.runs_published_by(min(cutoff, target - _EPSILON)):
        value = data.forecast[run].get(target)
        if value is not None:
            return ForecastPoint(target, value, run)
    return None


def forecast_targets(start: datetime, end: datetime) -> list[datetime]:
    """Hourly forecast target times in [start, end)."""
    t = start.replace(minute=0, second=0, microsecond=0)
    if t < start:
        t += timedelta(hours=1)
    out = []
    while t < end:
        out.append(t)
        t += timedelta(hours=1)
    return out


def day_ahead_forecast(
    data: WindData, delivery_day: date, decision_time: time
) -> list[ForecastPoint]:
    """The forecast a buyer saw at D-1 `decision_time` for every hour of day D."""
    cutoff = decision_cutoff(delivery_day, decision_time)
    start, end = delivery_day_bounds(delivery_day)
    points = (latest_forecast(data, t, cutoff) for t in forecast_targets(start, end))
    return [p for p in points if p is not None]


def horizon_forecast(
    data: WindData, targets: list[datetime], horizon_hours: float
) -> list[ForecastPoint]:
    """For each target, the latest forecast published at least `horizon_hours` ahead."""
    lead = timedelta(hours=horizon_hours)
    points = (latest_forecast(data, t, t - lead) for t in targets)
    return [p for p in points if p is not None]
