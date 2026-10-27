from datetime import UTC, date, datetime, time, timedelta

from app import store
from app.selection import (
    day_ahead_forecast,
    decision_cutoff,
    delivery_day_bounds,
    horizon_forecast,
    latest_forecast,
)


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


TARGET = utc(2026, 1, 15, 12)


def make_data(runs: dict[datetime, dict[datetime, float]]) -> store.WindData:
    rows = [[iso(p), iso(t), g] for p, pts in runs.items() for t, g in pts.items()]
    return store.build([], rows)


def test_uses_latest_run_published_before_cutoff():
    data = make_data(
        {
            utc(2026, 1, 14, 2, 30): {TARGET: 100},
            utc(2026, 1, 14, 7, 30): {TARGET: 200},
            utc(2026, 1, 14, 9, 30): {TARGET: 300},  # after cutoff: must be ignored
        }
    )
    point = latest_forecast(data, TARGET, cutoff=utc(2026, 1, 14, 9))
    assert point is not None
    assert point.value == 200
    assert point.published == utc(2026, 1, 14, 7, 30)
    assert point.horizon_hours == 28.5


def test_run_published_exactly_at_cutoff_is_available():
    data = make_data({utc(2026, 1, 14, 9): {TARGET: 100}})
    assert latest_forecast(data, TARGET, cutoff=utc(2026, 1, 14, 9)).value == 100


def test_falls_back_to_older_run_when_latest_does_not_cover_target():
    data = make_data(
        {
            utc(2026, 1, 13, 22, 30): {TARGET: 100},
            utc(2026, 1, 14, 7, 30): {TARGET - timedelta(hours=1): 999},
        }
    )
    assert latest_forecast(data, TARGET, cutoff=utc(2026, 1, 14, 9)).value == 100


def test_backcasts_are_never_treated_as_forecasts():
    # A run published after the target time also reports values for it.
    data = make_data({TARGET + timedelta(hours=2): {TARGET: 100}})
    assert latest_forecast(data, TARGET, cutoff=TARGET + timedelta(hours=5)) is None


def test_no_forecast_available_returns_none():
    data = make_data({utc(2026, 1, 14, 10): {TARGET: 100}})
    assert latest_forecast(data, TARGET, cutoff=utc(2026, 1, 14, 9)) is None


def test_decision_cutoff_is_previous_day_uk_time():
    # January: UK time == UTC
    assert decision_cutoff(date(2026, 1, 15), time(9)) == utc(2026, 1, 14, 9)
    # Summer: BST is UTC+1
    assert decision_cutoff(date(2026, 7, 15), time(9)) == utc(2026, 7, 14, 8)


def test_delivery_day_handles_clock_changes():
    for day, hours in [(date(2026, 1, 15), 24), (date(2026, 3, 29), 23), (date(2026, 10, 25), 25)]:
        start, end = delivery_day_bounds(day)
        assert (end - start) == timedelta(hours=hours)


def test_day_ahead_forecast_covers_each_hour_of_the_day():
    day = date(2026, 1, 15)
    start, _ = delivery_day_bounds(day)
    run = utc(2026, 1, 14, 7, 30)
    data = make_data({run: {start + timedelta(hours=h): float(h) for h in range(30)}})
    points = day_ahead_forecast(data, day, time(9))
    assert [p.value for p in points] == [float(h) for h in range(24)]
    assert {p.published for p in points} == {run}


def test_horizon_forecast_requires_minimum_lead_time():
    data = make_data(
        {
            TARGET - timedelta(hours=30): {TARGET: 100},
            TARGET - timedelta(hours=10): {TARGET: 200},
        }
    )
    assert [p.value for p in horizon_forecast(data, [TARGET], 4)] == [200]
    assert [p.value for p in horizon_forecast(data, [TARGET], 24)] == [100]
    assert horizon_forecast(data, [TARGET], 36) == []
