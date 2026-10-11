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
import { fmtTime, scopeLabel, scopeName, short, txUrl, where } from '../lib/fmt'
import { tf, tp, tr, tx, useT } from '../lib/i18n'
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
  const [target, setTarget] = useState<number | null>(null) // a district picked on the map, waiting to be reported
  const [past, setPast] = useState<{ orders: Order[]; reports: Report[]; block: bigint } | null>(null)
  const t = useT()
  useNow()

  useEffect(() => {
    if (!rewind) return setPast(null)
    const block = currentBlock() - BigInt(Math.round((rewind * 60) / 2))
    let alive = true
    Promise.all([activeOrders('drill', block), liveReports('drill', block)]).then(([o, r]) => alive && setPast({ orders: o, reports: r, block }), () => alive && setPast({ orders: [], reports: [], block }))
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
    // a renewal is a new order that takes over when the current one lapses
    const from = renews ? Math.max(now, renews.ends * 1000) : now
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
      starts: from,
      ends: from + (renews ? 15 : daysN) * DRILL_DAY_MS,
      emergency: renews ? false : emergency,
      basis: 'Telecommunications (Temporary Suspension of Services) Rules, 2024 (drill)',
      authority: `Home Department, Government of ${STATES[st] ?? st} (drill)`,
      reason: renews ? 'Renewed: the situation is stated to continue.' : 'Drill: to prevent the spread of rumours during unrest.',
      renews: renews?.orderId ?? null,
      seq: renews ? renews.seq + 1 : 1,
      published: true,
      sources: [],
    }), tr(renews ? 'Renewal filed: a new order that takes over when the current one lapses.' : emergency ? 'Emergency order filed. It dies in one drill day unless you confirm it.' : 'Order filed. Watch its districts go dark.')).then(() => { setEmergency(false); setPicked([]) })
  }

  return (
    <>
      <section className="wrap" style={{ padding: '40px var(--gutter) 10px' }}>
        <div className="section-head">
          <span className="chip sodium">{t('Drill · one legal day = one real minute')}</span>
          <h1 className="h2">{t('Run the register at the speed of a demo.')}</h1>
          <p className="lede">{tx('Everything here is real Arkiv entities on Tiramisu, tagged {tag} and kept apart from the live register. Issue an order and its districts go dark; it lapses on its own when its last drill day ends. Make it an emergency order and it dies in one drill day unless you confirm it. Nothing to install: this browser has its own testnet key.', { tag: <code>net = drill</code> })}</p>
        </div>
      </section>
      <section className="wrap hero-grid" style={{ alignItems: 'start', paddingBottom: 40 }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <h2 className="h3">{t('1 · Issue a suspension order')}</h2>
            <div className="grid2" style={{ gap: 12 }}>
              <label className="field">{t('State')}
                <select className="input" value={state} onChange={(e) => { setState(e.target.value); setPicked([]) }}>
                  {Object.entries(STATES).sort((a, b) => t(a[1]).localeCompare(t(b[1]))).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                </select>
              </label>
              <label className="field">{t('What is cut')}
                <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                  {Object.keys(scopeLabel).filter((k) => k !== 'unknown').map((k) => <option key={k} value={k}>{scopeName(k)}</option>)}
                </select>
              </label>
            </div>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="mute" style={{ fontSize: 14, marginBottom: 6 }}>{tf('Districts ({n})', { n: picked.length ? picked.length : t('whole state') })}</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                {districts.map((d) => {
                  const on = picked.includes(d.name)
                  return <button key={d.id} className={`chip${on ? ' sodium' : ''}`} style={{ cursor: 'pointer', background: 'none', minHeight: 32 }} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== d.name) : [...picked, d.name])}>{d.name}</button>
                })}
              </div>
            </fieldset>
            <label className="field">{tp(daysN, 'Length: {n} drill day ({n} minute)', 'Length: {n} drill days ({n} minutes)')}
              <input type="range" min={1} max={15} value={daysN} onChange={(e) => setDaysN(+e.target.value)} />
              <span className="hint">{t('The rules cap an order at fifteen days, so the slider stops at fifteen.')}</span>
            </label>
            <label className="row" style={{ gap: 10, cursor: 'pointer', flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} style={{ width: 20, height: 20 }} />
              <span>{t('Issued in an emergency (lapses after one drill day unless confirmed)')}</span>
            </label>
            <button className="btn primary" disabled={!!busy} onClick={() => issue()}>{busy === 'issue' ? t('Writing order + record in one batch…') : t('Issue the order')}</button>
          </div>

          <div className="panel" style={{ display: 'grid', gap: 12 }}>
            <h2 className="h3">{t('2 · Report from the ground')}</h2>
            <p className="mute" style={{ margin: 0 }}>{t('Click any district on the map to report it dark. A report in a district with no order in force turns it red: a shutdown nobody published. Drill reports fade in six minutes unless confirmed.')}</p>
            <p className="hint" style={{ margin: 0 }}>{tx('Or use the {link} (that one files to the live register).', { link: <Link to="/report">{t('report form')}</Link> })}</p>
          </div>

          {mine.length > 0 && (
            <div className="panel" style={{ display: 'grid', gap: 12 }}>
              <h2 className="h3">{t('3 · Your orders')}</h2>
              {mine.map((o) => {
                const exp = blockToTime(o.expiresAt)
                const pendingEmergency = o.emergency && exp - o.issued * 1000 <= DRILL_DAY_MS + 60_000
                return (
                  <div key={o.key} className="item">
                    <span>{o.stateName} · {where(o.districts)}{o.seq > 1 ? tf(' · renewal {n}', { n: o.seq - 1 }) : ''} · {tf('lapses {time}', { time: fmtTime(exp) })}{pendingEmergency ? t(' (unconfirmed)') : ''}</span>
                    <span className="row" style={{ gap: 6 }}>
                      {pendingEmergency && <button className="btn small primary" disabled={!!busy} onClick={() => run('confirm', () => confirmEmergency(o), tr('Confirmed: the order now runs its full length.'))}>{t('Confirm')}</button>}
                      <button className="btn small" disabled={!!busy} onClick={() => issue(o)}>{t('Renew')}</button>
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {lastTx && <p className="hint">{tx('Last write: {tx}', { tx: <a href={txUrl(lastTx)}>{short(lastTx)}</a> })}</p>}
        </div>

        <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <NightMap state={map} focus={state} zoom onPick={(i) => { if (geo && !rewind) setTarget(i) }} label={t('Drill map: pick a district to report it dark')} />
          {target !== null && geo && (
            <div className="panel" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 200px' }}>{tx('Report {district}, {state} as dark (drill)?', { district: <b>{geo.districts[target].name}</b>, state: geo.districts[target].state })}{map.off.has(target) ? t(' An order is already in force here.') : t(' No order is in force here, so it will burn red.')}</span>
              <button className="btn small primary" disabled={!!busy} onClick={() => { const d = geo.districts[target]; setTarget(null); void run('report', () => fileReport({ net: 'drill', state: d.code, district: d.name, carrier: 'All networks', status: 'down', note: 'Drill report' }), tf('Drill report filed for {district}.', { district: d.name })) }}>{t('Report it')}</button>
              <button className="btn small" onClick={() => setTarget(null)}>{t('Cancel')}</button>
            </div>
          )}
          <label className="field">{t('Rewind the drill:')} {rewind ? tp(rewind, '{n} minute ago (querying Arkiv at block {block})', '{n} minutes ago (querying Arkiv at block {block})', { block: (past?.block ?? currentBlock() - BigInt(rewind * 30)).toString() }) : t('now')}
            <input type="range" min={-30} max={0} value={-rewind} onChange={(e) => setRewind(-e.target.value)} aria-valuetext={rewind ? tf('{n} minutes ago', { n: rewind }) : t('now')} />
            <span className="hint">{t('Arkiv answers queries as of any past block, so lapsed orders and faded reports reappear exactly as they were.')}</span>
          </label>
          {busy === 'report' && <p className="hint">{t('Writing the report to Arkiv…')}</p>}
        </div>
      </section>

      <section className="section">
        <div className="wrap grid2" style={{ alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <h2 className="h3">{tf('Drill orders in force ({n})', { n: shown.orders.length })}{past ? <span className="mute" style={{ fontWeight: 400 }}> · {tf('at block {block}', { block: past.block.toString() })}</span> : null}</h2>
            {shown.orders.length === 0 && <div className="empty">{t('No drill order is in force. Issue one above and it appears here as a gazette page, counting down.')}</div>}
            <div className="grid2">{[...shown.orders].sort((a, b) => b.issued - a.issued).slice(0, 6).map((o) => <Link key={o.key} to={`/e/${o.key}`} style={{ textDecoration: 'none' }}><Gazette o={o} live compact /></Link>)}</div>
          </div>
          <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
            <h2 className="h3">{t('Live wire')}</h2>
            <LiveWire />
          </div>
        </div>
      </section>
    </>
  )
}
