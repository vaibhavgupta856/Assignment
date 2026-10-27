import { useMemo } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import { useApi, type DayView as DayData, type Meta, type SeriesPoint } from '../api'
import { Card, Kpi, Legend, Status } from '../components/ui'
import { COLORS } from '../theme'
import { addDays, axisGw, clock, dateLong, dateShort, dayTime, gw, gwh, signedPct } from '../format'

interface Props {
  meta: Meta
  date: string
  decisionTime: string
  onDateChange: (date: string) => void
}

interface Row extends SeriesPoint {
  label: string
  band: [number, number] | null
}

function downloadCsv(day: DayData) {
  const header = 'time_utc,time_uk,actual_mw,forecast_mw,adjusted_mw,p10_mw,p90_mw,forecast_published_utc'
  const lines = day.series.map((p) =>
    [p.time, clock(p.time), p.actual, p.forecast, p.adjusted, p.band_low, p.band_high, p.published]
      .map((v) => v ?? '')
      .join(','),
  )
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `windsight_${day.delivery_date}_decision_${day.decision_time_local.replace(':', '')}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  return (
    <div className="tooltip">
      <div className="tooltip-title">{row.label} UK</div>
      <TooltipRow color={COLORS.actual} label="Actual" value={gw(row.actual)} />
      {row.forecast != null && (
        <>
          <TooltipRow color={COLORS.forecast} label="Elexon forecast" value={gw(row.forecast)} />
          <TooltipRow color={COLORS.adjusted} label="Adjusted forecast" value={gw(row.adjusted)} />
          <TooltipRow
            color={COLORS.band}
            label="80% range"
            value={`${gw(row.band_low)} – ${gw(row.band_high)}`}
          />
        </>
      )}
    </div>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="tooltip-row">
      <span className="dot" style={{ background: color }} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default function DayView({ meta, date, decisionTime, onDateChange }: Props) {
  const { data, error, loading } = useApi<DayData>(
    `/api/day?date=${date}&decision_time=${encodeURIComponent(decisionTime)}`,
  )

  const rows: Row[] = useMemo(
    () =>
      (data?.series ?? []).map((p) => ({
        ...p,
        label: clock(p.time),
        band: p.band_low != null && p.band_high != null ? [p.band_low, p.band_high] : null,
      })),
    [data],
  )

  const first = meta.first_delivery_date
  const last = meta.last_delivery_date
  const decisionDay = addDays(date, -1)

  const toggle = (
    <div className="day-nav">
      <button className="btn" disabled={date <= first} onClick={() => onDateChange(addDays(date, -1))}>
        ← Prev
      </button>
      <input
        type="date"
        value={date}
        min={first}
        max={last}
        onChange={(e) => e.target.value && onDateChange(e.target.value)}
        aria-label="Delivery date"
      />
      <button className="btn" disabled={date >= last} onClick={() => onDateChange(addDays(date, 1))}>
        Next →
      </button>
    </div>
  )

  const e = data?.energy
  const atRisk = e ? e.adjusted_mwh - e.firm_mwh : null

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <p className="eyebrow">Delivery day</p>
          <h1>{dateLong(date)}</h1>
          <p className="lede">
            What the wind forecast said at <strong>{decisionTime}</strong> on {dateShort(decisionDay)} — when the
            day-ahead bids for this day had to be placed — and what actually happened.
          </p>
        </div>
        {toggle}
      </div>

      <Status loading={loading && !data} error={error} />

      {data && e && (
        <>
          <div className="kpi-grid">
            <Kpi
              label="Wind forecast (Elexon)"
              value={gwh(e.forecast_mwh)}
              detail={<>Adjusted for recent bias: {gwh(e.adjusted_mwh)}</>}
            />
            <Kpi
              label="Firm wind, 90% confidence"
              value={gwh(e.firm_mwh)}
              tone="accent"
              detail={<>{gwh(atRisk)} more is likely but not certain</>}
            />
            <Kpi
              label="Actual wind outturn"
              value={gwh(e.actual_mwh)}
              tone={Math.abs(e.error_pct ?? 0) > 20 ? 'warn' : 'default'}
              detail={<>Elexon forecast error {signedPct(e.error_pct)}</>}
            />
            <Kpi
              label="Typical hourly error (MAE)"
              value={gw(data.adjusted_stats.mae)}
              tone={(data.adjusted_stats.mae ?? 0) <= (data.stats.mae ?? 0) ? 'good' : 'warn'}
              detail={<>Adjusted · Elexon raw: {gw(data.stats.mae)}</>}
            />
          </div>

          <Card
            title="Wind generation: forecast at decision time vs actual"
            subtitle={
              <>
                Forecast run published <strong>{data.runs_used.map(dayTime).join(', ')}</strong> UK · lead time{' '}
                {data.horizon_min_hours}–{data.horizon_max_hours} h · uncertainty band calibrated on{' '}
                {data.calibration.samples} hourly errors from {dateShort(data.calibration.days[0])} –{' '}
                {dateShort(data.calibration.days[data.calibration.days.length - 1])} (all known before the decision)
              </>
            }
            actions={
              <button className="btn btn-ghost" onClick={() => downloadCsv(data)}>
                Download CSV
              </button>
            }
          >
            <Legend
              items={[
                { label: 'Actual outturn', color: COLORS.actual },
                { label: 'Elexon forecast', color: COLORS.forecast, dashed: true },
                { label: 'Adjusted forecast', color: COLORS.adjusted },
                { label: '80% likely range (P10–P90)', color: COLORS.band, area: true },
              ]}
            />
            <div className="chart chart-tall">
              <ResponsiveContainer>
                <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke={COLORS.grid} vertical={false} />
                  <XAxis dataKey="label" interval={5} tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis
                    tickFormatter={axisGw}
                    width={48}
                    tick={{ fontSize: 12 }}
                    domain={[0, 'auto']}
                    label={{ value: 'GW', angle: -90, position: 'insideLeft', fontSize: 12 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    dataKey="band"
                    stroke="none"
                    fill={COLORS.band}
                    fillOpacity={0.16}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="forecast"
                    stroke={COLORS.forecast}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="adjusted"
                    stroke={COLORS.adjusted}
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    dataKey="actual"
                    stroke={COLORS.actual}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid-2">
            <Card title="How to read this for procurement">
              <ul className="bullets">
                <li>
                  <strong>Firm wind ({gwh(e.firm_mwh)})</strong> adds up, hour by hour, the level that actual wind
                  beat in 90% of recent hours given this forecast. Cover demand above it with day-ahead purchases.
                </li>
                <li>
                  <strong>{gwh(atRisk)}</strong> between the firm level and the adjusted forecast is the risk you
                  choose to carry or hedge.
                </li>
                <li>
                  The Elexon forecast has recently been running{' '}
                  <strong>
                    {(data.calibration.error_mean ?? 0) >= 0 ? 'high' : 'low'} by{' '}
                    {gw(Math.abs(data.calibration.error_mean ?? 0))}
                  </strong>{' '}
                  on average, so the adjusted forecast removes that.
                </li>
              </ul>
            </Card>
            <Card title="Forecast quality on this day">
              <table className="table">
                <thead>
                  <tr>
                    <th />
                    <th>Elexon</th>
                    <th>Adjusted</th>
                  </tr>
                </thead>
                <tbody>
                  <StatRow label="Mean abs. error" a={gw(data.stats.mae)} b={gw(data.adjusted_stats.mae)} />
                  <StatRow label="RMSE" a={gw(data.stats.rmse)} b={gw(data.adjusted_stats.rmse)} />
                  <StatRow label="Bias (forecast − actual)" a={gw(data.stats.bias)} b={gw(data.adjusted_stats.bias)} />
                  <StatRow
                    label="Largest shortfall"
                    a={gw(data.stats.max_over)}
                    b={gw(data.adjusted_stats.max_over)}
                  />
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function StatRow({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{a}</td>
      <td>{b}</td>
    </tr>
  )
}
