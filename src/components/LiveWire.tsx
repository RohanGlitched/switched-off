// Arkiv's entity events, rendered as a news wire.
import { useMemo } from 'react'
import { getSnapshot, useNow, useWire, type WireItem } from '../lib/store'
import { fmtTime, where as placeList } from '../lib/fmt'
import { Link } from '../lib/router'
import { STATES } from '../lib/geo'
import { tf, tr, tx, useT } from '../lib/i18n'
import type { Net, Order, Record_, Report } from '../lib/arkiv'

type Found = { net: Net; e: Order | Record_ | Report; t: 'order' | 'record' | 'report' }

function find(key: string): Found | null {
  const k = key.toLowerCase()
  for (const net of ['live', 'drill'] as Net[]) {
    const s = getSnapshot(net)
    for (const e of s.orders) if (e.key.toLowerCase() === k) return { net, e, t: 'order' }
    for (const e of s.records) if (e.key.toLowerCase() === k) return { net, e, t: 'record' }
    for (const e of s.reports) if (e.key.toLowerCase() === k) return { net, e, t: 'report' }
  }
  return null
}

// once an entity has been named on the wire its words stay, even after it expires and can't be
// looked up: the entity is remembered (not its sentence), so the line can still change language
const seen = new Map<string, Found>()

function line(w: WireItem): string {
  if (w.lapsed) {
    const l = w.lapsed
    const place = l.districts.length === 1 ? (/^statewide$/i.test(l.districts[0]) ? tr('Statewide') : l.districts[0]) : tf('{n} districts', { n: l.districts.length })
    return `${l.drill ? tr('Drill: ') : ''}${tf("Order lapsed on Arkiv's clock: {state}, {place} relit. Nobody deleted it; its expiry block arrived.", { state: l.state, place })}`
  }
  const f = find(w.key) ?? seen.get(w.id)
  if (!f) return tr(w.kind === 'extended' ? 'An entity on the register was kept alive' : 'A register entity changed')
  seen.set(w.id, f)
  const where = f.t === 'report' ? `${(f.e as Report).district}, ${tr(STATES[(f.e as Report).state] ?? (f.e as Report).state)}` : `${(f.e as Order).stateName}`
  const drill = f.net === 'drill' ? tr('Drill: ') : ''
  if (f.t === 'report') {
    const r = f.e as Report
    if (w.kind === 'created') return `${drill}${tf('{what} reported in {where} ({carrier})', { what: tr(r.status === 'back' ? 'Internet back' : r.status === 'slow' ? 'Internet crawling' : 'No internet'), where, carrier: tr(r.carrier) })}`
    if (w.kind === 'extended') return `${drill}${tf('Someone confirmed the report from {where}', { where })}`
  }
  if (f.t === 'order') {
    if (w.kind === 'created') return `${drill}${tf('Suspension order filed: {where}, {places}', { where, places: placeList((f.e as Order).districts) })}`
    if (w.kind === 'extended') return `${drill}${tf('Emergency order confirmed: {where}', { where })}`
  }
  if (f.t === 'record') {
    if (w.kind === 'created') return `${drill}${tf('Record written to the archive: {where}', { where })}`
    if (w.kind === 'extended') return `${drill}${tf('Someone paid to keep the record for {where} alive', { where })}`
  }
  return `${drill}${tr(w.kind)} · ${where}`
}

export function LiveWire({ limit = 9 }: { limit?: number }) {
  const wire = useWire()
  const t = useT()
  useNow(3000)
  const items = useMemo(() => wire.slice(0, limit), [wire, limit])
  return (
    <div className="wire" aria-live="polite" aria-label={t('Live changes to the register')}>
      {items.length === 0 && (
        <div style={{ gridTemplateColumns: '1fr' }}>
          <span className="mute">{tx('Listening to Arkiv… New orders, reports and confirmations appear here the moment they land in a block. {link} to see it move.', { link: <Link to="/drill">{t('Start a drill')}</Link> })}</span>
        </div>
      )}
      {items.map((w) => (
        <div key={w.id} className={Date.now() - w.at < 4000 && !w.earlier ? 'new' : ''}>
          <time>{w.earlier ? <span className="faint">{t('earlier')} · </span> : null}{fmtTime(w.at)}</time>
          <Link to={`/e/${w.key}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{line(w)} <span className="faint num">{tf('· block {n}', { n: w.block.toString() })}</span></Link>
        </div>
      ))}
    </div>
  )
}
