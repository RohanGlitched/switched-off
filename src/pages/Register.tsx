import { useEffect, useMemo, useState } from 'react'
import { Gazette } from '../components/Gazette'
import { MODE, recordsWhere, setMode, type Record_ } from '../lib/arkiv'
import { useRegister } from '../lib/store'
import { Link, param } from '../lib/router'
import { STATES } from '../lib/geo'
import { scopeLabel, scopeName } from '../lib/fmt'
import { tf, tx, useT } from '../lib/i18n'

export function RegisterPage() {
  const live = useRegister('live')
  const t = useT()
  const [state, setState] = useState((param('state') ?? '').toUpperCase())
  const [q, setQ] = useState(param('q') ?? '')
  const [scope, setScope] = useState(param('scope') ?? '')
  const [show, setShow] = useState<'all' | 'force'>(param('show') === 'force' ? 'force' : 'all')
  const [since, setSince] = useState(param('since') ?? '')
  // state and "since" go to Arkiv as a typed query (equality on state, a u64 range on issued);
  // the free-text search runs in the browser because reason text lives in the payload, not an attribute
  const [remote, setRemote] = useState<{ for: string; list: Record_[]; query: string } | null>(null)
  useEffect(() => {
    const key = `${state}|${since}`
    if (!state && !since) return setRemote(null)
    let alive = true
    void recordsWhere('live', { state: state || undefined, since: since ? Math.floor(new Date(`${since}-01-01T00:00:00+05:30`).getTime() / 1000) : undefined })
      .then((r) => alive && setRemote({ for: key, ...r }))
      .catch(() => alive && setRemote(null))
    return () => {
      alive = false
    }
  }, [state, since])
  // filters live in the URL, so a filtered view can be shared and Back restores it
  useEffect(() => {
    const u = new URLSearchParams()
    if (state) u.set('state', state)
    if (q) u.set('q', q)
    if (scope) u.set('scope', scope)
    if (show === 'force') u.set('show', 'force')
    if (since) u.set('since', since)
    const next = `/register${u.toString() ? `?${u}` : ''}`
    if (next !== location.pathname + location.search) history.replaceState(null, '', next)
  }, [state, q, scope, show, since])
  const forceKeys = useMemo(() => new Set(live.orders.map((o) => o.orderId)), [live.orders])
  const list = useMemo(() => {
    const ql = q.toLowerCase()
    const source = remote && remote.for === `${state}|${since}` ? remote.list : live.records
    return [...source]
      .filter((r) => !state || r.state === state)
      .filter((r) => !since || r.issued >= Math.floor(new Date(`${since}-01-01T00:00:00+05:30`).getTime() / 1000))
      .filter((r) => !scope || r.scope === scope)
      .filter((r) => show === 'all' || forceKeys.has(r.orderId))
      .filter((r) => !ql || `${r.stateName} ${r.districts.join(' ')} ${r.reason} ${r.authority}`.toLowerCase().includes(ql))
      .sort((a, b) => b.starts - a.starts)
  }, [live.records, remote, state, since, q, scope, show, forceKeys])
  const statesOnFile = useMemo(() => [...new Set(live.records.map((r) => r.state))].sort((a, b) => (STATES[a] ?? a).localeCompare(STATES[b] ?? b)), [live.records])

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="section-head">
        <span className="chip sodium">{t('Register')}</span>
        <h1 className="h2">{t('Every suspension order on file.')}</h1>
        <p className="lede">{tx('Read straight from Arkiv: each card is a readonly, sealed {record} entity. Orders still in force also exist as a short-lived {order} entity that disappears the moment the order lapses.', { record: <code>record</code>, order: <code>order</code> })}</p>
        <div className="row"><Link to="/file" className="btn small primary">{t('File a published order')}</Link><span className="hint">{t('Seen one that isn’t here? Anyone can add it.')}</span></div>
      </div>
      <div className="row" style={{ marginBottom: 18, alignItems: 'end' }}>
        <label className="field" style={{ minWidth: 200, flex: '1 1 200px' }}>{t('State')}
          <select className="input" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">{t('All states and UTs')}</option>
            {statesOnFile.map((s) => <option key={s} value={s}>{STATES[s] ?? s}</option>)}
          </select>
          <select className="input" value={since} onChange={(e) => setSince(e.target.value)} aria-label={t('Issued since')}>

            <option value="">{t('Any year')}</option>

            {['2025', '2024', '2023', '2022', '2021', '2020', '2019'].map((y) => <option key={y} value={y}>{tf('Issued {y} or later', { y })}</option>)}

          </select>
        </label>
        <label className="field" style={{ minWidth: 180, flex: '1 1 180px' }}>{t('What was cut')}
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">{t('Anything')}</option>
            {Object.keys(scopeLabel).map((k) => <option key={k} value={k}>{scopeName(k)}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 220, flex: '2 1 220px' }}>{t('Search')}
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('District, reason, authority')} />
        </label>
        <div className="seg" role="group" aria-label={t('Which orders')}>
          <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>{t('All on file')}</button>
          <button aria-pressed={show === 'force'} onClick={() => setShow('force')}>{t('In force now')}</button>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>{live.loading ? t('Reading the register from Arkiv…') : tf('{n} of {total} orders', { n: list.length, total: live.records.length })}{remote && remote.for === `${state}|${since}` ? <> · {t('query sent to Arkiv:')} <code className="num">{remote.query}</code></> : null}</p>
      {live.error && !live.loading && (
        <p className="hint" style={{ color: 'var(--vermilion)', marginBottom: 16 }}>
          {tf(MODE === 'direct' ? 'Arkiv didn’t answer your browser directly ({error}).' : 'Arkiv didn’t answer through this site’s relay ({error}).', { error: live.error.slice(0, 90) })}{' '}
          {MODE === 'direct' ? <button className="btn small" onClick={() => setMode('relay')}>{t('Read through the relay instead')}</button> : <button className="btn small" onClick={() => setMode('direct')}>{t('Read Arkiv directly from your browser')}</button>}
        </p>
      )}
      {live.loading ? (
        <div className="grid3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="skel" style={{ height: 300 }} />)}</div>
      ) : list.length ? (
        <div className="grid3">
          {list.map((r) => (
            <Link key={r.key} to={`/e/${r.key}`} style={{ textDecoration: 'none' }} aria-label={tf('Open the record for {state}', { state: r.stateName })}>
              <Gazette o={r} live={forceKeys.has(r.orderId)} compact />
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">{show === 'force' && live.orders.length === 0 ? tx('No order on the register is in force right now. Know of one? {link}.', { link: <Link to="/file">{t('File it')}</Link> }) : tx('No order on file matches. Clear a filter, or {link}.', { link: <Link to="/file">{t('file one that’s missing')}</Link> })}</div>
      )}
    </section>
  )
}
