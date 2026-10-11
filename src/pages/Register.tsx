import { useEffect, useMemo, useState } from 'react'
import { Gazette } from '../components/Gazette'
import { useRegister } from '../lib/store'
import { Link, param } from '../lib/router'
import { STATES } from '../lib/geo'
import { scopeLabel } from '../lib/fmt'

export function RegisterPage() {
  const live = useRegister('live')
  const [state, setState] = useState((param('state') ?? '').toUpperCase())
  const [q, setQ] = useState(param('q') ?? '')
  const [scope, setScope] = useState(param('scope') ?? '')
  const [show, setShow] = useState<'all' | 'force'>(param('show') === 'force' ? 'force' : 'all')
  // filters live in the URL, so a filtered view can be shared and Back restores it
  useEffect(() => {
    const u = new URLSearchParams()
    if (state) u.set('state', state)
    if (q) u.set('q', q)
    if (scope) u.set('scope', scope)
    if (show === 'force') u.set('show', 'force')
    const next = `/register${u.toString() ? `?${u}` : ''}`
    if (next !== location.pathname + location.search) history.replaceState(null, '', next)
  }, [state, q, scope, show])
  const forceKeys = useMemo(() => new Set(live.orders.map((o) => o.orderId)), [live.orders])
  const list = useMemo(() => {
    const ql = q.toLowerCase()
    return [...live.records]
      .filter((r) => !state || r.state === state)
      .filter((r) => !scope || r.scope === scope)
      .filter((r) => show === 'all' || forceKeys.has(r.orderId))
      .filter((r) => !ql || `${r.stateName} ${r.districts.join(' ')} ${r.reason} ${r.authority}`.toLowerCase().includes(ql))
      .sort((a, b) => b.starts - a.starts)
  }, [live.records, state, q, scope, show, forceKeys])
  const statesOnFile = useMemo(() => [...new Set(live.records.map((r) => r.state))].sort((a, b) => (STATES[a] ?? a).localeCompare(STATES[b] ?? b)), [live.records])

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="section-head">
        <span className="chip sodium">Register</span>
        <h1 className="h2">Every suspension order on file.</h1>
        <p className="lede">Read straight from Arkiv: each card is a readonly, sealed <code>record</code> entity. Orders still in force also exist as a short-lived <code>order</code> entity that disappears the moment the order lapses.</p>
        <div className="row"><Link to="/file" className="btn small primary">File a published order</Link><span className="hint">Seen one that isn’t here? Anyone can add it.</span></div>
      </div>
      <div className="row" style={{ marginBottom: 18, alignItems: 'end' }}>
        <label className="field" style={{ minWidth: 200, flex: '1 1 200px' }}>State
          <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All states and UTs</option>
            {statesOnFile.map((s) => <option key={s} value={s}>{STATES[s] ?? s}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>What was cut
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Anything</option>
            {Object.entries(scopeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 220, flex: '2 1 220px' }}>Search
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="District, reason, authority" />
        </label>
        <div className="seg" role="group" aria-label="Which orders">
          <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>All on file</button>
          <button aria-pressed={show === 'force'} onClick={() => setShow('force')}>In force now</button>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>{live.loading ? 'Reading the register from Arkiv…' : `${list.length} of ${live.records.length} orders`}</p>
      {live.loading ? (
        <div className="grid3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" style={{ height: 300 }} />)}</div>
      ) : list.length ? (
        <div className="grid3">
          {list.map((r) => (
            <Link key={r.key} to={`/e/${r.key}`} style={{ textDecoration: 'none' }} aria-label={`Open the record for ${r.stateName}`}>
              <Gazette o={r} live={forceKeys.has(r.orderId)} compact />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">{show === 'force' && live.orders.length === 0 ? <>No order on the register is in force right now. Know of one? <Link to="/file">File it</Link>.</> : <>No order on file matches. Clear a filter, or <Link to="/file">file one that’s missing</Link>.</>}</div>
      )}
    </section>
  )
}
