// Typed client for the WindSight API. Types mirror backend/app/schemas.py.
import { useEffect, useState } from 'react'

export interface Meta {
  first_delivery_date: string
  last_delivery_date: string
  default_decision_time: string
  calibration_days: number
  max_horizon_hours: number
  data_fetched_at: string
  sources: string[]
}

export interface ErrorStats {
  count: number
  mae: number | null
  rmse: number | null
  bias: number | null
  wape: number | null
  p10: number | null
  p90: number | null
  max_over: number | null
  max_under: number | null
}

export interface SeriesPoint {
  time: string
  actual: number | null
  forecast: number | null
  adjusted: number | null
  band_low: number | null
  band_high: number | null
  published: string | null
}

export interface DayView {
  delivery_date: string
  decision_time_local: string
  decision_cutoff_utc: string
  runs_used: string[]
  horizon_min_hours: number | null
  horizon_max_hours: number | null
  series: SeriesPoint[]
  stats: ErrorStats
  adjusted_stats: ErrorStats
  energy: {
    forecast_mwh: number
    adjusted_mwh: number
    actual_mwh: number
    firm_mwh: number
    error_pct: number | null
  }
  calibration: {
    days: string[]
    samples: number
    error_p10: number | null
    error_mean: number | null
    error_p90: number | null
  }
}

export interface BucketRow {
  label: string
  count: number
  mae: number | null
  bias: number | null
  p10: number | null
  p90: number | null
}

export interface Accuracy {
  decision_time_local: string
  stats: ErrorStats
  adjusted_stats: ErrorStats
  horizon_min_hours: number | null
  horizon_max_hours: number | null
  mean_forecast: number | null
  mean_actual: number | null
  daily: {
    date: string
    mae: number | null
    adjusted_mae: number | null
    bias: number | null
    wape: number | null
    forecast_mwh: number
    actual_mwh: number
  }[]
  by_hour: BucketRow[]
  by_level: BucketRow[]
  histogram: { start: number; count: number }[]
  scatter: [number, number][]
  buffers: { confidence: number; buffer_mw: number; buffer_pct_of_mean_forecast: number }[]
}

export interface HorizonRow {
  horizon_hours: number
  count: number
  mae: number | null
  rmse: number | null
  bias: number | null
  p10: number | null
  p90: number | null
}

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export interface Loadable<T> {
  data: T | null
  error: string | null
  loading: boolean
}

/** Fetch `path` whenever it changes; keeps showing the previous data while reloading. */
export function useApi<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<Loadable<T>>({ data: null, error: null, loading: !!path })

  useEffect(() => {
    if (!path) return
    const ctrl = new AbortController()
    setState((s) => ({ ...s, loading: true, error: null }))
    getJson<T>(path, ctrl.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: Error) => {
        if (ctrl.signal.aborted) return
        setState((s) => ({ ...s, error: err.message, loading: false }))
      })
    return () => ctrl.abort()
  }, [path])

  return state
}
