import type { Meta } from '../api'
import { Card } from '../components/ui'
import { dateLong } from '../format'

export default function MethodView({ meta }: { meta: Meta }) {
  return (
    <div className="stack narrow">
      <div className="page-head">
        <div>
          <p className="eyebrow">Methodology</p>
          <h1>How WindSight scores the forecast</h1>
          <p className="lede">Every number in the app follows the rules below, with no look-ahead.</p>
        </div>
      </div>

      <Card title="1 · Scope and data">
        <ul className="bullets">
          <li>
            Purchase decisions made in January 2026, so delivery days run from{' '}
            <strong>{dateLong(meta.first_delivery_date)}</strong> to{' '}
            <strong>{dateLong(meta.last_delivery_date)}</strong>.
          </li>
          <li>
            <strong>Actual:</strong> Elexon BMRS <code>FUELHH</code>, fuel type <code>WIND</code>: national
            half-hourly outturn, in MW.
          </li>
          <li>
            <strong>Forecast:</strong> Elexon BMRS <code>WINDFOR</code>: hourly national wind forecasts. A new run is
            published every 2–4 hours and reaches 46–66 hours ahead.
          </li>
        </ul>
      </Card>

      <Card title="2 · Which forecast counts">
        <ul className="bullets">
          <li>
            Day-ahead bids for day D are placed on D-1. GB auctions close at 09:20 (EPEX) and 09:50 (N2EX) UK time,
            so the default decision time is <strong>{meta.default_decision_time}</strong>. You can change it in the
            header.
          </li>
          <li>
            For each hour of D, we use the <strong>most recent run published at or before the decision time</strong>{' '}
            that covers that hour.
          </li>
          <li>
            A run also reports values for hours <em>before</em> it was published. Those are back-casts, not
            forecasts, and are never used.
          </li>
          <li>Times are handled in UK local time, so days with a clock change are 23 or 25 hours long.</li>
        </ul>
      </Card>

      <Card title="3 · How we measure error">
        <ul className="bullets">
          <li>
            Error = forecast − actual, matched on each forecast's hourly start time. A positive error means{' '}
            <strong>less wind than forecast</strong>, so the buyer is short.
          </li>
          <li>
            <strong>MAE</strong> is the typical size of a miss. <strong>RMSE</strong> weights large misses more
            heavily. <strong>Bias</strong> shows systematic over- or under-forecasting.{' '}
            <strong>WAPE</strong> is total absolute error as a percentage of actual output.
          </li>
          <li>
            The <strong>planning buffer</strong> is an upper percentile of the error. The 90% buffer is the margin
            that would have covered wind shortfall in 90% of January hours.
          </li>
          <li>
            The <strong>lead-time curve</strong> uses, for every hour, the latest forecast published at least <em>h</em>{' '}
            hours earlier. It stops where WINDFOR no longer covers every hour, so every point is scored on the same
            sample.
          </li>
        </ul>
      </Card>

      <Card title="4 · Adjusted forecast and uncertainty band">
        <ul className="bullets">
          <li>
            For delivery day D, we take the forecast errors of the {meta.calibration_days} days from D-
            {meta.calibration_days + 1} to D-2. Their outturn was fully known when the D-1 decision was made.
          </li>
          <li>
            <strong>Adjusted forecast</strong> = Elexon forecast − the mean of those recent errors (bias correction).
          </li>
          <li>
            <strong>80% band</strong> = forecast − the P90 and P10 of those errors.{' '}
            <strong>Firm wind</strong> is the lower edge of the band: the level actual wind beat 90% of the time.
          </li>
          <li>
            Back-tested on January 2026, this simple correction reduces MAE by about a quarter. The persistent
            over-forecast at high wind levels is consistent with curtailment and high-wind turbine cut-out. That
            explanation needs confirming against constraint data.
          </li>
        </ul>
      </Card>
    </div>
  )
}
