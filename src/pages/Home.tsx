import { useEffect, useMemo, useState } from 'react'
import { NightMap, useMapState } from '../components/NightMap'
import { Gazette } from '../components/Gazette'
import { LiveWire } from '../components/LiveWire'
import { Rewind } from '../components/Rewind'
import { loadGeo, type Geo } from '../lib/geo'
import { useNow, useRegister } from '../lib/store'
import { Link, go } from '../lib/router'
import { days, fmtDate } from '../lib/fmt'
import type { Order, Record_ } from '../lib/arkiv'

export function Home() {
  const live = useRegister('live')
  const [geo, setGeo] = useState<Geo | null>(null)
  useEffect(() => void loadGeo().then(setGeo), [])
  const now = useNow(5000)
  // history replay: which archived orders were in force on a given day
  const [at, setAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const span = useMemo(() => {
    const ss = live.records.map((r) => r.starts).filter(Boolean)
    return ss.length ? [Math.min(...ss) * 1000 - 7 * 86_400_000, Date.now()] as const : null
  }, [live.records])
  useEffect(() => {
    if (!playing || !span) return
    const id = window.setInterval(() => setAt((a) => {
      const n = (a ?? span[0]) + 3 * 86_400_000
      if (n >= span[1]) { setPlaying(false); return null }
      return n
    }, ), 60)
    return () => clearInterval(id)
  }, [playing, span])
  const inForceAt = useMemo(() => {
    if (at === null) return []
    const t = at / 1000
    return live.records.filter((r) => r.starts <= t && (r.ends ? t < r.ends : t < r.starts + 86400)) as unknown as Order[]
  }, [at, live.records])
  const map = useMapState(geo, at === null ? live.orders : inForceAt, at === null ? live.reports : [])
  const down = live.reports.filter((r) => r.status !== 'back')
  const archive = useMemo(() => [...live.records].sort((a, b) => b.starts - a.starts), [live.records])
  const totals = useMemo(() => tally(archive), [archive])

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <span className="chip sodium" style={{ justifySelf: 'start' }}>Register of telecom suspension orders · India</span>
            <h1 className="h1">The record of a shutdown can’t be switched off.</h1>
            <p className="lede">
              Every Indian internet shutdown order, filed on Arkiv the way the law says it works: it lives until it lapses, nobody can quietly edit it,
              and anyone can keep the record alive. When the lights go out without a published order, people on the ground can say so, and their
              neighbours can confirm it.
            </p>
            <div className="stats" role="group" aria-label="Right now">
              <div className="stat"><b>{live.loading ? '…' : live.orders.length}</b><span>orders in force now</span></div>
              <div className="stat"><b>{live.loading ? '…' : map.off.size}</b><span>districts switched off</span></div>
              <div className="stat"><b>{live.loading ? '…' : down.length}</b><span>live reports of no internet</span></div>
            </div>
            <div className="row">
              <Link to="/report" className="btn primary">Is your internet off? Report it</Link>
              <Link to="/register" className="btn">Open the register</Link>
            </div>
            {live.error && <p className="hint" style={{ color: 'var(--vermilion)' }}>Arkiv didn’t answer just now ({live.error.slice(0, 80)}). The map will retry on its own.</p>}
            {!live.loading && !live.error && live.orders.length === 0 && (
              <p className="hint">No order in force is on the register right now. Every lapsed order stays in the archive below, and the <Link to="/drill">drill</Link> shows the register working at one legal day per minute.</p>
            )}
          </div>
          <div className="hero-map">
            <NightMap state={map} onPick={(i) => geo && go(`/register?state=${geo.districts[i].code}`)} label={at ? `Map of India on ${fmtDate(at)}: ${map.off.size} districts under a suspension order on file.` : undefined} />
            {span && (
              <div className="panel" style={{ marginTop: 12, padding: 14, display: 'grid', gap: 8 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="num" style={{ fontWeight: 600 }}>{at ? fmtDate(at) : 'Now'} <span className="mute" style={{ fontWeight: 400 }}>· {at ? `${inForceAt.length} order${inForceAt.length === 1 ? '' : 's'} in force, ${map.off.size} districts dark` : `${live.orders.length} orders in force`}</span></span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn small primary" onClick={() => { if (!playing && (at === null || at >= span[1] - 86_400_000)) setAt(span[0]); setPlaying(!playing) }}>{playing ? 'Pause' : 'Play the history'}</button>
                    {at !== null && <button className="btn small" onClick={() => { setPlaying(false); setAt(null) }}>Back to now</button>}
                  </span>
                </div>
                <input type="range" aria-label="Day to show" min={span[0]} max={span[1]} step={86_400_000} value={at ?? span[1]} onChange={(e) => { setPlaying(false); const v = +e.target.value; setAt(v >= span[1] - 86_400_000 ? null : v) }} />
                <span className="hint">Every order on the register, replayed from its stated start to its stated end. Orders without a published end date show for their first day only.</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div className="section-head">
            <span className="chip">Live wire</span>
            <h2 className="h2">Every change, as Arkiv writes it.</h2>
            <p className="lede">This feed listens to Arkiv’s entity events over a WebSocket. A new order, a report, a neighbour confirming a report, someone paying to keep a record alive: it shows up here within a block (two seconds), for everyone, from the chain itself, not from our server.</p>
            <div className="row"><Link to="/report" className="btn small">File a report</Link><Link to="/drill" className="btn small">Start a drill to watch it move</Link></div>
          </div>
          <LiveWire />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">How the register works</span>
            <h2 className="h2">The law’s clock is the database’s clock.</h2>
            <p className="lede">India’s Telecommunications (Temporary Suspension of Services) Rules, 2024 put deadlines on every shutdown. Switched Off doesn’t enforce those deadlines with a cron job on someone’s server. Each one is how long the Arkiv entity is allowed to exist.</p>
          </div>
          <div className="grid3">
            <Rule n="15" unit="days, at most" title="An order can’t run longer than fifteen days." body="Each order is filed with its Arkiv expiry set to the day it lapses. When that block comes, the order entity is gone, its districts light up again, and nothing anyone does can stretch it: a longer shutdown needs a new order, so every renewal shows." />
            <Rule n="24" unit="hours" title="An emergency order dies in a day unless confirmed." body="When an officer issues an order in an emergency, it is filed to expire 24 hours later. Confirming it is extending it, and only the filer’s key can: until then the gazette says EMERGENCY and the clock is running." />
            <Rule n="0" unit="edits" title="Orders and reports are read-only once filed." body="Every order and every citizen report is created with Arkiv’s readonly flag. Not the filer, not this site, not anyone can change the text. A correction is a new, linked entity, so the history of the correction shows too." />
          </div>
          <div className="grid2" style={{ marginTop: 20 }}>
            <Rule n="6" unit="hours" title="A report fades unless a neighbour confirms it." body="“No mobile data in Imphal West” lives six hours. Reports are created with permissionless extension: anyone who sees the same thing can push the expiry out again with one tap, without being able to touch what it says. A rumour fades; a real blackout stays lit red." />
            <Rule n="∞" unit="as long as someone cares" title="The archive lives as long as anyone pays for it." body="Every order is written together with a permanent record in one batch. The record is readonly and anyone can extend it: a library, a newsroom or a law school can keep India’s shutdown history alive without asking us, and without being able to rewrite it." />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">The register</span>
            <h2 className="h2">{archive.length ? `${archive.length} orders on file, ${totals.days.toLocaleString('en-IN')} days of suspended internet.` : 'The register'}</h2>
            <p className="lede">Each one transcribed from a published order or from reporting that cites one, with its sources. Click a state on the map, or open the full register to filter.</p>
          </div>
          {live.loading ? (
            <div className="grid3">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 300 }} />)}</div>
          ) : archive.length ? (
            <div className="grid3">{archive.slice(0, 6).map((r) => <Gazette key={r.key} o={r} compact />)}</div>
          ) : (
            <div className="empty">The archive is being written to Arkiv. <Link to="/drill">Try the drill</Link> meanwhile.</div>
          )}
          <div className="row" style={{ marginTop: 20 }}><Link to="/register" className="btn">See all {archive.length || ''} orders</Link></div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">Rewind</span>
            <h2 className="h2">Where the lights went out, year by year.</h2>
            <p className="lede">Days of suspended internet per state, from the archive. Because Arkiv keeps queryable history, the register can also be asked what was in force at any past block, after the orders themselves have lapsed.</p>
          </div>
          <Rewind records={archive} />
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div className="section-head">
            <span className="chip red">Dark without an order</span>
            <h2 className="h2">The shutdowns nobody published.</h2>
            <p className="lede">The Supreme Court held in <i>Anuradha Bhasin v. Union of India</i> (2020) that suspension orders must be published. When people report no internet in a district and no order is on the register, that district burns red on the map. Each red light is a question the state should answer.</p>
          </div>
          <div className="list">
            {[...map.flagged.entries()].slice(0, 6).map(([di, rs]) => (
              <Link key={di} to={`/report?d=${geo?.districts[di].id ?? ''}`} className="item">
                <span><b>{geo?.districts[di].name}</b>, {geo?.districts[di].state}<br /><span className="hint">{rs.length} live report{rs.length > 1 ? 's' : ''} · {rs.map((r) => r.carrier).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span></span>
                <span className="chip red">no order</span>
              </Link>
            ))}
            {map.flagged.size === 0 && <div className="empty">No district is reported dark without an order right now. If yours is, <Link to="/report">say so</Link>: it takes one tap and no sign-up.</div>}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="chip">Why it can’t be switched off</span>
            <h2 className="h2">Block this site and the register is still there.</h2>
            <p className="lede">A shutdown tracker on one server is one blocking order away from disappearing. Switched Off keeps nothing on our server: the register is Arkiv entities that any copy of this page, any script, any newsroom can read straight from the network.</p>
          </div>
          <div className="grid3">
            <Card title="Ask the network directly" body="One JSON-RPC call returns every order in force. No API key, no account, no Switched Off server in the middle." to="/data" cta="See the exact query" />
            <Card title="Open a mirror" body="A one-file copy of the register that reads Arkiv from your browser. Save it, host it anywhere, email it: it keeps working." to="/data#mirrors" cta="Get the mirror" />
            <Card title="Keep the history alive" body="Every record can be extended by anyone. Pay a few testnet cents and a lapsed order’s record outlives this site." to="/register" cta="Pick a record" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'center' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <h2 className="h2">India led the world in internet shutdowns six years running. Parliament asked for a register in 2021. Nobody built one.</h2>
            <p className="lede">The people it happens to are the last to be able to say so, and the government told Parliament it doesn’t count them. <Link to="/why">Read why this register exists</Link>, and what we deliberately keep off-chain to protect the people who use it.</p>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Link to="/report" className="btn primary">Report no internet</Link>
            <Link to="/drill" className="btn">Run a drill</Link>
          </div>
        </div>
      </section>
      <span hidden>{now}</span>
    </>
  )
}

function tally(rs: Record_[]) {
  let d = 0
  for (const r of rs) d += days(r.starts * 1000, r.ends * 1000)
  return { days: d, since: rs.length ? fmtDate(Math.min(...rs.map((r) => r.starts * 1000))) : '' }
}

function Rule({ n, unit, title, body }: { n: string; unit: string; title: string; body: string }) {
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <div><span className="serif" style={{ fontSize: 56, lineHeight: 1, color: 'var(--sodium)' }}>{n}</span> <span className="mute">{unit}</span></div>
      <h3 className="h3">{title}</h3>
      <p className="mute" style={{ margin: 0 }}>{body}</p>
    </div>
  )
}

function Card({ title, body, to, cta }: { title: string; body: string; to: string; cta: string }) {
  return (
    <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      <h3 className="h3">{title}</h3>
      <p className="mute" style={{ margin: 0 }}>{body}</p>
      <Link to={to} className="btn small" style={{ justifySelf: 'start', marginTop: 6 }}>{cta}</Link>
    </div>
  )
}
