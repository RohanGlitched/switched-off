// An order, printed as a page of the Gazette. The life bar is the order's Arkiv expiry: when it
// reaches the end, the entity is gone and the districts light up again.
import { blockToTime, type Order, type Record_ } from '../lib/arkiv'
import { dayMs } from '../lib/write'
import { fmtDate, fmtDateTime, left, scopeLabel } from '../lib/fmt'
import { useNow } from '../lib/store'
import { REGISTRARS } from '../lib/registrars'

export function Gazette({ o, live, compact }: { o: Order | Record_; live?: boolean; compact?: boolean }) {
  const now = useNow()
  const isOrder = 'confirmed' in o
  const lapseAt = isOrder ? blockToTime(o.expiresAt) : o.ends * 1000
  const span = Math.max(1, (isOrder ? lapseAt : o.ends * 1000) - o.starts * 1000)
  const used = Math.min(1, Math.max(0, (now - o.starts * 1000) / span))
  const lapsed = !live || now >= lapseAt
  const emergencyPending = isOrder && o.emergency && lapseAt - o.issued * 1000 <= dayMs(o.net) + 120_000
  const official = REGISTRARS.some((r) => r.address.toLowerCase() === o.creator.toLowerCase())
  const daysLong = Math.max(1, Math.round((o.ends - o.starts) / (o.net === 'drill' ? 60 : 86400)))
  return (
    <article className="gazette" aria-label={`Order: ${o.stateName}, ${o.districts.join(', ')}`}>
      <div className="mast">
        <div style={{ fontSize: 15 }}>{o.net === 'drill' ? 'Drill Gazette' : 'Register of Suspension Orders'}</div>
        <small>{o.authority || 'Issuing authority not recorded'}</small>
      </div>
      <span className={`stamp${lapsed ? ' lapsed' : ''}`}>{lapsed ? 'LAPSED' : emergencyPending ? 'EMERGENCY' : 'IN FORCE'}</span>
      <h3>{o.stateName}</h3>
      <p className="meta" style={{ margin: '4px 0 8px', paddingRight: 90 }}>
        {o.districts.length > 4 ? `${o.districts.slice(0, 4).join(', ')} and ${o.districts.length - 4} more` : o.districts.join(', ')}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 15 }}>
        <b>{scopeLabel[o.scope]}</b> suspended{o.ends ? ` for ${daysLong} ${o.net === 'drill' ? 'drill day' : 'day'}${daysLong === 1 ? '' : 's'}` : ', with no end date stated'}
        {o.seq > 1 ? `, renewal no. ${o.seq - 1}` : ''}.
      </p>
      {!compact && o.reason && <p className="serif" style={{ fontSize: 17, lineHeight: 1.4, margin: '0 0 10px' }}>“{o.reason}”</p>}
      <div className="lifebar" aria-hidden="true"><i style={{ width: `${(lapsed ? 1 : used) * 100}%` }} /></div>
      <div className="meta row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span>{fmtDate(o.starts * 1000)} → {o.ends ? fmtDate(o.ends * 1000) : 'end not stated'}</span>
        <span className="num"><b style={{ color: 'var(--ink)' }}>{lapsed ? (o.ends ? `Lapsed ${fmtDate(Math.min(lapseAt, o.ends * 1000))}` : 'Lapsed') : `Lapses in ${left(lapseAt - now)}`}</b></span>
      </div>
      {!compact && (
        <div className="meta" style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {o.basis && <span>Under: {o.basis}</span>}
          {emergencyPending && !lapsed && <span style={{ color: 'var(--seal)' }}>Issued in an emergency: lapses at {fmtDateTime(lapseAt)} unless the competent authority confirms it.</span>}
          {o.published === false && <span style={{ color: 'var(--seal)' }}>The order text was not published.</span>}
          {o.notes && <span>Note: {o.notes}</span>}
          <span>Filed by {official ? 'the Switched Off registrar' : 'a community transcriber'}</span>
          {o.sources.length > 0 && (
            <span>
              Source: {o.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title}{i < o.sources.length - 1 ? '; ' : ''}</a>
              ))}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
