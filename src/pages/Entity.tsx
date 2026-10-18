// One entity, with everything Arkiv knows about it: owner, creator, flags, expiry, and the
// actions its flags allow (confirm a report, keep a record alive, confirm an emergency order).
import { useEffect, useState } from 'react'
import type { Hex } from 'viem'
import { Gazette } from '../components/Gazette'
import { CitePanel } from '../components/Cite'
import { RtiPanel } from '../components/Rti'
import { orderOnFile } from '../lib/cite'
import { SEALED, allRecords, applyCorrections, blockToTime, currentBlock, errText, extenders, orderByKey, sameDesk, syncClock, trustedCorrection, type Order, type Record_, type Report, EXPLORER } from '../lib/arkiv'
import { confirmEmergency, confirmReport, keepAlive, withdrawReport } from '../lib/write'
import { account } from '../lib/wallet'
import { addrUrl, ago, fmtDate, fmtDateTime, left, short, txUrl } from '../lib/fmt'
import { refresh, useNow } from '../lib/store'
import { Link } from '../lib/router'
import { STATES } from '../lib/geo'
import supersededList from '../data/superseded.json'
import { toast } from '../components/Toast'
import { tf, tp, tr, tx as tx_, useLang, useT } from '../lib/i18n'

type Any = Order | Record_ | Report
const isReport = (e: Any): e is Report => 'carrier' in e
const isRecord = (e: Any): e is Record_ => 'permissionless' in e
// records known to be superseded when the site was built (src/data/superseded.json, from scripts/snapshot.ts)
const SUPERSEDED = new Set(supersededList.keys)

export function EntityPage({ entityKey }: { entityKey: Hex }) {
  const [e, setE] = useState<Any | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [tx, setTx] = useState<Hex | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const now = useNow()
  const [witnesses, setWitnesses] = useState<Hex[] | null>(null)
  const [related, setRelated] = useState<{ corrects?: Hex; correctedBy?: Hex; renews?: { key: Hex; label: string }; renewedBy?: { key: Hex; label: string }[] }>({})
  // which record `related` was worked out for: a record's text waits for it, so a superseded original
  // (some quoted names) is never painted, even for the moment before the archive read lands
  const [relatedFor, setRelatedFor] = useState<string | null>(null)
  const t = useT()
  const load = () => syncClock().then(() => orderByKey(entityKey)).then((x) => {
    setRelated({})
    setRelatedFor(null)
    setE(x)
    if (x && ('carrier' in x || 'permissionless' in x)) void extenders(x.key, x.createdAt > 0n ? x.createdAt : currentBlock() - 400_000n, x.creator).then(setWitnesses)
    if (x && 'permissionless' in x)
      void allRecords(x.net).then((rs) => {
        const byKey = new Map(rs.map((r) => [r.key.toLowerCase(), r]))
        const visible = applyCorrections(rs)
        setRelated({
          corrects: (x.corrects || undefined) as Hex | undefined,
          // a stranger's "correction" or "renewal" is not shown as one: same rules as the register
          correctedBy: rs.find((r) => r.corrects.toLowerCase() === x.key.toLowerCase() && trustedCorrection(r, byKey))?.key,
          renews: x.renews ? visible.filter((r) => r.orderId === x.renews && sameDesk(r, x)).map((r) => ({ key: r.key, label: `${r.orderId} (${fmtDate(r.starts * 1000)})` }))[0] : undefined,
          renewedBy: visible.filter((r) => r.renews === x.orderId && sameDesk(r, x)).sort((a, b) => a.seq - b.seq).map((r) => ({ key: r.key, label: tf('renewal no. {n}, {date}', { n: Math.max(1, r.seq - 1), date: fmtDate(r.starts * 1000) }) })),
        })
        setRelatedFor(x.key.toLowerCase())
      }, () => setRelatedFor(x.key.toLowerCase()))
  })
  useEffect(() => void load(), [entityKey])
  // the tab names the record ("Manipur, 3 May 2023 · Switched Off"), not the word "Entity"
  const lang = useLang()
  useEffect(() => {
    const what = !e || e === 'loading' ? t('Record') : 'carrier' in e ? `${e.district}, ${t(STATES[e.state] ?? e.state)}` : `${t(e.stateName)}, ${fmtDate(e.starts * 1000)}`
    document.title = `${what} · Switched Off`
  }, [e, lang, t])

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
  const superseded = !!related.correctedBy || (isRecord(e) && SUPERSEDED.has(e.key.toLowerCase()))
  const waiting = isRecord(e) && !superseded && relatedFor !== e.key.toLowerCase()
  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
          {waiting ? (
            <div className="skel" style={{ height: 420 }} aria-label={t('Reading the archive from Arkiv…')} />
          ) : superseded ? (
            <div className="panel" style={{ display: 'grid', gap: 10 }}>
              <h2 className="h3">{t('Superseded by a correction')}</h2>
              <p className="mute" style={{ margin: 0 }}>{t('The registrar filed a correction for this record: its notes or sources quoted people’s names, or better sources improved its dates and links. The register shows the correction. This original is sealed and readonly, so it stays on Arkiv until it expires, but this site does not display its text.')}</p>
              {related.correctedBy ? <div className="row"><Link to={`/e/${related.correctedBy}`} className="btn primary">{t('Open the correction')}</Link></div> : <span className="hint">{t('Reading the archive from Arkiv…')}</span>}
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
      {!isReport(e) && !superseded && !waiting && (
        <div style={{ display: 'grid', gap: 20, marginTop: 20 }}>
          <CitePanel o={e} />
          {e.net === 'live' && !orderOnFile(e) && (
            <RtiPanel
              state={e.state}
              stateName={e.stateName}
              districts={e.districts}
              from={e.starts}
              // an order with no stated end: ask about the longest one order may run (15 days), never past today
              to={e.ends || Math.min(e.starts + 15 * 86_400, Math.floor(Date.now() / 1000))}
              orderId={e.orderId}
              authority={e.authority}
              why={e.published === false ? t('The order text was not published.') : t('No copy of the order itself is on file: only reports about it.')}
            />
          )}
        </div>
      )}
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
      <p className="mute" style={{ margin: 0 }}>{t(STATES[r.state] ?? r.state)} · {t(r.carrier)} · {tf('seen {ago}', { ago: ago(r.seen * 1000) })}{r.late ? t(' (sent once the signal came back)') : ''}</p>
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
  // match on the whole message (viem keeps the reason in its last line), show only the useful line
  const whole = String((err as Error)?.message ?? err)
  const m = errText(err)
  if (/insufficient funds/i.test(whole)) return 'This browser’s testnet wallet is out of gas. Try again in a minute: the gas tap refills it.'
  if (/would not move the expiry later|not later/i.test(whole)) return 'Someone just extended it further than this would. Nothing to do.'
  if (/not.*owner|permission/i.test(whole)) return 'Only the filer’s key can do that.'
  if (/gas tap|top-up|topped up|top-ups|looks like it contains|address/i.test(whole)) return m
  if (/fetch|network|timeout|timed out|took too long|Relay error|Too many calls|Arkiv answered/i.test(whole)) return 'Arkiv didn’t answer in time. Your action was not written; try again.'
  return `Arkiv refused the write: ${m.slice(0, 140)}`
}
