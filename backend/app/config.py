"""Static configuration for the analysis window and data sources.

Everything that defines *what* we analyse lives here so the rest of the code
stays free of magic dates.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

UK_TZ = ZoneInfo("Europe/London")

# Purchase decisions are made on day D-1 for delivery on day D.
# Scope of the challenge: decisions made during January 2026.
FIRST_DECISION_DATE = date(2026, 1, 1)
LAST_DECISION_DATE = date(2026, 1, 31)
FIRST_DELIVERY_DATE = FIRST_DECISION_DATE + timedelta(days=1)  # 2026-01-02
LAST_DELIVERY_DATE = LAST_DECISION_DATE + timedelta(days=1)  # 2026-02-01

# GB day-ahead auctions close at 09:20 (EPEX) / 09:50 (N2EX) UK time on D-1.
# A buyer needs the forecast a little before that, so 09:00 is the default.
DEFAULT_DECISION_TIME = time(9, 0)

# Forecast lead times analysed in the horizon study (hours).
MAX_HORIZON_HOURS = 48

# Uncertainty bands are calibrated on the forecast errors of the trailing N
# delivery days whose outturn was fully known at decision time (no look-ahead).
CALIBRATION_DAYS = 14
# Snapshot starts early enough to calibrate the first delivery day in scope.
FIRST_DATA_DATE = FIRST_DELIVERY_DATE - timedelta(days=CALIBRATION_DAYS + 1)

ELEXON_BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ACTUALS_FILE = DATA_DIR / "actuals.json"
FORECASTS_FILE = DATA_DIR / "forecasts.json"
