import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { accuracyPath, useApi, type Accuracy, type HorizonRow } from '../api'
import { Card, Kpi, Legend, Status } from '../components/ui'
import { COLORS } from '../theme'
import { axisGw, change, dateShort, gw, pct, signedGw, signedPct } from '../format'

interface Props {
  decisionTime: string
  onOpenDay: (date: string) => void
}

const gwTooltip = (v: number) => gw(v)

export default function AccuracyView({ decisionTime, onOpenDay }: Props) {
  const acc = useApi<Accuracy>(accuracyPath(decisionTime))
  const hor = useApi<HorizonRow[]>('/api/horizons')
  const a = acc.data

  const daily = useMemo(() => (a?.daily ?? []).map((d) => ({ ...d, label: dateShort(d.date) })), [a])
  const scatter = useMemo(() => (a?.scatter ?? []).map(([f, act]) => ({ f, act })), [a])
  const maxScatter = useMemo(() => Math.max(0, ...scatter.flatMap((p) => [p.f, p.act])), [scatter])
  const worst = useMemo(() => [...daily].sort((x, y) => (y.mae ?? 0) - (x.mae ?? 0)).slice(0, 5), [daily])

  if (!a) return <Status loading={acc.loading} error={acc.error} />

  const s = a.stats
  const adj = a.adjusted_stats
  const maeGain = change(s.mae, adj.mae)
  const biasPct = s.bias != null && a.mean_actual ? (100 * s.bias) / a.mean_actual : null
  const p90 = a.buffers.find((b) => b.confidence === 90)

  return (
    <div className={`stack ${acc.loading ? 'is-updating' : ''}`} aria-busy={acc.loading}>
      <div className="page-head">
        <div>
          <p className="eyebrow">Back-test · January 2026 decisions · {s.count} delivery hours</p>
          <h1>How far can you trust the day-ahead wind forecast?</h1>
          <p className="lede">
            Every hour from 2 Jan to 1 Feb is scored using only the forecast available at{' '}
            <strong>{decisionTime}</strong> the day before, which is {a.horizon_min_hours}–{a.horizon_max_hours} h
            ahead.
          </p>
        </div>
      </div>

      <div className="insight">
        <div className="insight-icon">!</div>
        <div>
          <strong>
            The Elexon forecast over-estimated wind by {gw(s.bias)} on average ({signedPct(biasPct, 0)} of actual
            output).
          </strong>{' '}
          Buyers relying on it would have been structurally short. Correcting for the previous two weeks' bias, using
          only data known at decision time, cuts the typical hourly error from {gw(s.mae)} to {gw(adj.mae)} (
          {signedPct(maeGain, 0)}).
        </div>
      </div>

      <div className="kpi-grid">
        <Kpi
          label="Mean absolute error"
          value={gw(adj.mae)}
          tone="good"
          detail={
            <>
              Adjusted · Elexon {gw(s.mae)} ({signedPct(maeGain, 0)})
            </>
          }
        />
        <Kpi
          label="Bias (forecast − actual)"
          value={signedGw(s.bias)}
          tone="warn"
          detail={<>Elexon raw · adjusted {signedGw(adj.bias)}</>}
        />
        <Kpi
          label="RMSE"
          value={gw(adj.rmse)}
          detail={
            <>
              Adjusted · Elexon {gw(s.rmse)} · penalises big misses
            </>
          }
        />
        <Kpi
          label="Hold-back for 90% cover"
          value={gw(p90?.buffer_mw ?? null)}
          tone="accent"
          detail={<>{pct(p90?.buffer_pct_of_mean_forecast)} of the average Elexon forecast</>}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Planning buffer"
          subtitle="How much to hold back from the Elexon forecast so that wind shortfall is covered with a given confidence"
        >
          <table className="table">
            <thead>
              <tr>
                <th>Confidence</th>
                <th>Hold back</th>
                <th>% of avg forecast</th>
              </tr>
            </thead>
            <tbody>
              {a.buffers.map((b) => (
                <tr key={b.confidence} className={b.confidence === 90 ? 'row-highlight' : ''}>
                  <td>{b.confidence}% of hours</td>
                  <td>{gw(b.buffer_mw)}</td>
                  <td>{pct(b.buffer_pct_of_mean_forecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">
            Read as: "In {p90?.confidence}% of January hours, actual wind was no more than{' '}
            {gw(p90?.buffer_mw ?? null)} below the day-ahead forecast."
          </p>
        </Card>

        <Card title="Biggest misses" subtitle="Days with the largest average hourly error. Click a day to inspect it.">
          <table className="table table-click">
            <thead>
              <tr>
                <th>Delivery day</th>
                <th>MAE</th>
                <th>Bias</th>
                <th>Forecast vs actual</th>
              </tr>
            </thead>
            <tbody>
              {worst.map((d) => (
                <tr key={d.date} onClick={() => onOpenDay(d.date)}>
                  <td>{d.label}</td>
                  <td>{gw(d.mae)}</td>
                  <td>{signedGw(d.bias)}</td>
                  <td>{signedPct(change(d.actual_mwh, d.forecast_mwh), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card
        title="Daily forecast error"
        subtitle="Mean absolute error per delivery day. Click a bar to open that day."
      >
        <Legend
          items={[
            { label: 'Elexon forecast', color: COLORS.forecast, area: true },
            { label: 'Adjusted forecast', color: COLORS.adjusted, area: true },
          ]}
        />
        <div className="chart">
          <ResponsiveContainer>
            <BarChart data={daily} margin={{ top: 10, right: 16, bottom: 0, left: 0 }} barGap={1}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} tickLine={false} />
              <YAxis tickFormatter={axisGw} width={44} tick={{ fontSize: 12 }} unit=" GW" />
              <Tooltip formatter={gwTooltip} cursor={{ fill: '#f1f5f9' }} />
              <Bar
                dataKey="mae"
                name="Elexon MAE"
                fill={COLORS.forecast}
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(d: { date: string }) => onOpenDay(d.date)}
              />
              <Bar
                dataKey="adjusted_mae"
                name="Adjusted MAE"
                fill={COLORS.adjusted}
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(d: { date: string }) => onOpenDay(d.date)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid-2">
        <Card
          title="Error grows with lead time"
          subtitle="Elexon forecast error by hours between publication and delivery. Shaded: the lead times you actually trade at."
        >
          <Status loading={hor.loading && !hor.data} error={hor.error} />
          <div className="chart">
            <ResponsiveContainer>
              <LineChart data={hor.data ?? []} margin={{ top: 10, right: 16, bottom: 14, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                {a.horizon_min_hours != null && a.horizon_max_hours != null && (
                  <ReferenceArea
                    x1={Math.ceil(a.horizon_min_hours)}
                    x2={Math.min(Math.floor(a.horizon_max_hours), hor.data?.[hor.data.length - 1]?.horizon_hours ?? 0)}
                    fill={COLORS.band}
                    fillOpacity={0.1}
                  />
                )}
                <XAxis
                  dataKey="horizon_hours"
                  type="number"
                  domain={[0, 'dataMax']}
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Lead time (h)', position: 'insideBottom', offset: -8, fontSize: 12 }}
                />
                <YAxis tickFormatter={axisGw} width={44} tick={{ fontSize: 12 }} domain={[0, 'auto']} unit=" GW" />
                <Tooltip formatter={gwTooltip} labelFormatter={(h) => `${h} h ahead`} />
                <Line dataKey="mae" name="MAE" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
                <Line dataKey="rmse" name="RMSE" stroke={COLORS.muted} strokeWidth={2} dot={false} />
                <Line dataKey="bias" name="Bias" stroke={COLORS.over} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { label: 'MAE', color: COLORS.forecast },
              { label: 'RMSE', color: COLORS.muted },
              { label: 'Bias', color: COLORS.over, dashed: true },
            ]}
          />
        </Card>

        <Card
          title="Over-forecasting grows with wind level"
          subtitle="Average error by forecast level. The forecast is most optimistic when it predicts very high wind."
        >
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={a.by_level} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
                <YAxis tickFormatter={axisGw} width={44} tick={{ fontSize: 12 }} unit=" GW" />
                <ReferenceLine y={0} stroke={COLORS.muted} />
                <Tooltip
                  formatter={gwTooltip}
                  labelFormatter={(l, p) => `Forecast ${l} · ${p?.[0]?.payload?.count ?? 0} hours`}
                />
                <Bar dataKey="bias" name="Bias" radius={[3, 3, 0, 0]}>
                  {a.by_level.map((r) => (
                    <Cell key={r.label} fill={(r.bias ?? 0) >= 0 ? COLORS.over : COLORS.under} />
                  ))}
                </Bar>
                <Bar dataKey="mae" name="MAE" fill={COLORS.muted} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={[
              { label: 'Bias (+ = over-forecast)', color: COLORS.over, area: true },
              { label: 'MAE', color: COLORS.muted, area: true },
            ]}
          />
        </Card>
      </div>

      <div className="grid-2">
        <Card
          title="Error distribution"
          subtitle="Hourly Elexon error (forecast − actual). Right of zero means less wind than forecast."
        >
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={a.histogram} margin={{ top: 10, right: 16, bottom: 14, left: 0 }} barCategoryGap={1}>
                <CartesianGrid stroke={COLORS.grid} vertical={false} />
                <XAxis
                  dataKey="start"
                  tickFormatter={(v: number) => (v / 1000).toFixed(0)}
                  tick={{ fontSize: 12 }}
                  interval={1}
                  label={{ value: 'Error (GW)', position: 'insideBottom', offset: -8, fontSize: 12 }}
                />
                <YAxis width={44} tick={{ fontSize: 12 }} />
                <Tooltip
                  labelFormatter={(v: number) => `${gw(v, 1)} to ${gw(v + 500, 1)}`}
                  formatter={(v: number) => [`${v} hours`, 'Count']}
                />
                <Bar dataKey="count">
                  {a.histogram.map((b) => (
                    <Cell key={b.start} fill={b.start >= 0 ? COLORS.over : COLORS.under} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Forecast vs actual" subtitle="Each dot is one hour. Points below the diagonal are over-forecasts.">
          <div className="chart">
            <ResponsiveContainer>
              <ScatterChart margin={{ top: 10, right: 16, bottom: 14, left: 0 }}>
                <CartesianGrid stroke={COLORS.grid} />
                <XAxis
                  dataKey="f"
                  type="number"
                  name="Forecast"
                  domain={[0, Math.ceil(maxScatter / 5000) * 5000]}
                  tickFormatter={axisGw}
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Forecast (GW)', position: 'insideBottom', offset: -8, fontSize: 12 }}
                />
                <YAxis
                  dataKey="act"
                  type="number"
                  name="Actual"
                  domain={[0, Math.ceil(maxScatter / 5000) * 5000]}
                  tickFormatter={axisGw}
                  width={44}
                  tick={{ fontSize: 12 }}
                />
                <ZAxis range={[14, 14]} />
                <Tooltip formatter={gwTooltip} cursor={{ strokeDasharray: '3 3' }} />
                <ReferenceLine
                  segment={[
                    { x: 0, y: 0 },
                    { x: maxScatter, y: maxScatter },
                  ]}
                  stroke={COLORS.actual}
                  strokeDasharray="4 4"
                />
                <Scatter data={scatter} fill={COLORS.adjusted} fillOpacity={0.45} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Error by time of day" subtitle="Elexon forecast, by UK delivery hour">
        <div className="chart chart-short">
          <ResponsiveContainer>
            <ComposedChart data={a.by_hour} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={COLORS.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={1} tickLine={false} />
              <YAxis tickFormatter={axisGw} width={44} tick={{ fontSize: 12 }} unit=" GW" />
              <Tooltip formatter={gwTooltip} />
              <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} radius={[3, 3, 0, 0]} />
              <Line dataKey="bias" name="Bias" stroke={COLORS.over} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <Legend
          items={[
            { label: 'MAE', color: COLORS.forecast, area: true },
            { label: 'Bias', color: COLORS.over },
          ]}
        />
      </Card>
    </div>
  )
}
