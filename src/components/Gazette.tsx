// An order, printed as a page of the Gazette. The life bar is the order's Arkiv expiry: when it
// reaches the end, the entity is gone and the districts light up again.
import { blockToTime, type Order, type Record_ } from '../lib/arkiv'
import { dayMs } from '../lib/write'
import { fmtDate, fmtDateTime, left, scopeName } from '../lib/fmt'
import { useNow } from '../lib/store'
import { REGISTRARS } from '../lib/registrars'
import { ErrorBoundary } from './ErrorBoundary'
import { BASIS_LABEL } from '../lib/basis'
import { tf, tx, useT } from '../lib/i18n'

/** District names as stored, except the "Statewide" marker, which is translated. */
const place = (d: string, t: (s: string) => string) => (/^statewide$/i.test(d) ? t('Statewide') : d)

export function Gazette(props: { o: Order | Record_; live?: boolean; compact?: boolean }) {
  return (
    <ErrorBoundary>
      <GazetteInner {...props} />
    </ErrorBoundary>
  )
}
function GazetteInner({ o, live, compact }: { o: Order | Record_; live?: boolean; compact?: boolean }) {
  const now = useNow()
  const t = useT()
  const isOrder = 'confirmed' in o
  const ds = o.districts.map((d) => place(d, t))
  const lapseAt = isOrder ? blockToTime(o.expiresAt) : o.ends * 1000
  const span = Math.max(1, (isOrder ? lapseAt : o.ends * 1000) - o.starts * 1000)
  const used = Math.min(1, Math.max(0, (now - o.starts * 1000) / span))
  // an order lapses with its entity; an archive record is "lapsed" once its stated end has passed
  const lapsed = isOrder ? !live || now >= lapseAt : o.ends ? now >= o.ends * 1000 : !live
  const emergencyPending = isOrder && o.emergency && lapseAt - o.issued * 1000 <= dayMs(o.net) + 120_000
  const official = REGISTRARS.some((r) => r.address.toLowerCase() === o.creator.toLowerCase())
  const daysLong = Math.max(1, Math.round((o.ends - o.starts) / (o.net === 'drill' ? 60 : 86400)))
  return (
    <article className="gazette" aria-label={tf('Order: {state}, {districts}', { state: o.stateName, districts: ds.join(', ') })}>
      <div className="mast">
        <div style={{ fontSize: 15 }}>{o.net === 'drill' ? t('Drill Gazette') : t('Register of Suspension Orders')}</div>
        <small>{o.authority || t('Issuing authority not recorded')}</small>
        <small style={{ fontStyle: 'italic' }}>{t('Unofficial transcription, not the Gazette of India')}</small>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <h3>{t(o.stateName)}{!official && <span className="chip" style={{ marginLeft: 8, fontSize: 11, verticalAlign: 'middle' }}>{t('community')}</span>}</h3>
        <span className={`stamp${lapsed ? ' lapsed' : ''}`}>{t(lapsed ? 'LAPSED' : emergencyPending ? 'EMERGENCY' : isOrder ? 'IN FORCE' : 'ARCHIVED')}</span>
      </div>
      <p className="meta" style={{ margin: '4px 0 8px' }}>
        {compact && ds.length > 4 ? tf('{list} and {n} more', { list: ds.slice(0, 4).join(', '), n: ds.length - 4 }) : ds.join(', ')}
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 15 }}>
        {o.ends
          ? tx(o.net === 'drill' ? (daysLong === 1 ? '{scope} suspended for {n} drill day' : '{scope} suspended for {n} drill days') : daysLong === 1 ? '{scope} suspended for {n} day' : '{scope} suspended for {n} days', { scope: <b>{scopeName(o.scope)}</b>, n: daysLong })
          : tx('{scope} suspended, with no end date stated', { scope: <b>{scopeName(o.scope)}</b> })}
        {o.seq > 1 ? tf(', renewal no. {n}', { n: o.seq - 1 }) : ''}{t('.')}
      </p>
      {!compact && o.reason && <p className="serif" style={{ fontSize: 17, lineHeight: 1.4, margin: '0 0 10px' }}>“{o.reason}”</p>}
      <div className="lifebar" aria-hidden="true"><i style={{ width: `${(lapsed ? 1 : used) * 100}%` }} /></div>
      <div className="meta row" style={{ justifyContent: 'space-between', gap: 6 }}>
        <span>{fmtDate(o.starts * 1000)} → {o.ends ? fmtDate(o.ends * 1000) : t('end not stated')}</span>
        <span className="num"><b style={{ color: 'var(--ink)' }}>{lapsed ? (o.ends ? tf('Lapsed {date}', { date: fmtDate(Math.min(lapseAt, o.ends * 1000)) }) : t('Lapsed')) : tf('Lapses in {time}', { time: left(lapseAt - now) })}</b></span>
      </div>
      {!compact && (
        <div className="meta" style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {o.basis && <span>{tf('Under: {basis}', { basis: t(BASIS_LABEL[o.basis] ?? o.basis) })}</span>}
          {emergencyPending && !lapsed && <span style={{ color: 'var(--seal)' }}>{tf('Issued in an emergency: lapses at {time} unless the competent authority confirms it.', { time: fmtDateTime(lapseAt) })}</span>}
          {o.published === false && <span style={{ color: 'var(--seal)' }}>{t('The order text was not published.')}</span>}
          {o.published == null && <span>{t('Whether the order text was published: not known.')}</span>}
          {'corrects' in o && o.corrects && <span>{t('This entry corrects an earlier record, which stays on Arkiv unchanged.')}</span>}
          {'sealed' in o && <span>{t(o.sealed ? 'Sealed: owned by an address nobody holds a key for, so nobody can edit or delete it. Anyone can keep it alive.' : 'Not sealed yet: its filer can still delete it.')}</span>}
          {o.notes && <span>{tf('Note: {notes}', { notes: o.notes })}</span>}
          <span>{t(official ? 'Filed by the Switched Off registrar' : 'Filed by a community transcriber')}</span>
          {o.sources.length > 0 && (
            <span>
              {t('Source:')} {o.sources.map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer">{s.title}{i < o.sources.length - 1 ? '; ' : ''}</a>
              ))}
            </span>
          )}
        </div>
      )}
    </article>
  )
}
