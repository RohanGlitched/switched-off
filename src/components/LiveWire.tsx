// Arkiv's entity events, rendered as a news wire.
import { useMemo } from 'react'
import { getSnapshot, useNow, useWire, type WireItem } from '../lib/store'
import { fmtTime, where as placeList } from '../lib/fmt'
import { Link } from '../lib/router'
import { STATES } from '../lib/geo'
import type { Net, Order, Record_, Report } from '../lib/arkiv'

function find(key: string): { net: Net; e: Order | Record_ | Report; t: 'order' | 'record' | 'report' } | null {
  const k = key.toLowerCase()
  for (const net of ['live', 'drill'] as Net[]) {
    const s = getSnapshot(net)
    for (const e of s.orders) if (e.key.toLowerCase() === k) return { net, e, t: 'order' }
    for (const e of s.records) if (e.key.toLowerCase() === k) return { net, e, t: 'record' }
    for (const e of s.reports) if (e.key.toLowerCase() === k) return { net, e, t: 'report' }
  }
  return null
}

function line(w: WireItem): string {
  if (w.text) return w.text
  const f = find(w.key)
  if (!f) return w.kind === 'extended' ? 'An entity on the register was kept alive' : 'A register entity changed'
  const where = f.t === 'report' ? `${(f.e as Report).district}, ${STATES[(f.e as Report).state] ?? (f.e as Report).state}` : `${(f.e as Order).stateName}`
  const drill = f.net === 'drill' ? 'Drill: ' : ''
  if (f.t === 'report') {
    const r = f.e as Report
    if (w.kind === 'created') return `${drill}${r.status === 'back' ? 'Internet back' : r.status === 'slow' ? 'Internet crawling' : 'No internet'} reported in ${where} (${r.carrier})`
    if (w.kind === 'extended') return `${drill}Someone confirmed the report from ${where}`
  }
  if (f.t === 'order') {
    if (w.kind === 'created') return `${drill}Suspension order filed: ${where}, ${placeList((f.e as Order).districts)}`
    if (w.kind === 'extended') return `${drill}Emergency order confirmed: ${where}`
  }
  if (f.t === 'record') {
    if (w.kind === 'created') return `${drill}Record written to the archive: ${where}`
    if (w.kind === 'extended') return `${drill}Someone paid to keep the record for ${where} alive`
  }
  return `${drill}${w.kind} · ${where}`
}

export function LiveWire({ limit = 9 }: { limit?: number }) {
  const wire = useWire()
  useNow(3000)
  const items = useMemo(() => wire.slice(0, limit), [wire, limit])
  return (
    <div className="wire" aria-live="polite" aria-label="Live changes to the register">
      {items.length === 0 && (
        <div style={{ gridTemplateColumns: '1fr' }}>
          <span className="mute">Listening to Arkiv… New orders, reports and confirmations appear here the moment they land in a block. <Link to="/drill">Start a drill</Link> to see it move.</span>
        </div>
      )}
      {items.map((w) => (
        <div key={w.id} className={Date.now() - w.at < 4000 ? 'new' : ''}>
          <time>{fmtTime(w.at)}</time>
          <Link to={`/e/${w.key}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{line(w)} <span className="faint num">· block {w.block.toString()}</span></Link>
        </div>
      ))}
    </div>
  )
}
