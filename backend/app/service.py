"""Builds the API views from the snapshot. Pure functions + memoisation."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta
from functools import lru_cache

from . import config, metrics, schemas, store
from .selection import (
    ForecastPoint,
    day_ahead_forecast,
    decision_cutoff,
    delivery_day_bounds,
    forecast_targets,
    horizon_forecast,
)

HALF_HOUR = timedelta(minutes=30)
BUFFER_CONFIDENCES = (50, 80, 90, 95)
LEVEL_BUCKET_MW = 4000
HISTOGRAM_BIN_MW = 500


@dataclass(frozen=True)
class Pair:
    """A forecast point matched to the outturn at the same start time."""

    point: ForecastPoint
    actual: float

    @property
    def error(self) -> float:
        return self.point.value - self.actual


def _r(x: float | None, nd: int = 1) -> float | None:
    return None if x is None or math.isnan(x) else round(x, nd)


def _error_stats(errors: list[float], actuals: list[float]) -> schemas.ErrorStats:
    s = metrics.summarize([e + a for e, a in zip(errors, actuals, strict=False)], actuals)
    return schemas.ErrorStats(**{k: (v if k == "count" else _r(v)) for k, v in asdict(s).items()})


def _stats(pairs: list[Pair], offset: float = 0.0) -> schemas.ErrorStats:
    """Error statistics of (forecast - offset) against actual."""
    return _error_stats([p.error - offset for p in pairs], [p.actual for p in pairs])


def delivery_dates() -> list[date]:
    days = (config.LAST_DELIVERY_DATE - config.FIRST_DELIVERY_DATE).days + 1
    return [config.FIRST_DELIVERY_DATE + timedelta(days=i) for i in range(days)]


def _match(points: list[ForecastPoint]) -> list[Pair]:
    actuals = store.load().actuals
    return [Pair(p, actuals[p.target]) for p in points if p.target in actuals]


@lru_cache(maxsize=4096)
def day_pairs(day: date, decision_time: time) -> tuple[Pair, ...]:
    return tuple(_match(day_ahead_forecast(store.load(), day, decision_time)))


def window_pairs(decision_time: time) -> list[Pair]:
    return [p for d in delivery_dates() for p in day_pairs(d, decision_time)]


def calibration_days(day: date) -> list[date]:
    """Delivery days whose outturn was complete before the decision for `day`.

    Decisions happen on D-1, so D-2 is the most recent fully observed day.
    """
    return [day - timedelta(days=k) for k in range(config.CALIBRATION_DAYS + 1, 1, -1)]


@lru_cache(maxsize=4096)
def calibration(day: date, decision_time: time) -> schemas.Calibration:
    days = calibration_days(day)
    errors = [p.error for d in days for p in day_pairs(d, decision_time)]
    return schemas.Calibration(
        days=days,
        samples=len(errors),
        error_p10=_r(metrics.quantile(errors, 0.10)),
        error_mean=_r(sum(errors) / len(errors)) if errors else None,
        error_p90=_r(metrics.quantile(errors, 0.90)),
    )


def adjustment(day: date, decision_time: time) -> float:
    """MW to subtract from the raw forecast: its trailing mean error (bias).

    In the January back-test this beat a median offset (MAE 1.49 vs 1.56 GW),
    and "remove the last two weeks' average over-forecast" is easy to explain.
    """
    return calibration(day, decision_time).error_mean or 0.0


def _horizon_range(points: list[ForecastPoint]) -> tuple[float | None, float | None]:
    if not points:
        return None, None
    hs = [p.horizon_hours for p in points]
    return round(min(hs), 1), round(max(hs), 1)


@lru_cache(maxsize=512)
def day_view(day: date, decision_time: time) -> schemas.DayView:
    data = store.load()
    points = day_ahead_forecast(data, day, decision_time)
    by_target = {p.target: p for p in points}
    cal = calibration(day, decision_time)
    has_band = cal.error_p10 is not None and cal.error_p90 is not None
    offset = adjustment(day, decision_time)

    start, end = delivery_day_bounds(day)
    series: list[schemas.SeriesPoint] = []
    t = start
    while t < end:
        fp = by_target.get(t)
        series.append(
            schemas.SeriesPoint(
                time=t,
                actual=data.actuals.get(t),
                forecast=fp.value if fp else None,
                adjusted=_r(fp.value - offset) if fp else None,
                # actual = forecast - error, so the error quantiles swap sides.
                band_low=_r(fp.value - cal.error_p90) if fp and has_band else None,
                band_high=_r(fp.value - cal.error_p10) if fp and has_band else None,
                published=fp.published if fp else None,
            )
        )
        t += HALF_HOUR

    # Forecast points are hourly (1 h each); actuals are half-hourly (0.5 h).
    forecast_mwh = sum(p.value for p in points)
    actual_mwh = sum(s.actual for s in series if s.actual is not None) * 0.5
    firm_mwh = sum(s.band_low for s in series if s.band_low is not None)
    lo, hi = _horizon_range(points)
    pairs = list(day_pairs(day, decision_time))
    return schemas.DayView(
        delivery_date=day,
        decision_time_local=decision_time.strftime("%H:%M"),
        decision_cutoff_utc=decision_cutoff(day, decision_time),
        runs_used=sorted({p.published for p in points}),
        horizon_min_hours=lo,
        horizon_max_hours=hi,
        series=series,
        stats=_stats(pairs),
        adjusted_stats=_stats(pairs, offset),
        energy=schemas.DayEnergy(
            forecast_mwh=round(forecast_mwh),
            adjusted_mwh=round(forecast_mwh - offset * len(points)),
            actual_mwh=round(actual_mwh),
            firm_mwh=round(firm_mwh),
            error_pct=_r(100 * (forecast_mwh - actual_mwh) / actual_mwh) if actual_mwh else None,
        ),
        calibration=cal,
    )


def _bucket(label: str, pairs: list[Pair]) -> schemas.BucketRow:
    s = _stats(pairs)
    return schemas.BucketRow(
        label=label, count=s.count, mae=s.mae, bias=s.bias, p10=s.p10, p90=s.p90
    )


def _buffers(errors: list[float], mean_forecast: float) -> list[schemas.BufferRow]:
    """MW to hold back from the forecast to cover wind shortfall with confidence c."""
    rows = []
    for c in BUFFER_CONFIDENCES:
        mw = max(metrics.quantile(errors, c / 100), 0.0)
        rows.append(
            schemas.BufferRow(
                confidence=c,
                buffer_mw=round(mw),
                buffer_pct_of_mean_forecast=round(100 * mw / mean_forecast, 1),
            )
        )
    return rows


@lru_cache(maxsize=64)
def accuracy(decision_time: time) -> schemas.Accuracy:
    pairs = window_pairs(decision_time)
    errors = [p.error for p in pairs]

    daily = []
    adjusted_errors = []
    for d in delivery_dates():
        dp = list(day_pairs(d, decision_time))
        offset = adjustment(d, decision_time)
        adjusted_errors += [p.error - offset for p in dp]
        s = _stats(dp)
        daily.append(
            schemas.DailyRow(
                date=d,
                mae=s.mae,
                adjusted_mae=_stats(dp, offset).mae,
                bias=s.bias,
                wape=s.wape,
                forecast_mwh=round(sum(p.point.value for p in dp)),
                actual_mwh=round(sum(p.actual for p in dp)),
            )
        )

    by_hour: dict[int, list[Pair]] = {}
    by_level: dict[int, list[Pair]] = {}
    for p in pairs:
        by_hour.setdefault(p.point.target.astimezone(config.UK_TZ).hour, []).append(p)
        by_level.setdefault(int(p.point.value // LEVEL_BUCKET_MW), []).append(p)

    gw = LEVEL_BUCKET_MW // 1000
    mean_forecast = sum(p.point.value for p in pairs) / len(pairs) if pairs else None
    mean_actual = sum(p.actual for p in pairs) / len(pairs) if pairs else None
    lo, hi = _horizon_range([p.point for p in pairs])
    return schemas.Accuracy(
        decision_time_local=decision_time.strftime("%H:%M"),
        stats=_stats(pairs),
        adjusted_stats=_error_stats(adjusted_errors, [p.actual for p in pairs]),
        horizon_min_hours=lo,
        horizon_max_hours=hi,
        mean_forecast=_r(mean_forecast),
        mean_actual=_r(mean_actual),
        daily=daily,
        by_hour=[_bucket(f"{h:02d}:00", by_hour[h]) for h in sorted(by_hour)],
        by_level=[_bucket(f"{k * gw}-{(k + 1) * gw} GW", by_level[k]) for k in sorted(by_level)],
        histogram=[
            schemas.HistBin(start=b, count=c)
            for b, c in metrics.histogram(errors, HISTOGRAM_BIN_MW)
        ],
        scatter=[(p.point.value, p.actual) for p in pairs],
        buffers=_buffers(errors, mean_forecast) if mean_forecast else [],
    )


@lru_cache(maxsize=1)
def horizon_curve() -> list[schemas.HorizonRow]:
    """Error vs lead time over every hourly target in the delivery window.

    WINDFOR runs stop at a fixed time of day, so beyond ~46 h some overnight
    targets have no forecast at all. Those horizons are dropped rather than
    reported on a different (and easier) sample than the shorter horizons.
    """
    data = store.load()
    start = delivery_day_bounds(config.FIRST_DELIVERY_DATE)[0]
    end = delivery_day_bounds(config.LAST_DELIVERY_DATE)[1]
    targets = forecast_targets(start, end)
    full = len(_match([ForecastPoint(t, 0.0, t) for t in targets]))
    rows = []
    for h in range(config.MAX_HORIZON_HOURS + 1):
        s = _stats(_match(horizon_forecast(data, targets, h)))
        if s.count < full:
            break
        rows.append(
            schemas.HorizonRow(
                horizon_hours=h,
                count=s.count,
                mae=s.mae,
                rmse=s.rmse,
                bias=s.bias,
                p10=s.p10,
                p90=s.p90,
            )
        )
    return rows


def parse_decision_time(value: str) -> time:
    t = datetime.strptime(value, "%H:%M").time()
    if t.minute % 30:
        raise ValueError("decision time must be on the hour or half hour")
    return t
