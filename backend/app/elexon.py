"""Thin client for the two Elexon BMRS datasets we use.

* FUELHH  - half-hourly outturn generation by fuel type (we keep WIND only)
* WINDFOR - hourly national wind generation forecasts, one run every ~2 hours
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import httpx

from .config import ELEXON_BASE_URL

# The stream endpoints accept wide ranges, but chunking keeps each response
# small and makes a transient failure cheap to retry.
_CHUNK_DAYS = 7


def _get(client: httpx.Client, path: str, params: dict) -> list[dict]:
    for attempt in range(3):
        try:
            resp = client.get(f"{ELEXON_BASE_URL}{path}", params=params, timeout=60)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPError:
            if attempt == 2:
                raise
    return []  # unreachable, keeps type-checkers happy


def fetch_wind_actuals(start: date, end: date) -> list[dict]:
    """WIND rows from FUELHH for settlement dates in [start, end]."""
    rows: list[dict] = []
    with httpx.Client() as client:
        day = start
        while day <= end:
            chunk_end = min(day + timedelta(days=_CHUNK_DAYS - 1), end)
            rows += _get(
                client,
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": day.isoformat(),
                    "settlementDateTo": chunk_end.isoformat(),
                    "fuelType": "WIND",
                },
            )
            day = chunk_end + timedelta(days=1)
    return [r for r in rows if r.get("fuelType") == "WIND"]


def fetch_wind_forecasts(publish_from: datetime, publish_to: datetime) -> list[dict]:
    """WINDFOR rows whose publishTime is in [publish_from, publish_to)."""
    rows: list[dict] = []
    with httpx.Client() as client:
        cursor = publish_from
        while cursor < publish_to:
            chunk_end = min(cursor + timedelta(days=_CHUNK_DAYS), publish_to)
            rows += _get(
                client,
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "publishDateTimeTo": chunk_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
            )
            cursor = chunk_end
    return rows
