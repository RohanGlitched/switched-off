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

// A run of "earlier" rows saying the same thing in one block (the archive written nine records at a
// time) reads as one line: "9 records written to the archive · block 727440".
const GROUP: Record<string, string> = {
  'record|created': '{n} records written to the archive',
  'record|extended': 'Someone paid to keep {n} records alive',
  'order|created': '{n} suspension orders filed',
  'order|extended': '{n} emergency orders confirmed',
  'report|created': '{n} reports filed',
  'report|extended': '{n} reports confirmed',
}
type Row = { w: WireItem; n: number; f: Found | null }
function rows(wire: WireItem[]): Row[] {
  const out: Row[] = []
  for (const w of wire) {
    const f = w.lapsed ? null : find(w.key) ?? seen.get(w.id) ?? null
    const last = out[out.length - 1]
    if (last && f && last.f && w.earlier && last.w.earlier && last.w.block === w.block && last.f.net === f.net && last.f.t === f.t && last.w.kind === w.kind) last.n++
    else out.push({ w, n: 1, f })
  }
  return out
}
function groupLine({ w, n, f }: Row): string {
  const drill = f!.net === 'drill' ? tr('Drill: ') : ''
  return `${drill}${tf(GROUP[`${f!.t}|${w.kind}`] ?? '{n} changes to register entities', { n })}`
}

export function LiveWire({ limit = 9 }: { limit?: number }) {
  const wire = useWire()
  const t = useT()
  useNow(3000)
  const items = useMemo(() => rows(wire).slice(0, limit), [wire, limit])
  return (
    <div className="wire" aria-live="polite" aria-label={t('Live changes to the register')}>
      {items.length === 0 && (
        <div style={{ gridTemplateColumns: '1fr' }}>
          <span className="mute">{tx('Listening to Arkiv… New orders, reports and confirmations appear here the moment they land in a block. {link} to see it move.', { link: <Link to="/drill">{t('Start a drill')}</Link> })}</span>
        </div>
      )}
      {items.map((row) => {
        const { w, n, f } = row
        // a group opens where its entities are listed; a single row opens its entity
        const to = n > 1 ? (f!.net === 'drill' ? '/drill' : f!.t === 'record' ? '/register' : `/e/${w.key}`) : `/e/${w.key}`
        return (
          <div key={w.id} className={Date.now() - w.at < 4000 && !w.earlier ? 'new' : ''}>
            <time>{w.earlier ? <span className="faint">{t('earlier')} · </span> : null}{fmtTime(w.at)}</time>
            <Link to={to} style={{ color: 'var(--text)', textDecoration: 'none' }}>{n > 1 ? groupLine(row) : line(w)} <span className="faint num">{tf('· block {n}', { n: w.block.toString() })}</span></Link>
          </div>
        )
      })}
    </div>
  )
}
