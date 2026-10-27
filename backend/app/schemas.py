"""Response models. They double as the API contract shown at /docs."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class Meta(BaseModel):
    first_delivery_date: date
    last_delivery_date: date
    default_decision_time: str = Field(description="UK local time on D-1, HH:MM")
    calibration_days: int
    max_horizon_hours: int
    data_fetched_at: str
    sources: list[str]


class ErrorStats(BaseModel):
    count: int
    mae: float | None = Field(description="Mean absolute error, MW")
    rmse: float | None = Field(description="Root mean squared error, MW")
    bias: float | None = Field(description="Mean of forecast - actual, MW (+ = over-forecast)")
    wape: float | None = Field(description="Sum |error| / sum actual, %")
    p10: float | None
    p90: float | None
    max_over: float | None = Field(description="Largest over-forecast (wind shortfall), MW")
    max_under: float | None = Field(description="Largest under-forecast (wind surplus), MW")


class SeriesPoint(BaseModel):
    time: datetime
    actual: float | None = None
    forecast: float | None = None
    adjusted: float | None = Field(
        None, description="Forecast minus trailing mean error (bias-corrected)"
    )
    band_low: float | None = Field(
        None, description="P10 expected wind (90% chance actual is above)"
    )
    band_high: float | None = Field(None, description="P90 expected wind")
    published: datetime | None = Field(None, description="Publish time of the forecast run used")


class Calibration(BaseModel):
    days: list[date]
    samples: int
    error_p10: float | None
    error_mean: float | None = Field(
        description="Mean error (bias); subtracted to give the adjusted forecast"
    )
    error_p90: float | None


class DayEnergy(BaseModel):
    forecast_mwh: float
    adjusted_mwh: float
    actual_mwh: float
    firm_mwh: float = Field(description="Energy from the P10 (90%-confidence) wind line")
    error_pct: float | None = Field(description="(forecast - actual) / actual, %")


class DayView(BaseModel):
    delivery_date: date
    decision_time_local: str
    decision_cutoff_utc: datetime
    runs_used: list[datetime]
    horizon_min_hours: float | None
    horizon_max_hours: float | None
    series: list[SeriesPoint]
    stats: ErrorStats
    adjusted_stats: ErrorStats
    energy: DayEnergy
    calibration: Calibration


class DailyRow(BaseModel):
    date: date
    mae: float | None
    adjusted_mae: float | None
    bias: float | None
    wape: float | None
    forecast_mwh: float
    actual_mwh: float


class BucketRow(BaseModel):
    label: str
    count: int
    mae: float | None
    bias: float | None
    p10: float | None
    p90: float | None


class BufferRow(BaseModel):
    confidence: int = Field(
        description="Probability (%) that wind shortfall stays below the buffer"
    )
    buffer_mw: float
    buffer_pct_of_mean_forecast: float


class HistBin(BaseModel):
    start: float
    count: int


class Accuracy(BaseModel):
    decision_time_local: str
    stats: ErrorStats
    adjusted_stats: ErrorStats
    horizon_min_hours: float | None
    horizon_max_hours: float | None
    mean_forecast: float | None
    mean_actual: float | None
    daily: list[DailyRow]
    by_hour: list[BucketRow]
    by_level: list[BucketRow]
    histogram: list[HistBin]
    scatter: list[tuple[float, float]] = Field(description="[forecast, actual] pairs, MW")
    buffers: list[BufferRow]


class HorizonRow(BaseModel):
    horizon_hours: int
    count: int
    mae: float | None
    rmse: float | None
    bias: float | None
    p10: float | None
    p90: float | None
