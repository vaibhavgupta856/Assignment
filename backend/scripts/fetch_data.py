"""Download the January 2026 wind data snapshot from Elexon.

January 2026 is in the past, so the app serves a committed snapshot instead of
calling Elexon on every request: responses are fast, deterministic and the app
keeps working if the upstream API is slow or down. Re-run this script to
refresh the snapshot:

    python -m scripts.fetch_data          (from the backend/ directory)
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config  # noqa: E402
from app.elexon import fetch_wind_actuals, fetch_wind_forecasts  # noqa: E402


def main() -> None:
    # Actuals: the calibration history plus every delivery day in scope, with
    # a day either side so UK-local days are always fully covered.
    actual_rows = fetch_wind_actuals(
        config.FIRST_DATA_DATE - timedelta(days=1),
        config.LAST_DELIVERY_DATE + timedelta(days=1),
    )
    actuals = sorted({r["startTime"]: r["generation"] for r in actual_rows}.items())

    # Forecasts: anything published early enough to be "the latest forecast"
    # for any target in the snapshot at any horizon up to MAX_HORIZON_HOURS.
    first_target = datetime.combine(
        config.FIRST_DATA_DATE, datetime.min.time(), tzinfo=config.UK_TZ
    ).astimezone(UTC)
    last_target = datetime.combine(
        config.LAST_DELIVERY_DATE + timedelta(days=1),
        datetime.min.time(),
        tzinfo=config.UK_TZ,
    ).astimezone(UTC)
    forecast_rows = fetch_wind_forecasts(
        first_target - timedelta(hours=config.MAX_HORIZON_HOURS + 24),
        last_target,
    )
    forecasts = sorted(
        {(r["publishTime"], r["startTime"]): r["generation"] for r in forecast_rows}.items()
    )

    fetched_at = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    config.ACTUALS_FILE.write_text(
        json.dumps(
            {
                "source": "Elexon BMRS FUELHH (fuelType=WIND)",
                "fetched_at": fetched_at,
                "columns": ["startTime", "generation"],
                "rows": [[t, g] for t, g in actuals],
            },
            separators=(",", ":"),
        )
    )
    config.FORECASTS_FILE.write_text(
        json.dumps(
            {
                "source": "Elexon BMRS WINDFOR",
                "fetched_at": fetched_at,
                "columns": ["publishTime", "startTime", "generation"],
                "rows": [[p, t, g] for (p, t), g in forecasts],
            },
            separators=(",", ":"),
        )
    )
    print(f"actuals: {len(actuals)} rows, forecasts: {len(forecasts)} rows")


if __name__ == "__main__":
    main()
