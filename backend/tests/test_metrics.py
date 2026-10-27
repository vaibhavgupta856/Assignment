import math

import pytest

from app.metrics import histogram, quantile, summarize


def test_quantile_matches_numpy_linear_method():
    values = [4, 1, 3, 2]
    assert quantile(values, 0.0) == 1
    assert quantile(values, 1.0) == 4
    assert quantile(values, 0.5) == 2.5
    assert quantile(values, 0.1) == pytest.approx(1.3)


def test_quantile_of_empty_is_nan():
    assert math.isnan(quantile([], 0.5))


def test_summarize_uses_forecast_minus_actual_sign():
    s = summarize(forecast=[110, 90, 100], actual=[100, 100, 100])
    assert s.count == 3
    assert s.mae == pytest.approx(20 / 3)
    assert s.bias == 0
    assert s.rmse == pytest.approx(math.sqrt(200 / 3))
    assert s.wape == pytest.approx(100 * 20 / 300)
    assert s.max_over == 10  # wind shortfall
    assert s.max_under == -10  # wind surplus


def test_summarize_reports_zero_when_never_over_forecast():
    s = summarize(forecast=[90, 95], actual=[100, 100])
    assert s.max_over == 0
    assert s.bias == -7.5


def test_summarize_empty_and_mismatched_inputs():
    assert summarize([], []).count == 0
    with pytest.raises(ValueError):
        summarize([1], [1, 2])


def test_histogram_bins_are_contiguous():
    bins = histogram([-120, -10, 5, 260], width=100)
    assert bins == [(-200, 1), (-100, 1), (0, 1), (100, 0), (200, 1)]
    assert sum(c for _, c in bins) == 4
