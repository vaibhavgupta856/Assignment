"""HTTP API. Also serves the built React app when it is present (Docker)."""

from __future__ import annotations

from datetime import date, time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, schemas, service, store

app = FastAPI(
    title="WindSight API",
    description="Day-ahead wind forecast monitoring for GB power procurement (Elexon BMRS data).",
    version="1.0.0",
)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# The data is an immutable snapshot, so a response for a given URL never changes
# within a deployment. Browsers may reuse it for an hour; the CDN keeps it until
# the next deploy (Vercel purges its edge cache on every deployment).
API_CACHE_CONTROL = "public, max-age=3600, s-maxage=31536000, stale-while-revalidate=86400"


@app.middleware("http")
async def cache_api_responses(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/api/") and path != "/api/health" and response.status_code == 200:
        response.headers["Cache-Control"] = API_CACHE_CONTROL
    return response


DecisionTime = Query(
    config.DEFAULT_DECISION_TIME.strftime("%H:%M"),
    pattern=r"^\d{2}:\d{2}$",
    description="UK local time on D-1 when the purchase decision is made",
)


def _decision_time(value: str) -> time:
    try:
        return service.parse_decision_time(value)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", response_model=schemas.Meta)
def meta() -> schemas.Meta:
    return schemas.Meta(
        first_delivery_date=config.FIRST_DELIVERY_DATE,
        last_delivery_date=config.LAST_DELIVERY_DATE,
        default_decision_time=config.DEFAULT_DECISION_TIME.strftime("%H:%M"),
        calibration_days=config.CALIBRATION_DAYS,
        max_horizon_hours=config.MAX_HORIZON_HOURS,
        data_fetched_at=store.load().fetched_at,
        sources=["Elexon BMRS FUELHH (fuelType=WIND)", "Elexon BMRS WINDFOR"],
    )


@app.get("/api/day", response_model=schemas.DayView)
def day(
    delivery_date: date = Query(..., alias="date", description="Delivery day D (UK)"),
    decision_time: str = DecisionTime,
) -> schemas.DayView:
    if not config.FIRST_DELIVERY_DATE <= delivery_date <= config.LAST_DELIVERY_DATE:
        raise HTTPException(
            404,
            f"delivery date must be between {config.FIRST_DELIVERY_DATE} "
            f"and {config.LAST_DELIVERY_DATE}",
        )
    return service.day_view(delivery_date, _decision_time(decision_time))


@app.get("/api/accuracy", response_model=schemas.Accuracy)
def accuracy(decision_time: str = DecisionTime) -> schemas.Accuracy:
    return service.accuracy(_decision_time(decision_time))


@app.get("/api/horizons", response_model=list[schemas.HorizonRow])
def horizons() -> list[schemas.HorizonRow]:
    return service.horizon_curve()


# In Docker the React build is copied next to the backend; serve it at "/".
_STATIC = Path(__file__).resolve().parent.parent / "static"
if _STATIC.is_dir():
    app.mount("/", StaticFiles(directory=_STATIC, html=True), name="frontend")
