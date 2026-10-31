"""End-to-end tests against the committed January 2026 snapshot."""

from datetime import date

from fastapi.testclient import TestClient

from app import service
from app.main import app

client = TestClient(app)


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_meta_describes_january_decision_window():
    body = client.get("/api/meta").json()
    assert body["first_delivery_date"] == "2026-01-02"
    assert body["last_delivery_date"] == "2026-02-01"
    assert body["default_decision_time"] == "09:00"


def test_day_view_only_uses_forecasts_published_before_cutoff():
    body = client.get("/api/day", params={"date": "2026-01-15", "decision_time": "09:00"}).json()
    assert len(body["series"]) == 48
    assert sum(p["forecast"] is not None for p in body["series"]) == 24
    assert all(p["actual"] is not None for p in body["series"])
    cutoff = body["decision_cutoff_utc"]
    assert cutoff.startswith("2026-01-14T09:00")
    assert all(run < cutoff for run in body["runs_used"])
    assert body["horizon_min_hours"] >= 15


def test_band_brackets_the_adjusted_forecast():
    body = client.get("/api/day", params={"date": "2026-01-20"}).json()
    for p in body["series"]:
        if p["forecast"] is not None:
            assert p["band_low"] <= p["adjusted"] <= p["band_high"]


def test_calibration_never_looks_ahead():
    for day in service.delivery_dates():
        days = service.calibration_days(day)
        assert max(days) <= date.fromordinal(day.toordinal() - 2)


def test_day_outside_window_is_rejected():
    assert client.get("/api/day", params={"date": "2026-03-01"}).status_code == 404


def test_invalid_decision_time_is_rejected():
    r = client.get("/api/day", params={"date": "2026-01-15", "decision_time": "09:15"})
    assert r.status_code == 422


def test_accuracy_covers_every_hour_in_window():
    body = client.get("/api/accuracy").json()
    assert body["stats"]["count"] == 31 * 24
    assert len(body["daily"]) == 31
    assert body["adjusted_stats"]["mae"] < body["stats"]["mae"]
    assert [b["confidence"] for b in body["buffers"]] == [50, 80, 90, 95]


def test_data_responses_are_cacheable_but_errors_and_health_are_not():
    ok = client.get("/api/day", params={"date": "2026-01-15"})
    assert "s-maxage" in ok.headers["cache-control"]
    missing = client.get("/api/day", params={"date": "2026-03-01"})
    assert "s-maxage" not in missing.headers.get("cache-control", "")
    assert "s-maxage" not in client.get("/api/health").headers.get("cache-control", "")


def test_horizon_curve_is_reported_on_a_constant_sample():
    rows = client.get("/api/horizons").json()
    assert rows[0]["horizon_hours"] == 0
    assert len({r["count"] for r in rows}) == 1
