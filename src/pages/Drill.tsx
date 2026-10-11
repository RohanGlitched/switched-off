// The drill: the same register, the same entity types, the same rules, at one legal day per
// minute, so a visitor can watch an order lapse, an emergency order die unconfirmed, a report fade.
import { useEffect, useMemo, useState } from 'react'
import { NightMap, useMapState } from '../components/NightMap'
import { Gazette } from '../components/Gazette'
import { LiveWire } from '../components/LiveWire'
import { toast } from '../components/Toast'
import { districtsOf, loadGeo, STATES, type Geo } from '../lib/geo'
import { activeOrders, currentBlock, liveReports, blockToTime, type Order, type Report } from '../lib/arkiv'
import { DRILL_DAY_MS, fileOrder, fileReport, confirmEmergency } from '../lib/write'
import { refresh, useNow, useRegister } from '../lib/store'
import { account } from '../lib/wallet'
import { fmtTime, scopeLabel, short, txUrl } from '../lib/fmt'
import { Link } from '../lib/router'
import { humanError } from './Entity'

export function DrillPage() {
  const drill = useRegister('drill')
  const [geo, setGeo] = useState<Geo | null>(null)
  useEffect(() => void loadGeo().then(setGeo), [])
  const [state, setState] = useState('MN')
  const [picked, setPicked] = useState<string[]>([])
  const [scope, setScope] = useState('mobile-data')
  const [daysN, setDaysN] = useState(5)
  const [emergency, setEmergency] = useState(false)
  const [busy, setBusy] = useState('')
  const [lastTx, setLastTx] = useState<string | null>(null)
  const [rewind, setRewind] = useState(0) // minutes back
  const [past, setPast] = useState<{ orders: Order[]; reports: Report[] } | null>(null)
  useNow()

  useEffect(() => {
    if (!rewind) return setPast(null)
    const block = currentBlock() - BigInt(Math.round((rewind * 60) / 2))
    let alive = true
    Promise.all([activeOrders('drill', block), liveReports('drill', block)]).then(([o, r]) => alive && setPast({ orders: o, reports: r }), () => alive && setPast({ orders: [], reports: [] }))
    return () => { alive = false }
  }, [rewind])

  const shown = past ?? { orders: drill.orders, reports: drill.reports }
  const map = useMapState(geo, shown.orders, shown.reports)
  const districts = useMemo(() => (geo ? districtsOf(geo, state) : []), [geo, state])
  const mine = drill.orders.filter((o) => o.creator.toLowerCase() === account.address.toLowerCase())

  const run = async (label: string, fn: () => Promise<{ txHash: string } | string>, ok: string) => {
    setBusy(label)
    try {
      const r = await fn()
      setLastTx(typeof r === 'string' ? r : r.txHash)
      toast(ok)
      await refresh('drill')
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy('')
    }
  }

  const issue = (renews?: Order) => {
    const now = Date.now()
    const ds = renews ? renews.districts : picked.length ? picked : ['Statewide']
    const st = renews?.state ?? state
    return run('issue', () => fileOrder({
      net: 'drill',
      orderId: `drill-${st}-${now.toString(36)}`,
      state: st,
      stateName: STATES[st] ?? st,
      districts: ds,
      scope: (renews?.scope ?? scope) as Order['scope'],
      issued: now,
      starts: now,
      ends: now + (renews ? 15 : daysN) * DRILL_DAY_MS,
      emergency: renews ? false : emergency,
      basis: 'Telecommunications (Temporary Suspension of Services) Rules, 2024 (drill)',
      authority: `Home Department, Government of ${STATES[st] ?? st} (drill)`,
      reason: renews ? 'Renewed: the situation is stated to continue.' : 'Drill: to prevent the spread of rumours during unrest.',
      renews: renews?.orderId ?? null,
      seq: renews ? renews.seq + 1 : 1,
      published: true,
      sources: [],
    }), renews ? 'Renewal filed: a new order, linked to the last. The old one still lapses on time.' : emergency ? 'Emergency order filed. It dies in one drill day unless you confirm it.' : 'Order filed. Watch its districts go dark.')
  }

  return (
    <>
      <section className="wrap" style={{ padding: '40px var(--gutter) 10px' }}>
        <div className="section-head">
          <span className="chip sodium">Drill · one legal day = one real minute</span>
          <h1 className="h2">Run the register at the speed of a demo.</h1>
          <p className="lede">Everything here is real Arkiv entities on Tiramisu, tagged <code>net = drill</code> and kept apart from the live register. Issue an order and its districts go dark; it lapses on its own when its last drill day ends. Make it an emergency order and it dies in one drill day unless you confirm it. Nothing to install: this browser has its own testnet key.</p>
        </div>
      </section>
      <section className="wrap hero-grid" style={{ alignItems: 'start', paddingBottom: 40 }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 className="h3">1 · Issue a suspension order</h2>
            <div className="grid2" style={{ gap: 12 }}>
              <label className="field">State
                <select className="input" value={state} onChange={(e) => { setState(e.target.value); setPicked([]) }}>
                  {Object.entries(STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="field">What is cut
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  {Object.entries(scopeLabel).filter(([k]) => k !== 'unknown').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="mute" style={{ fontSize: 14, marginBottom: 6 }}>Districts ({picked.length ? picked.length : 'whole state'})</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 132, overflowY: 'auto' }}>
                {districts.map((d) => {
                  const on = picked.includes(d.name)
                  return <button key={d.id} className={`chip${on ? ' sodium' : ''}`} style={{ cursor: 'pointer', background: 'none', minHeight: 32 }} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== d.name) : [...picked, d.name])}>{d.name}</button>
                })}
              </div>
            </fieldset>
            <label className="field">Length: {daysN} drill day{daysN > 1 ? 's' : ''} ({daysN} minute{daysN > 1 ? 's' : ''})
              <input type="range" min={1} max={15} value={daysN} onChange={(e) => setDaysN(+e.target.value)} />
              <span className="hint">The rules cap an order at fifteen days, so the slider stops at fifteen.</span>
            </label>
            <label className="row" style={{ gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span>Issued in an emergency (lapses after one drill day unless confirmed)</span>
            </label>
            <button className="btn primary" disabled={!!busy} onClick={() => issue()}>{busy === 'issue' ? 'Writing order + record in one batch…' : 'Issue the order'}</button>
          </div>

          <div className="panel" style={{ display: 'grid', gap: 12 }}>
            <h2 className="h3">2 · Report from the ground</h2>
            <p className="mute" style={{ margin: 0 }}>Click any district on the map to report it dark. A report in a district with no order in force turns it red: a shutdown nobody published. Drill reports fade in six minutes unless confirmed.</p>
            <p className="hint" style={{ margin: 0 }}>Or use the <Link to="/report">report form</Link> (that one files to the live register).</p>
          </div>

          {mine.length > 0 && (
            <div className="panel" style={{ display: 'grid', gap: 12 }}>
              <h2 className="h3">3 · Your orders</h2>
              {mine.map((o) => {
                const exp = blockToTime(o.expiresAt)
                const pendingEmergency = o.emergency && exp - o.issued * 1000 <= DRILL_DAY_MS + 60_000
                return (
                  <div key={o.key} className="item">
                    <span>{o.stateName} · {o.districts.length} district{o.districts.length > 1 ? 's' : ''} · lapses {fmtTime(exp)}{pendingEmergency ? ' (unconfirmed)' : ''}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {pendingEmergency && <button className="btn small primary" disabled={!!busy} onClick={() => run('confirm', () => confirmEmergency(o), 'Confirmed: the order now runs its full length.')}>Confirm</button>}
                      <button className="btn small" disabled={!!busy} onClick={() => issue(o)}>Renew</button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {lastTx && <p className="hint">Last write: <a href={txUrl(lastTx)}>{short(lastTx)}</a></p>}
        </div>

        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <NightMap state={map} focus={null} onPick={(i) => {
            if (!geo || rewind) return
            const d = geo.districts[i]
            void run('report', () => fileReport({ net: 'drill', state: d.code, district: d.name, carrier: 'All networks', status: 'down', note: 'Drill report' }), `Drill report filed for ${d.name}.`)
          }} label="Drill map: click a district to report it dark" />
          <label className="field">Rewind the drill: {rewind ? `${rewind} minute${rewind > 1 ? 's' : ''} ago (querying Arkiv at block ${(currentBlock() - BigInt(rewind * 30)).toLocaleString()})` : 'now'}
            <input type="range" min={0} max={30} value={rewind} onChange={(e) => setRewind(+e.target.value)} />
            <span className="hint">Arkiv answers queries as of any past block, so lapsed orders and faded reports reappear exactly as they were.</span>
          </label>
          {busy === 'report' && <p className="hint">Writing the report to Arkiv…</p>}
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <h2 className="h3">Drill orders in force ({drill.orders.length})</h2>
            {drill.orders.length === 0 && <div className="empty">No drill order is in force. Issue one above and it appears here as a gazette page, counting down.</div>}
            <div className="grid2">{[...drill.orders].sort((a, b) => b.issued - a.issued).slice(0, 6).map((o) => <Link key={o.key} to={`/e/${o.key}`} style={{ textDecoration: 'none' }}><Gazette o={o} live compact /></Link>)}</div>
          </div>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <h2 className="h3">Live wire</h2>
            <LiveWire />
          </div>
        </div>
      </section>
    </>
  )
}
