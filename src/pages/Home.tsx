import { useEffect, useMemo, useRef, useState } from 'react'
import { NightMap, useMapState } from '../components/NightMap'
import { Gazette } from '../components/Gazette'
import { LiveWire } from '../components/LiveWire'
import { Rewind } from '../components/Rewind'
import { loadGeo, type Geo } from '../lib/geo'
import { useDrillOrders, useNow, useRegister } from '../lib/store'
import { Link, go } from '../lib/router'
import { tf, tp, tx, useT } from '../lib/i18n'
import { fmtDate } from '../lib/fmt'
import type { Order, Record_ } from '../lib/arkiv'

export function Home() {
  const live = useRegister('live')
  const t = useT()
  const [geo, setGeo] = useState<Geo | null>(null)
  useEffect(() => void loadGeo().then(setGeo), [])
  const now = useNow(5000)
  // drill orders in force: shown on the map in their own style, never counted as the register's
  const drill = useDrillOrders()
  // history replay: which archived orders were in force on a given day
  const [at, setAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  // with nothing in force, the map is never a still, all-lit picture: it replays the history on every
  // visit (`auto`), then settles on the last twelve months (`recent`) and plays again after a pause
  const [auto, setAuto] = useState(false)
  const [recent, setRecent] = useState(false)
  // the reader stopped it (scroll, tap, the slider, "Back to now"): leave the map where they put it
  const [stopped, setStopped] = useState(false)
  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const span = useMemo(() => {
    const ss = live.records.map((r) => r.starts).filter(Boolean)
    return ss.length ? [Math.min(...ss) * 1000 - 7 * 86_400_000, Date.now()] as const : null
  }, [live.records])
  // every moment the map changes: an order starting or ending. Playback steps through these, so a
  // one-day order holds the screen as long as a fortnight does, instead of flashing past
  const stops = useMemo(() => {
    const ts = new Set<number>()
    for (const r of live.records) {
      if (!r.starts) continue
      ts.add(r.starts * 1000 + 1000)
      const end = r.ends ? r.ends * 1000 : r.starts * 1000 + 15 * 86_400_000
      ts.add(end + 1000)
    }
    return [...ts].sort((a, b) => a - b).filter((x) => x < Date.now())
  }, [live.records])
  // nothing in force: no live order (or none known yet while Arkiv answers) and no drill running
  const idle = (live.loading || live.orders.length === 0) && drill.length === 0
  const idleRef = useRef(idle)
  idleRef.current = idle
  const atRef = useRef(at)
  atRef.current = at
  useEffect(() => {
    if (!playing || !span || !stops.length) return
    const id = window.setInterval(() => {
      const i = stops.findIndex((x) => x > (atRef.current ?? -Infinity))
      if (i >= 0) return setAt(stops[i])
      // the end of the record: settle on the last twelve months while nothing is in force
      setPlaying(false)
      setAt(null)
      setRecent(idleRef.current)
    }, Math.max(70, Math.min(320, Math.round(15_000 / Math.max(1, stops.length)))))
    return () => clearInterval(id)
  }, [playing, span, stops])
  // a person who scrolls or taps while the map is moving wants it to hold still: it stays on the
  // last twelve months (the replay controls themselves don't count)
  useEffect(() => {
    if (!playing && !auto) return
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-replay]')) return
      setPlaying(false)
      setAt(null)
      setAuto(false)
      setStopped(true)
      setRecent(idleRef.current)
    }
    const opts = { passive: true } as AddEventListenerOptions
    window.addEventListener('wheel', stop, opts)
    window.addEventListener('touchmove', stop, opts)
    window.addEventListener('pointerdown', stop, opts)
    return () => {
      window.removeEventListener('wheel', stop)
      window.removeEventListener('touchmove', stop)
      window.removeEventListener('pointerdown', stop)
    }
  }, [playing, auto])
  // with nothing in force, play the history on every visit, as soon as the archive is on screen (the
  // bundled copy paints within a second); with reduced motion, show the last twelve months, still
  useEffect(() => {
    if (stopped || !idle || at !== null || playing || recent || !stops.length) return
    setAuto(true)
    if (reduced) return setRecent(true)
    setAt(stops[0])
    setPlaying(true)
  }, [stopped, idle, at, playing, recent, stops, reduced])
  // after the last twelve months have been on screen a while, play it all again
  useEffect(() => {
    if (!recent || !auto || reduced) return
    const id = window.setTimeout(() => {
      setRecent(false)
      setAt(stops[0] ?? null)
      setPlaying(stops.length > 0)
    }, 9000)
    return () => clearTimeout(id)
  }, [recent, auto, reduced, stops])
  // an order comes into force, or a drill starts: the map shows now
  useEffect(() => {
    if (idle || (!auto && !recent)) return
    setAuto(false)
    setRecent(false)
    if (auto) {
      setPlaying(false)
      setAt(null)
    }
  }, [idle, auto, recent])
  // an order with no published end is shown until the next order on file for its state, at most
  // fifteen days (the per-order cap since November 2020); the note under the map says so
  const spans = useMemo(() => {
    return live.records.filter((r) => r.starts).map((r) => {
      if (r.ends) return { r, end: r.ends }
      const next = live.records.filter((x) => x.state === r.state && x.starts > r.starts).reduce((m, x) => Math.min(m, x.starts), Infinity)
      return { r, end: Math.min(next, r.starts + 15 * 86400) }
    })
  }, [live.records])
  const inForceAt = useMemo(() => {
    if (at === null) return []
    const t = at / 1000
    return spans.filter(({ r, end }) => r.starts <= t && t < end).map(({ r }) => r) as unknown as Order[]
  }, [at, spans])
  // the last twelve months: every order on file that was in force at any moment of them
  const lastYear = useMemo(() => {
    const from = Date.now() / 1000 - 365 * 86400
    return spans.filter(({ r, end }) => r.official && end > from && r.starts <= Date.now() / 1000).map(({ r }) => r) as unknown as Order[]
  }, [spans])
  // live reports stay on the map during a replay: they are about now, whatever year the orders show
  const map = useMapState(geo, at !== null ? inForceAt : recent ? lastYear : live.orders, live.reports, at === null && !recent ? drill : undefined)
  const drillStates = [...new Set(drill.map((o) => t(o.stateName)))].join(', ')
  // the headline numbers always describe right now, whatever date the map is replaying
  const nowMap = useMapState(geo, live.orders, live.reports)
  const down = live.reports.filter((r) => r.status !== 'back')
  // the headline archive is the registrar's sourced transcriptions; community filings show in the register, labelled
  const archive = useMemo(() => live.records.filter((r) => r.official && r.starts <= Date.now() / 1000 + 86_400).sort((a, b) => b.starts - a.starts), [live.records])
  const totals = useMemo(() => tally(archive), [archive])
  const latest = archive[0]
  // with nothing in force, the headline is the record itself: every district any order on file has switched off
  const everMap = useMapState(geo, archive as unknown as Order[], [])
  const renewals = useMemo(() => archive.filter((r) => r.renews).length, [archive])
  const quiet = !live.loading && live.orders.length === 0

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="chip sodium" style={{ justifySelf: 'start' }}>{t('Register of telecom suspension orders · India')}</span>
            <h1 className="h1">{t('The record of a shutdown can’t be switched off.')}</h1>
            <p className="lede">
              {t('India’s internet shutdown orders, filed on Arkiv the way the law says they work: each lives until it lapses, nobody can quietly edit or delete the record, and anyone can keep it alive. When the lights go out without a published order, people on the ground can say so, and their neighbours can confirm it.')}
            </p>
            {quiet && archive.length ? (
              <div className="stats" role="group" aria-label={t('On the register')}>
                <div className="stat"><b>{archive.length}</b><span>{t('orders on file')}</span></div>
                <div className="stat"><b>{geo ? everMap.off.size : '…'}</b><span>{t('districts switched off at least once')}</span></div>
                <div className="stat"><b>{renewals}</b><span>{t('renewals on file')}</span></div>
              </div>
            ) : (
              <div className="stats" role="group" aria-label={t('Right now')}>
                <div className="stat"><b>{live.loading ? '…' : live.orders.length}</b><span>{t('orders in force now')}</span></div>
                <div className="stat"><b>{live.loading ? '…' : nowMap.off.size}</b><span>{t('districts switched off')}</span></div>
                <div className="stat"><b>{live.loading ? '…' : down.length}</b><span>{t('live reports of no internet')}</span></div>
              </div>
            )}
            <div className="row">
              <Link to="/report" className="btn primary">{t('Is your internet off? Report it')}</Link>
              <Link to="/register" className="btn">{t('Open the register')}</Link>
            </div>
            {live.error && <p className="hint" style={{ color: 'var(--vermilion)' }}>{tf('Arkiv didn’t answer just now ({error}). The map will retry on its own.', { error: live.error.slice(0, 120) })}</p>}
            {!live.error && quiet && latest && (
              <Link to={`/e/${latest.key}`} className="item" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <span><span className="hint">{tf('Right now: no order on the register is in force, {n}. Latest on file:', { n: tp(down.length, '{n} live report of no internet', '{n} live reports of no internet') })}</span><br /><b>{t(latest.stateName)}</b> · {latest.districts.slice(0, 2).join(', ')}{latest.districts.length > 2 ? '…' : ''} · {fmtDate(latest.starts * 1000)}{latest.ends ? ` → ${fmtDate(latest.ends * 1000)}` : ''}</span>
                <span className="chip">{t('lapsed')}</span>
              </Link>
            )}
            {live.snapshotBlock !== undefined && <p className="hint">{tf('The archive above is a copy read from Arkiv at block {n}; checking Arkiv live now.', { n: live.snapshotBlock.toString() })}</p>}
          </div>
          <div className="hero-map">
            <div style={{ position: 'relative' }}>
              {at !== null ? (
                <div className="map-caption num" aria-hidden="true"><b className="cap-kicker">{t('History, not now')}</b>{tf('Replaying the register: {date}', { date: fmtDate(at) })}<br /><span className="mute">{playing ? t('Scroll or tap to stop') : ''}</span></div>
              ) : recent ? (
                <div className="map-caption" aria-hidden="true"><b className="cap-kicker">{t('History, not now')}</b>{tp(map.off.size, '{n} district switched off at some point in the last 12 months', '{n} districts switched off at some point in the last 12 months')}<br /><span className="mute">{live.loading ? t('Checking what is in force now…') : t('No order is in force today.')}{auto && !reduced ? ` ${t('Scroll or tap to stop')}` : ''}</span></div>
              ) : drill.length > 0 ? (
                <div className="map-caption drill" style={{ pointerEvents: 'auto' }}><b className="cap-kicker">{t('DRILL')}</b>{tf('A drill order is running in {states}: a sandbox, not a real shutdown, and not counted below.', { states: drillStates })}<br /><Link to="/drill">{t('Watch it on the drill page')}</Link></div>
              ) : null}
              <NightMap state={map} offLabel={at !== null || recent ? t('Switched off by an order on file (history)') : undefined} onPick={(i) => geo && go(`/register?state=${geo.districts[i].code}`)} label={at ? tf('Map of India on {date}: {n} districts under a suspension order on file.', { date: fmtDate(at), n: map.off.size }) : recent ? tp(map.off.size, 'Map of India, history not now: {n} district switched off at some point in the last 12 months.', 'Map of India, history not now: {n} districts switched off at some point in the last 12 months.') : undefined} />
            </div>
            <div className="mobile-only" style={{ marginTop: 12 }}><Link to="/report" className="btn primary" style={{ width: '100%' }}>{t('Is your internet off? Report it')}</Link></div>
            {span && (
              <div className="panel" data-replay style={{ marginTop: 12, padding: 14, display: 'grid', gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="num" style={{ fontWeight: 600 }}>{at ? fmtDate(at) : recent ? t('Last 12 months') : t('Now')} <span className="mute" style={{ fontWeight: 400 }}>· {at ? `${tp(inForceAt.length, '{n} order in force', '{n} orders in force')}, ${tp(map.off.size, '{n} district dark', '{n} districts dark')}` : recent ? `${tp(lastYear.length, '{n} order on file', '{n} orders on file')}, ${tp(map.off.size, '{n} district dark at some point', '{n} districts dark at some point')}` : tp(live.orders.length, '{n} order in force', '{n} orders in force')}{at === null && !recent && drill.length > 0 ? ` · ${tp(drill.length, '{n} drill order, not counted', '{n} drill orders, not counted')}` : ''}</span></span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn small primary" onClick={() => { setAuto(false); setRecent(false); if (!playing && (at === null || at >= span[1] - 86_400_000)) setAt(span[0]); setPlaying(!playing) }}>{playing ? t('Pause') : t('Play the history')}</button>
                    {(at !== null || recent) && <button className="btn small" onClick={() => { setPlaying(false); setAt(null); setAuto(false); setRecent(false); setStopped(true) }}>{t('Back to now')}</button>}
                  </span>
                </div>
                <input type="range" aria-label={t('Day to show')} aria-valuetext={at ? fmtDate(at) : t('today')} min={span[0]} max={span[1]} step={86_400_000} value={at ?? span[1]} onChange={(e) => { setPlaying(false); setAuto(false); setRecent(false); setStopped(true); const v = +e.target.value; setAt(v >= span[1] - 86_400_000 ? null : v) }} />
                <span className="hint">{t('Every order on the register, replayed from its stated start to its stated end. Orders without a published end date are shown until the next order on file for that state, at most fifteen days.')}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div className="section-head">
            <span className="chip">{t('Live wire')}</span>
            <h2 className="h2">{t('Every change, as Arkiv writes it.')}</h2>
            <p className="lede">{t('This feed follows Arkiv’s entity events: a new order, a report, a neighbour confirming a report, someone paying to keep a record alive. Each shows up here within seconds of its block, for everyone, over Arkiv’s WebSocket (a node-side filter polled through the relay if the socket can’t open).')}</p>
            <div className="row"><Link to="/report" className="btn small">{t('File a report')}</Link><Link to="/drill" className="btn small">{t('Start a drill to watch it move')}</Link></div>
          </div>
          <LiveWire />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">{t('How the register works')}</span>
            <h2 className="h2">{t('The law’s clock is the database’s clock.')}</h2>
            <p className="lede">{t('India’s Telecommunications (Temporary Suspension of Services) Rules, 2024 put deadlines on every shutdown. Switched Off doesn’t enforce those deadlines with a cron job on someone’s server. Each one is how long the Arkiv entity is allowed to exist.')}</p>
          </div>
          <div className="grid3">
            <Rule n="15" unit="days, at most" title="An order can’t run longer than fifteen days." body="Each order is filed with its Arkiv expiry set to the day it lapses. When that block comes, the order entity is gone, its districts light up again, and nothing anyone does can stretch it: a longer shutdown needs a new order, so every renewal shows." />
            <Rule n="24" unit="hours" title="An emergency order dies in a day unless confirmed." body="When an officer issues an order in an emergency, it is filed to expire 24 hours later. Confirming it is extending it, and only the filer’s key can: until then the gazette says EMERGENCY and the clock is running." />
            <Rule n="0" unit="edits, 0 deletions" title="Records are readonly, then sealed." body="Every order and report is created with Arkiv’s readonly flag, so its text can never change. The archive record is then handed to an address nobody holds a key for, so nobody can delete it either, not even the registrar. A mistake gets a correction: a new entity that names the one it corrects, both kept." />
          </div>
          <div className="grid2" style={{ marginTop: 20 }}>
            <Rule n="6" unit="hours" title="A report fades unless a neighbour confirms it." body="“No mobile data in Imphal West” lives six hours. Reports are created with permissionless extension: anyone who sees the same thing can push the expiry out again with one tap, without being able to touch what it says. A rumour fades; a real blackout stays lit red." />
            <Rule n="∞" unit="as long as someone cares" title="The archive lives as long as anyone pays for it." body="An order filed here is written together with its permanent record, and both are sealed, in one transaction. The record is readonly and anyone can extend it: a library, a newsroom or a law school can keep India’s shutdown history alive without asking us, and without being able to rewrite it." />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">{t('The register')}</span>
            <h2 className="h2">{archive.length ? tf('{n} orders on file, from {states} states and territories, {from} to {to}.', { n: archive.length, states: totals.states, from: totals.from, to: totals.to }) : t('The register')}</h2>
            <p className="lede">{t('Each one transcribed from a published order or from reporting that cites one, with its sources. Click a state on the map, or open the full register to filter.')}</p>
          </div>
          {live.loading ? (
            <div className="grid3">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 300 }} />)}</div>
          ) : archive.length ? (
            <div className="grid3">{archive.slice(0, 6).map((r) => <Gazette key={r.key} o={r} compact />)}</div>
          ) : (
            <div className="empty">{tx('The archive is being written to Arkiv. {link} meanwhile.', { link: <Link to="/drill">{t('Try the drill')}</Link> })}</div>
          )}
          <div className="row" style={{ marginTop: 20 }}><Link to="/register" className="btn">{tf('See all {n} orders', { n: archive.length || '' })}</Link></div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">{t('Year by year')}</span>
            <h2 className="h2">{t('Where the lights went out.')}</h2>
            <p className="lede">{t('Orders on file per state and year. It undercounts the real thing: many orders were never published, and Access Now counted 116 shutdowns in India in 2023 alone. Every order that does get filed can also be asked about at any past Arkiv block, long after it has lapsed.')}</p>
          </div>
          <Rewind records={archive} />
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div className="section-head">
            <span className="chip red">{t('Dark without an order')}</span>
            <h2 className="h2">{t('The shutdowns nobody published.')}</h2>
            <p className="lede">{tx('The Supreme Court held in {case} (2020) that suspension orders must be published. When people report no internet in a district and no order is on the register, that district burns red on the map. Each red light is a question the state should answer.', { case: <i>Anuradha Bhasin v. Union of India</i> })}</p>
          </div>
          <div className="list">
            {[...nowMap.flagged.entries()].slice(0, 6).map(([di, rs]) => (
              <Link key={di} to={`/report?d=${geo?.districts[di].id ?? ''}`} className="item">
                <span><b>{geo?.districts[di].name}</b>, {geo?.districts[di].state}<br /><span className="hint">{tp(rs.length, '{n} live report', '{n} live reports')} · {rs.map((r) => t(r.carrier)).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span></span>
                <span className="chip red">{t('no order')}</span>
              </Link>
            ))}
            {nowMap.flagged.size === 0 && <div className="empty">{tx('No district is reported dark without an order right now. If yours is, {link}: it takes one tap and no sign-up.', { link: <Link to="/report">{t('say so')}</Link> })}</div>}
            <p className="hint" style={{ margin: '4px 0 0' }}>{t('Open a district to confirm what people see there, and to draft a Right to Information request that asks the state for the order: written in your browser, in English or Hindi, sent by nobody but you.')}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">{t('Why it can’t be switched off')}</span>
            <h2 className="h2">{t('Block this site and the register is still there.')}</h2>
            <p className="lede">{t('A shutdown tracker on one server is one blocking order away from disappearing. The register isn’t on our server: it is Arkiv entities that any copy of this page, any script, any newsroom can read straight from the network. This site only runs a small cache in front of Arkiv to stay inside its query quota, and the switch in the header turns even that off.')}</p>
          </div>
          <div className="grid3">
            <Card title="Ask the network directly" body="One JSON-RPC call returns every order in force. No account and no Switched Off server in the middle (Arkiv meters keyless reads, so heavy users want their own free key)." to="/data" cta="See the exact query" />
            <Card title="Open a mirror" body="A one-file copy of the register that reads Arkiv from your browser. Save it, host it anywhere, email it: it keeps working." to="/data#mirrors" cta="Get the mirror" />
            <Card title="Keep the history alive" body="Every record is sealed: owned by an address nobody holds, so nobody can delete it, us included. Anyone can extend it, so a lapsed order’s record can outlive this site." to="/register" cta="Pick a record" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'center' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2 className="h2">{t('India led the world in internet shutdowns six years running. Parliament asked for a register in 2021. There still isn’t an official one.')}</h2>
            <p className="lede">{tx('The people it happens to are the last to be able to say so, and the government told Parliament it doesn’t count them. {link}, and what we deliberately keep off-chain to protect the people who use it.', { link: <Link to="/why">{t('Read why this register exists')}</Link> })}</p>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link to="/report" className="btn primary">{t('Report no internet')}</Link>
            <Link to="/drill" className="btn">{t('Run a drill')}</Link>
          </div>
        </div>
      </section>
      <span hidden>{now}</span>
    </>
  )
}

function tally(rs: Record_[]) {
  const years = rs.map((r) => r.starts).filter(Boolean).map((s) => new Date(s * 1000).getUTCFullYear())
  return { states: new Set(rs.map((r) => r.state)).size, from: years.length ? Math.min(...years) : '', to: years.length ? Math.max(...years) : '' }
}

// the props are English; each is translated as it renders
function Rule({ n, unit, title, body }: { n: string; unit: string; title: string; body: string }) {
  const t = useT()
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <div><span className="serif" style={{ fontSize: 56, lineHeight: 1, color: 'var(--sodium)' }}>{n}</span> <span className="mute">{t(unit)}</span></div>
      <h3 className="h3">{t(title)}</h3>
      <p className="mute" style={{ margin: 0 }}>{t(body)}</p>
    </div>
  )
}

function Card({ title, body, to, cta }: { title: string; body: string; to: string; cta: string }) {
  const t = useT()
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <h3 className="h3">{t(title)}</h3>
      <p className="mute" style={{ margin: 0 }}>{t(body)}</p>
      <Link to={to} className="btn small" style={{ justifySelf: 'start', marginTop: 6 }}>{t(cta)}</Link>
    </div>
  )
}
