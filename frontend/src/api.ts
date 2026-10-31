// Typed client for the WindSight API. Types mirror backend/app/schemas.py.

export const dayPath = (date: string, decisionTime: string) =>
  `/api/day?date=${date}&decision_time=${encodeURIComponent(decisionTime)}`

export const accuracyPath = (decisionTime: string) =>
  `/api/accuracy?decision_time=${encodeURIComponent(decisionTime)}`
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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

// The API serves an immutable snapshot, so every response can be kept for the
// whole session. In-flight requests are shared, so a prefetch that is still
// running is reused instead of fetching the same URL twice.
const cache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  if (cache.has(path)) return Promise.resolve(cache.get(path) as T)
  let pending = inflight.get(path)
  if (!pending) {
    pending = getJson<T>(path)
      .then((data) => {
        cache.set(path, data)
        return data
      })
      .finally(() => inflight.delete(path))
    inflight.set(path, pending)
  }
  return pending as Promise<T>
}

/** Warm the cache in the background (e.g. the next day) so navigating there is instant. */
export function prefetch(path: string) {
  load(path).catch(() => undefined)
}

export interface Loadable<T> {
  data: T | null
  error: string | null
  /** True while `path` is loading; `data` then still holds the previous result. */
  loading: boolean
}

/** Fetch `path` whenever it changes; keeps showing the previous data while reloading. */
export function useApi<T>(path: string | null): Loadable<T> {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: string | null }>({
    path: null,
    data: null,
    error: null,
  })

  useEffect(() => {
    if (!path) return
    let cancelled = false
    load<T>(path)
      .then((data) => !cancelled && setState({ path, data, error: null }))
      .catch((err: Error) => !cancelled && setState((s) => ({ ...s, path, error: err.message })))
    return () => {
      cancelled = true
    }
  }, [path])

  // A cached response is shown in the same render the path changes, with no flash of old data.
  if (path && state.path !== path && cache.has(path)) {
    return { data: cache.get(path) as T, error: null, loading: false }
  }
  const current = state.path === path
  return {
    data: state.data,
    error: current ? state.error : null,
    loading: !!path && !current,
  }
}
