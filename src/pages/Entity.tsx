// One entity, with everything Arkiv knows about it: owner, creator, flags, expiry, and the
// actions its flags allow (confirm a report, keep a record alive, confirm an emergency order).
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { Gazette } from '../components/Gazette'
import { SEALED, allRecords, blockToTime, currentBlock, extenders, orderByKey, syncClock, type Order, type Record_, type Report } from '../lib/arkiv'
import { confirmEmergency, confirmReport, keepAlive } from '../lib/write'
import { account } from '../lib/wallet'
import { addrUrl, ago, fmtDateTime, left, short, txUrl } from '../lib/fmt'
import { refresh, useNow } from '../lib/store'
import { Link } from '../lib/router'
import { STATES } from '../lib/geo'
import { toast } from '../components/Toast'

type Any = Order | Record_ | Report
const isReport = (e: Any): e is Report => 'carrier' in e
const isRecord = (e: Any): e is Record_ => 'permissionless' in e

export function EntityPage({ entityKey }: { entityKey: Hex }) {
  const [e, setE] = useState<Any | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [tx, setTx] = useState<Hex | null>(null)
  const now = useNow()
  const [witnesses, setWitnesses] = useState<Hex[] | null>(null)
  const [related, setRelated] = useState<{ corrects?: Hex; correctedBy?: Hex }>({})
  const load = () => syncClock().then(() => orderByKey(entityKey)).then((x) => {
    setE(x)
    if (x && ('carrier' in x || 'permissionless' in x)) void extenders(x.key, x.createdAt > 0n ? x.createdAt : currentBlock() - 400_000n).then(setWitnesses)
    if (x && 'permissionless' in x) void allRecords(x.net).then((rs) => setRelated({ corrects: (x.corrects || undefined) as Hex | undefined, correctedBy: rs.find((r) => r.corrects.toLowerCase() === x.key.toLowerCase())?.key }))
  })
  useEffect(() => void load(), [entityKey])

  const act = async (fn: () => Promise<Hex>, done: string) => {
    setBusy(true)
    try {
      const h = await fn()
      setTx(h)
      toast(done)
      await load()
      void refresh('live')
      void refresh('drill')
    } catch (err) {
      toast(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  if (e === 'loading') return <section className="wrap section" style={{ borderTop: 0 }}><div className="skel" style={{ height: 420, maxWidth: 560 }} /></section>
  if (!e)
    return (
      <section className="wrap section" style={{ borderTop: 0, display: 'grid', gap: 14 }}>
        <h1 className="h2">This entity has expired, or never existed.</h1>
        <p className="lede">On Arkiv, an order that has lapsed and a report nobody confirmed simply stop existing at their expiry block. The archive keeps a permanent record of every order; reports are meant to fade.</p>
        <p className="hint num">Key {entityKey}</p>
        <div className="row"><Link to="/register" className="btn">Open the register</Link><Link to="/data" className="btn">Query a past block</Link></div>
      </section>
    )

  const expMs = blockToTime(e.expiresAt)
  const mine = e.owner.toLowerCase() === account.address.toLowerCase()
  const me = account.address.toLowerCase()
  const iFiled = e.creator.toLowerCase() === me
  const iConfirmed = !!witnesses?.includes(me as Hex)
  const sealed = e.owner.toLowerCase() === SEALED.toLowerCase()
  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {isReport(e) ? <ReportCard r={e} /> : <Gazette o={e} live={!isRecord(e)} />}
        </div>
        <div className="panel" style={{ display: 'grid', gap: 14 }}>
          <h1 className="h3">{isReport(e) ? 'Citizen report' : isRecord(e) ? 'Permanent record' : 'Order in force'} on Arkiv</h1>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '8px 14px', margin: 0, fontSize: 14 }}>
            <dt className="mute">Entity key</dt><dd className="num" style={{ margin: 0, overflowWrap: 'anywhere' }}>{e.key}</dd>
            <dt className="mute">Owner</dt><dd style={{ margin: 0 }}><a href={addrUrl(e.owner)}>{short(e.owner)}</a>{mine ? ' (you)' : ''}{sealed ? ' · sealed: nobody holds this key, so nobody can delete it' : ''}</dd>
            <dt className="mute">Creator</dt><dd style={{ margin: 0 }}><a href={addrUrl(e.creator)}>{short(e.creator)}</a></dd>
            <dt className="mute">Expires</dt><dd className="num" style={{ margin: 0 }}>block {e.expiresAt.toLocaleString()} · {fmtDateTime(expMs)} · <b>{left(expMs - now)}</b></dd>
            <dt className="mute">Flags</dt><dd style={{ margin: 0 }}>{flagText(e)}</dd>
            {witnesses && (isReport(e) || isRecord(e)) && <><dt className="mute">{isReport(e) ? 'Confirmed by' : 'Kept alive by'}</dt><dd style={{ margin: 0 }}>{witnesses.length ? `${witnesses.length} other key${witnesses.length === 1 ? '' : 's'} (${witnesses.slice(0, 3).map((w) => short(w)).join(', ')}${witnesses.length > 3 ? '…' : ''})` : 'nobody yet'}</dd></>}
            {related.corrects && <><dt className="mute">Corrects</dt><dd style={{ margin: 0 }}><Link to={`/e/${related.corrects}`}>{short(related.corrects)}</Link> (the original stays on Arkiv, unchanged)</dd></>}
            {related.correctedBy && <><dt className="mute">Corrected by</dt><dd style={{ margin: 0 }}><Link to={`/e/${related.correctedBy}`}>{short(related.correctedBy)}</Link></dd></>}
            <dt className="mute">Head</dt><dd className="num" style={{ margin: 0 }}>block {currentBlock().toLocaleString()}</dd>
          </dl>
          {isReport(e) && (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="mute" style={{ margin: 0 }}>Seeing the same thing? Confirming pushes this report’s expiry six {e.net === 'drill' ? 'minutes' : 'hours'} from now. You can’t change what it says, and neither can its author. Each browser key counts once; it counts keys, not people.</p>
              <button className="btn primary" disabled={busy || iFiled || iConfirmed} onClick={() => act(() => confirmReport(e.key, e.net), 'Confirmed. The report stays up for another window.')}>{busy ? 'Writing to Arkiv…' : iFiled ? 'You filed this: a neighbour has to confirm it' : iConfirmed ? 'You already confirmed this' : 'Still down here: confirm'}</button>
            </div>
          )}
          {isRecord(e) && (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="mute" style={{ margin: 0 }}>This record is readonly and anyone may extend it. Keeping it alive moves its expiry another {e.net === 'drill' ? 'drill day' : 'year'} out, paid by your browser’s testnet wallet.</p>
              <button className="btn primary" disabled={busy} onClick={() => act(() => keepAlive(e.key, e.net, e.expiresAt), 'Thank you. This record now lives longer, whoever runs this site.')}>{busy ? 'Writing to Arkiv…' : `Keep this record alive another ${e.net === 'drill' ? 'drill day' : 'year'}`}</button>
            </div>
          )}
          {!isReport(e) && !isRecord(e) && e.emergency && mine && expMs - e.issued * 1000 < 26 * 3600_000 && (
            <button className="btn primary" disabled={busy} onClick={() => act(() => confirmEmergency(e), 'Confirmed: the order now runs to its stated end.')}>{busy ? 'Writing to Arkiv…' : 'Confirm this emergency order'}</button>
          )}
          {tx && <p className="hint" style={{ margin: 0 }}>Written in transaction <a href={txUrl(tx)}>{short(tx)}</a>.</p>}
          <p className="hint" style={{ margin: 0 }}>Reproduce: <code>arkiv_getEntity("{short(e.key)}")</code> on Tiramisu, or see <Link to="/data">the exact queries</Link>.</p>
        </div>
      </div>
    </section>
  )
}

function flagText(e: Any) {
  if (isReport(e)) return 'readonly · anyone may extend'
  if (isRecord(e)) return e.permissionless ? 'readonly · anyone may extend' : 'readonly'
  return e.readonly ? 'readonly · only its filer may extend (confirm)' : 'editable'
}

export function ReportCard({ r }: { r: Report }) {
  const now = useNow()
  const exp = blockToTime(r.expiresAt)
  return (
    <article className="panel" style={{ display: 'grid', gap: 8, borderColor: r.status === 'back' ? 'var(--restored)' : 'color-mix(in srgb, var(--vermilion) 60%, transparent)' }}>
      <span className={`chip ${r.status === 'back' ? 'green' : 'red'}`} style={{ justifySelf: 'start' }}>{r.status === 'back' ? 'Internet back' : r.status === 'slow' ? 'Crawling' : 'No internet'}{r.net === 'drill' ? ' · drill' : ''}</span>
      <h2 className="h2" style={{ fontSize: 30 }}>{r.district}</h2>
      <p className="mute" style={{ margin: 0 }}>{STATES[r.state] ?? r.state} · {r.carrier} · seen {ago(r.seen * 1000)}{r.late ? ' (sent once the signal came back)' : ''}</p>
      {r.note && <p className="serif" style={{ fontSize: 19, margin: '6px 0' }}>“{r.note}”</p>}
      <p className="hint num" style={{ margin: 0 }}>Fades in {left(exp - now)} unless someone confirms it.</p>
    </article>
  )
}

export function humanError(err: unknown): string {
  const m = String((err as Error)?.message ?? err)
  if (/insufficient funds/i.test(m)) return 'This browser’s testnet wallet is out of gas. Try again in a minute: the gas tap refills it.'
  if (/would not move the expiry later|not later/i.test(m)) return 'Someone just extended it further than this would. Nothing to do.'
  if (/not.*owner|permission/i.test(m)) return 'Only the filer’s key can do that.'
  if (/gas tap|top-up|address/i.test(m)) return m
  if (/fetch|network|timeout/i.test(m)) return 'Arkiv didn’t answer in time. Your action was not written; try again.'
  return `Arkiv refused the write: ${m.slice(0, 140)}`
}
