// Display helpers. All times are shown in UK local time, as traders see them.

const UK = 'Europe/London'

const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: UK, hour: '2-digit', minute: '2-digit' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: UK, weekday: 'short', day: 'numeric', month: 'short' })
const longDayFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: UK,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export const clock = (iso: string) => clockFmt.format(new Date(iso))
export const dayLabel = (iso: string) => dayFmt.format(new Date(iso))
export const dayTime = (iso: string) => `${dayLabel(iso)} ${clock(iso)}`

/** A plain `YYYY-MM-DD` date (no time zone shift). */
export const dateLong = (ymd: string) => longDayFmt.format(new Date(`${ymd}T12:00:00Z`))
export const dateShort = (ymd: string) => dayFmt.format(new Date(`${ymd}T12:00:00Z`))

export const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const gw = (mw: number | null | undefined, digits = 2) =>
  mw == null ? '–' : `${(mw / 1000).toFixed(digits)} GW`

export const signedGw = (mw: number | null | undefined, digits = 2) =>
  mw == null ? '–' : `${mw > 0 ? '+' : ''}${(mw / 1000).toFixed(digits)} GW`

export const gwh = (mwh: number | null | undefined) =>
  mwh == null ? '–' : `${(mwh / 1000).toLocaleString('en-GB', { maximumFractionDigits: 0 })} GWh`

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null ? '–' : `${v.toFixed(digits)}%`

export const signedPct = (v: number | null | undefined, digits = 1) =>
  v == null ? '–' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`

/** Percentage change from `from` to `to`. */
export const change = (from: number | null, to: number | null) =>
  from && to != null ? (100 * (to - from)) / from : null

export const axisGw = (mw: number) => `${(mw / 1000).toFixed(0)}`
