import { useCallback, useEffect, useState } from 'react'
import { accuracyPath, dayPath, prefetch, useApi, type Meta } from './api'
import { Status } from './components/ui'
import AccuracyView from './views/AccuracyView'
import DayView from './views/DayView'
import MethodView from './views/MethodView'

type Tab = 'day' | 'accuracy' | 'method'

interface Route {
  tab: Tab
  date: string | null
  decisionTime: string | null
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'day', label: 'Day-ahead view' },
  { id: 'accuracy', label: 'Forecast accuracy' },
  { id: 'method', label: 'Methodology' },
]

// Decision times offered in the UI: early morning to just past gate closure.
const DECISION_TIMES = Array.from({ length: 15 }, (_, i) => {
  const mins = 5 * 60 + i * 30
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
})

// The URL hash holds the view state so any screen can be bookmarked or shared,
// e.g. #day?date=2026-01-28&t=09:00
function readRoute(): Route {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const tab = (TABS.some((t) => t.id === path) ? path : 'day') as Tab
  return { tab, date: params.get('date'), decisionTime: params.get('t') }
}

function writeRoute(r: Route) {
  const params = new URLSearchParams()
  if (r.date && r.tab === 'day') params.set('date', r.date)
  if (r.decisionTime) params.set('t', r.decisionTime)
  const hash = `#${r.tab}${params.size ? `?${params}` : ''}`
  if (hash !== window.location.hash) window.history.pushState(null, '', hash)
}

export default function App() {
  const meta = useApi<Meta>('/api/meta')
  const [route, setRoute] = useState<Route>(readRoute)

  useEffect(() => {
    const onPop = () => setRoute(readRoute())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((patch: Partial<Route>) => {
    setRoute((r) => {
      const next = { ...r, ...patch }
      writeRoute(next)
      return next
    })
    if (patch.tab) window.scrollTo({ top: 0 })
  }, [])

  const m = meta.data
  const decisionTime = route.decisionTime ?? m?.default_decision_time ?? '09:00'
  const date = route.date ?? m?.last_delivery_date ?? ''

  // Warm the other views in the background so switching tabs is instant.
  useEffect(() => {
    if (!m) return
    const timer = window.setTimeout(() => {
      if (route.tab !== 'day' && date) prefetch(dayPath(date, decisionTime))
      prefetch(accuracyPath(decisionTime))
      prefetch('/api/horizons')
    }, 400)
    return () => window.clearTimeout(timer)
  }, [m, route.tab, date, decisionTime])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="/favicon.svg" alt="" width={30} height={30} />
            <div>
              <div className="brand-name">WindSight</div>
              <div className="brand-tag">Day-ahead wind forecasts for GB power procurement</div>
            </div>
          </div>
          <label className="decision-picker" title="UK time on the day before delivery when you place day-ahead bids">
            <span>Decision time (D-1, UK)</span>
            <select value={decisionTime} onChange={(e) => navigate({ decisionTime: e.target.value })}>
              {DECISION_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t}
                  {t === m?.default_decision_time ? ' · default' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${route.tab === t.id ? 'tab-active' : ''}`}
              onClick={() => navigate({ tab: t.id })}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="content">
        <Status loading={meta.loading && !m} error={meta.error} />
        {m && route.tab === 'day' && (
          <DayView meta={m} date={date} decisionTime={decisionTime} onDateChange={(d) => navigate({ date: d })} />
        )}
        {m && route.tab === 'accuracy' && (
          <AccuracyView decisionTime={decisionTime} onOpenDay={(d) => navigate({ tab: 'day', date: d })} />
        )}
        {m && route.tab === 'method' && <MethodView meta={m} />}
      </main>

      <footer className="footer">
        Data: {m?.sources.join(' · ') ?? 'Elexon BMRS'} · snapshot taken{' '}
        {m ? new Date(m.data_fetched_at).toLocaleDateString('en-GB') : '…'} · Scope: purchase decisions made in
        January 2026
      </footer>
    </div>
  )
}
