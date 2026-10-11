// One entity, with everything Arkiv knows about it: owner, creator, flags, expiry, and the
// actions its flags allow (confirm a report, keep a record alive, confirm an emergency order).
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { Gazette } from '../components/Gazette'
import { SEALED, allRecords, blockToTime, currentBlock, extenders, orderByKey, syncClock, type Order, type Record_, type Report, EXPLORER } from '../lib/arkiv'
import { confirmEmergency, confirmReport, keepAlive, withdrawReport } from '../lib/write'
import { account } from '../lib/wallet'
import { addrUrl, ago, fmtDate, fmtDateTime, left, short, txUrl } from '../lib/fmt'
import { refresh, useNow } from '../lib/store'
import { Link } from '../lib/router'
import { STATES } from '../lib/geo'
import { toast } from '../components/Toast'
import { tf, tp, tr, tx as tx_, useT } from '../lib/i18n'

type Any = Order | Record_ | Report
const isReport = (e: Any): e is Report => 'carrier' in e
const isRecord = (e: Any): e is Record_ => 'permissionless' in e

export function EntityPage({ entityKey }: { entityKey: Hex }) {
  const [e, setE] = useState<Any | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [tx, setTx] = useState<Hex | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const now = useNow()
  const [witnesses, setWitnesses] = useState<Hex[] | null>(null)
  const [related, setRelated] = useState<{ corrects?: Hex; correctedBy?: Hex; renews?: { key: Hex; label: string }; renewedBy?: { key: Hex; label: string }[] }>({})
  const [showOld, setShowOld] = useState(false)
  const t = useT()
  const load = () => syncClock().then(() => orderByKey(entityKey)).then((x) => {
    setE(x)
    if (x && ('carrier' in x || 'permissionless' in x)) void extenders(x.key, x.createdAt > 0n ? x.createdAt : currentBlock() - 400_000n, x.creator).then(setWitnesses)
    if (x && 'permissionless' in x)
      void allRecords(x.net).then((rs) =>
        setRelated({
          corrects: (x.corrects || undefined) as Hex | undefined,
          correctedBy: rs.find((r) => r.corrects.toLowerCase() === x.key.toLowerCase())?.key,
          renews: x.renews ? rs.filter((r) => r.orderId === x.renews && !r.corrects).map((r) => ({ key: r.key, label: `${r.orderId} (${fmtDate(r.starts * 1000)})` }))[0] : undefined,
          renewedBy: rs.filter((r) => r.renews === x.orderId && !r.corrects).sort((a, b) => a.seq - b.seq).map((r) => ({ key: r.key, label: tf('renewal no. {n}, {date}', { n: Math.max(1, r.seq - 1), date: fmtDate(r.starts * 1000) }) })),
        }),
      )
  })
  useEffect(() => void load(), [entityKey])

  const act = async (fn: () => Promise<Hex>, done: string) => {
    setBusy(true)
    setErr(null)
    try {
      const h = await fn()
      setTx(h)
      toast(done)
      await load()
      void refresh('live')
      void refresh('drill')
    } catch (x) {
      setErr(humanError(x))
      toast(humanError(x))
    } finally {
      setBusy(false)
    }
  }

  if (e === 'loading') return <section className="wrap section" style={{ borderTop: 0 }}><div className="skel" style={{ height: 420, maxWidth: 560 }} /></section>
  if (!/^0x[0-9a-fA-F]{64}$/.test(entityKey))
    return (
      <section className="wrap section" style={{ borderTop: 0, display: 'grid', gap: 14 }}>
        <h1 className="h2">{t('That isn’t an entity key.')}</h1>
        <p className="lede">{t('An Arkiv entity key is 0x followed by 64 hex characters. Check the link, or open the register and pick a record.')}</p>
        <div className="row"><Link to="/register" className="btn">{t('Open the register')}</Link><Link to="/" className="btn">{t('Home')}</Link></div>
      </section>
    )
  if (!e)
    return (
      <section className="wrap section" style={{ borderTop: 0, display: 'grid', gap: 14 }}>
        <h1 className="h2">{t('This entity has expired, or never existed.')}</h1>
        <p className="lede">{t('On Arkiv, an order that has lapsed and a report nobody confirmed simply stop existing at their expiry block. The archive keeps a permanent record of every order; reports are meant to fade.')}</p>
        <p className="hint num">{tf('Key {key}', { key: entityKey })}</p>
        <div className="row"><Link to="/register" className="btn">{t('Open the register')}</Link><Link to="/data" className="btn">{t('Query a past block')}</Link></div>
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
          {related.correctedBy && !showOld ? (
            <div className="panel" style={{ display: 'grid', gap: 10 }}>
              <h2 className="h3">{t('Superseded by a correction')}</h2>
              <p className="mute" style={{ margin: 0 }}>{t('The registrar filed a correction for this record (its notes or source titles quoted people’s names, or a date was wrong). The register shows the correction; this original is sealed and readonly, so it stays on Arkiv until it expires.')}</p>
              <div className="row"><Link to={`/e/${related.correctedBy}`} className="btn primary">{t('Open the correction')}</Link><button className="btn" onClick={() => setShowOld(true)}>{t('Show the original anyway')}</button></div>
            </div>
          ) : isReport(e) ? <ReportCard r={e} /> : <Gazette o={e} live={!isRecord(e)} />}
        </div>
        <div className="panel" style={{ display: 'grid', gap: 14 }}>
          <h1 className="h3">{t(isReport(e) ? 'Citizen report on Arkiv' : isRecord(e) ? 'Permanent record on Arkiv' : 'Order in force on Arkiv')}</h1>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '8px 14px', margin: 0, fontSize: 14 }}>
            <dt className="mute">{t('Entity key')}</dt><dd className="num" style={{ margin: 0, overflowWrap: 'anywhere' }}><a href={`${EXPLORER}/entity/${e.key}`} target="_blank" rel="noreferrer">{e.key}</a><br /><span className="mute" style={{ fontFamily: 'inherit' }}>{t('Explorer: its creation, and for sealed records the transfer to 0x…dEaD')}</span></dd>
            <dt className="mute">{t('Owner')}</dt><dd style={{ margin: 0 }}><a href={addrUrl(e.owner)}>{short(e.owner)}</a>{mine ? t(' (you)') : ''}{sealed ? t(' · sealed: nobody holds this key, so nobody can delete it') : ''}</dd>
            <dt className="mute">{t('Creator')}</dt><dd style={{ margin: 0 }}><a href={addrUrl(e.creator)}>{short(e.creator)}</a></dd>
            <dt className="mute">{t('Expires')}</dt><dd className="num" style={{ margin: 0 }}>{tf('block {n}', { n: e.expiresAt.toLocaleString() })} · {fmtDateTime(expMs)} · <b>{left(expMs - now)}</b></dd>
            <dt className="mute">{t('Flags')}</dt><dd style={{ margin: 0 }}>{flagText(e)}</dd>
            {witnesses && (isReport(e) || isRecord(e)) && <><dt className="mute">{isReport(e) ? t('Confirmed by') : t('Kept alive by')}</dt><dd style={{ margin: 0 }}>{witnesses.length ? tp(witnesses.length, '{n} other key ({list})', '{n} other keys ({list})', { list: `${witnesses.slice(0, 3).map((w) => short(w)).join(', ')}${witnesses.length > 3 ? '…' : ''}` }) : t('nobody yet')}</dd></>}
            {related.corrects && <><dt className="mute">{t('Corrects')}</dt><dd style={{ margin: 0 }}><Link to={`/e/${related.corrects}`}>{short(related.corrects)}</Link> {t('(the original stays on Arkiv, unchanged)')}</dd></>}
            {related.correctedBy && <><dt className="mute">{t('Corrected by')}</dt><dd style={{ margin: 0 }}><Link to={`/e/${related.correctedBy}`}>{short(related.correctedBy)}</Link></dd></>}
            {related.renews && <><dt className="mute">{t('Renews')}</dt><dd style={{ margin: 0 }}><Link to={`/e/${related.renews.key}`}>{related.renews.label}</Link></dd></>}
            {related.renewedBy && related.renewedBy.length > 0 && <><dt className="mute">{t('Renewed by')}</dt><dd style={{ margin: 0, display: 'grid', gap: 2 }}>{related.renewedBy.map((r) => <Link key={r.key} to={`/e/${r.key}`}>{r.label}</Link>)}</dd></>}
            <dt className="mute">{t('Head')}</dt><dd className="num" style={{ margin: 0 }}>{tf('block {n}', { n: currentBlock().toLocaleString() })}</dd>
          </dl>
          {isReport(e) && (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="mute" style={{ margin: 0 }}>{t(e.net === 'drill' ? 'Seeing the same thing? Confirming pushes this report’s expiry six minutes from now. You can’t change what it says, and neither can its author. Each browser key counts once; it counts keys, not people.' : 'Seeing the same thing? Confirming pushes this report’s expiry six hours from now. You can’t change what it says, and neither can its author. Each browser key counts once; it counts keys, not people.')}</p>
              <button className="btn primary" disabled={busy || iFiled || iConfirmed} onClick={() => act(() => confirmReport(e.key, e.net), tr('Confirmed. The report stays up for another window.'))}>{busy ? t('Writing to Arkiv…') : iFiled ? t('You filed this: a neighbour has to confirm it') : iConfirmed ? t('You already confirmed this') : t('Still down here: confirm')}</button>
              {iFiled && (
                <>
                  <p className="mute" style={{ margin: 0 }}>{t('You filed this report, so this browser’s key owns it: the one thing an owner of a readonly entity can still do is delete it. Withdrawing removes it from the register now; its creation stays readable at past blocks.')}</p>
                  <button className="btn small danger" style={{ justifySelf: 'start' }} disabled={busy} onClick={() => { if (confirm(tr('Withdraw this report? It leaves the register at once.'))) void act(() => withdrawReport(e.key), tr('Withdrawn. The report is gone from the register.')) }}>{t('Withdraw my report')}</button>
                </>
              )}
            </div>
          )}
          {isRecord(e) && (
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="mute" style={{ margin: 0 }}>{t(e.net === 'drill' ? 'This record is readonly and anyone may extend it. Keeping it alive moves its expiry another drill day out, paid by your browser’s testnet wallet.' : 'This record is readonly and anyone may extend it. Keeping it alive moves its expiry another year out, paid by your browser’s testnet wallet.')}</p>
              <button className="btn primary" disabled={busy} onClick={() => act(() => keepAlive(e.key, e.net, e.expiresAt), tr('Thank you. This record now lives longer, whoever runs this site.'))}>{busy ? t('Writing to Arkiv…') : t(e.net === 'drill' ? 'Keep this record alive another drill day' : 'Keep this record alive another year')}</button>
            </div>
          )}
          {!isReport(e) && !isRecord(e) && e.emergency && mine && expMs - e.issued * 1000 < 26 * 3600_000 && (
            <button className="btn primary" disabled={busy} onClick={() => act(() => confirmEmergency(e), tr('Confirmed: the order now runs to its stated end.'))}>{busy ? t('Writing to Arkiv…') : t('Confirm this emergency order')}</button>
          )}
          {err && <p role="alert" style={{ margin: 0, color: 'var(--vermilion)', fontSize: 14 }}>{err}</p>}
          {tx && <p className="hint" style={{ margin: 0 }}>{tx_('Written in transaction {tx}.', { tx: <a href={txUrl(tx)}>{short(tx)}</a> })}</p>}
          <p className="hint" style={{ margin: 0 }}>{tx_('Reproduce: {code} on Tiramisu, or see {link}.', { code: <code>arkiv_getEntity("{short(e.key)}")</code>, link: <Link to="/data">{t('the exact queries')}</Link> })}</p>
        </div>
      </div>
    </section>
  )
}

function flagText(e: Any) {
  if (isReport(e)) return tr('readonly · anyone may extend')
  if (isRecord(e)) return tr(e.permissionless ? 'readonly · anyone may extend' : 'readonly')
  return tr(e.readonly ? 'readonly · only its filer may extend (confirm)' : 'editable')
}

export function ReportCard({ r }: { r: Report }) {
  const now = useNow()
  const t = useT()
  const exp = blockToTime(r.expiresAt)
  return (
    <article className="panel" style={{ display: 'grid', gap: 8, borderColor: r.status === 'back' ? 'var(--restored)' : 'color-mix(in srgb, var(--vermilion) 60%, transparent)' }}>
      <span className={`chip ${r.status === 'back' ? 'green' : 'red'}`} style={{ justifySelf: 'start' }}>{t(r.status === 'back' ? 'Internet back' : r.status === 'slow' ? 'Crawling' : 'No internet')}{r.net === 'drill' ? t(' · drill') : ''}</span>
      <h2 className="h2" style={{ fontSize: 30 }}>{r.district}</h2>
      <p className="mute" style={{ margin: 0 }}>{STATES[r.state] ?? r.state} · {t(r.carrier)} · {tf('seen {ago}', { ago: ago(r.seen * 1000) })}{r.late ? t(' (sent once the signal came back)') : ''}</p>
      {r.note && <p className="serif" style={{ fontSize: 19, margin: '6px 0' }}>“{r.note}”</p>}
      <p className="hint num" style={{ margin: 0 }}>{tf('Fades in {time} unless someone confirms it.', { time: left(exp - now) })}</p>
    </article>
  )
}

/** A write error in plain words, in the current language (for toasts and alerts). */
export function humanError(err: unknown): string {
  const en = humanErrorEn(err)
  const pii = /^This looks like it contains (.+)\. Remove it: everything on the register is public and permanent\.$/.exec(en)
  if (pii) return tf('This looks like it contains {what}. Remove it: everything on the register is public and permanent.', { what: tr(pii[1]) })
  if (en.startsWith('Arkiv refused the write: ')) return tf('Arkiv refused the write: {detail}', { detail: en.slice('Arkiv refused the write: '.length) })
  return tr(en)
}

/** The same message in English, for code that matches on its words. */
export function humanErrorEn(err: unknown): string {
  const m = String((err as Error)?.message ?? err)
  if (/insufficient funds/i.test(m)) return 'This browser’s testnet wallet is out of gas. Try again in a minute: the gas tap refills it.'
  if (/would not move the expiry later|not later/i.test(m)) return 'Someone just extended it further than this would. Nothing to do.'
  if (/not.*owner|permission/i.test(m)) return 'Only the filer’s key can do that.'
  if (/gas tap|top-up|topped up|top-ups|looks like it contains|address/i.test(m)) return m
  if (/fetch|network|timeout/i.test(m)) return 'Arkiv didn’t answer in time. Your action was not written; try again.'
  return `Arkiv refused the write: ${m.slice(0, 140)}`
}
