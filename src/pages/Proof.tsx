// Proof: every Arkiv property the register leans on, checked against the network from this browser.
// The write checks are simulations: Arkiv runs the transaction as that address and says what it would
// do. Nothing is signed or sent, so anyone can press every button.
import { useMemo, useState } from 'react'
import { useRegister } from '../lib/store'
import { Link } from '../lib/router'
import { tf, tx, useT } from '../lib/i18n'
import { EXPLORER, errText, type Record_ } from '../lib/arkiv'
import { BATCH_TX, EVIDENCE, flagsOf, lapsedButOnRecord, listen, oneTransaction, tryDelete, tryShorten, tryStrangerExtend, type Verdict } from '../lib/proof'

const GH = 'https://github.com/RohanGlitched/switched-off/blob/main/'

// what each Arkiv feature does for a person using the register, and where the code is
const FEATURES: { feature: string; sees: string; code: string; path: string }[] = [
  { feature: 'Expiration', sees: 'An order disappears from the map at the block its legal deadline falls on; a report fades after six hours.', code: 'src/lib/write.ts', path: 'src/lib/write.ts' },
  { feature: 'Lifetime extension', sees: 'Confirming an emergency order, a neighbour confirming a report, anyone keeping a record alive.', code: 'src/lib/write.ts', path: 'src/lib/write.ts' },
  { feature: 'Creation flags', sees: 'Records are readonly (text never changes) and open to anyone’s extension; orders can only be confirmed by their filer.', code: 'src/lib/write.ts', path: 'src/lib/write.ts' },
  { feature: 'Ownership transfer', sees: 'The archive is handed to 0x…dEaD: nobody can delete it, us included. Every record’s page says it is sealed and who filed it.', code: 'scripts/seal.ts', path: 'scripts/seal.ts' },
  { feature: 'Batch writes', sees: 'An order and its permanent record are filed and sealed in one transaction; corrections went in nine at a time.', code: 'src/lib/write.ts', path: 'src/lib/write.ts' },
  { feature: 'Typed attributes vs payload', sees: 'Filters by state, type and date run on Arkiv; the order’s reason, authority and sources ride in the payload.', code: 'arkiv/schema.md', path: 'arkiv/schema.md' },
  { feature: 'Queries (equality, u64 ranges)', sees: 'The register’s state and year filters, “issued after”, and the exact query printed under each view.', code: 'src/lib/arkiv.ts', path: 'src/lib/arkiv.ts' },
  { feature: '$creator / $owner', sees: '“Filed by the registrar” vs “community transcription”; a stranger’s correction can’t hide a record.', code: 'src/lib/arkiv.ts', path: 'src/lib/arkiv.ts' },
  { feature: 'atBlock', sees: 'The drill’s rewind and the evidence that a lapsed order existed at its own block.', code: 'src/pages/Drill.tsx', path: 'src/pages/Drill.tsx' },
  { feature: 'Delete', sees: '“Withdraw my report”: the one change an owner of a readonly entity can still make. A sealed record has no owner who could.', code: 'src/lib/write.ts', path: 'src/lib/write.ts' },
  { feature: 'WebSocket entity events', sees: 'The Live wire: a filing, a report or a confirmation shows for everyone within seconds.', code: 'src/lib/store.ts', path: 'src/lib/store.ts' },
]

type Check = { id: string; title: string; claim: string; run: () => Promise<Verdict> }

export function ProofPage() {
  const live = useRegister('live')
  const t = useT()
  // one sealed record, picked at random, is the subject of the write checks
  const pick = useMemo<Record_ | null>(() => {
    const sealed = live.records.filter((r) => r.official && r.sealed)
    return sealed.length ? sealed[Math.floor(Math.random() * sealed.length)] : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.records.length])
  const ours = useMemo(() => new Set([...live.orders, ...live.records, ...live.reports].map((x) => x.key.toLowerCase())), [live.orders, live.records, live.reports])
  const [results, setResults] = useState<Record<string, Verdict | 'running' | { error: string }>>({})

  const need = <T,>(r: T | null): T => {
    if (!r) throw new Error(t('The register is still loading from Arkiv. Try again in a moment.'))
    return r
  }
  const checks: Check[] = [
    { id: 'delete', title: 'Nobody can delete the archive, not even us.', claim: 'Our registrar filed this record. We ask Arkiv to let the registrar delete it.', run: () => tryDelete(need(pick)) },
    { id: 'shorten', title: 'Nobody can cut a record’s life short.', claim: 'We ask Arkiv to bring the record’s expiry a day forward.', run: () => tryShorten(need(pick)) },
    { id: 'extend', title: 'Anyone can keep it alive.', claim: 'A brand-new address, with no link to us, asks to extend the record by a day.', run: () => tryStrangerExtend(need(pick)) },
    { id: 'flags', title: 'Every record is readonly, open to extension and sealed.', claim: 'The flags and owner of every record in the archive, as Arkiv returns them.', run: async () => flagsOf(live.records, live.superseded) },
    { id: 'lapse', title: 'A lapsed order is gone now and on record at its own block.', claim: 'A drill order filed on 11 Oct to live 30 blocks. We ask for it today, and at the block it was filed.', run: lapsedButOnRecord },
    { id: 'batch', title: 'One transaction, many operations.', claim: 'The nine name-free corrections were created and handed to 0x…dEaD in a single transaction. We read its receipt.', run: oneTransaction },
    { id: 'events', title: 'Arkiv pushes changes as they happen.', claim: 'We open Arkiv’s WebSocket for eight seconds and count the entity events it sends.', run: () => listen(8, ours) },
  ]
  const run = async (c: Check) => {
    setResults((r) => ({ ...r, [c.id]: 'running' }))
    try {
      const v = await c.run()
      setResults((r) => ({ ...r, [c.id]: v }))
    } catch (e) {
      setResults((r) => ({ ...r, [c.id]: { error: errText(e) || String(e) } }))
    }
  }
  const runAll = async () => {
    for (const c of checks) await run(c)
  }
  const done = checks.filter((c) => typeof results[c.id] === 'object' && 'ok' in (results[c.id] as object))
  const passed = done.filter((c) => (results[c.id] as Verdict).ok).length
  // finished includes a check that couldn't run; while any is still asking, the count says so
  const finished = checks.filter((c) => results[c.id] && results[c.id] !== 'running').length
  const running = checks.some((c) => results[c.id] === 'running')

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px', display: 'grid', gap: 36 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="chip sodium">{t('Proof')}</span>
        <h1 className="h2">{t('Don’t take our word for it. Ask Arkiv.')}</h1>
        <p className="lede">{t('Each button below asks the network, from your browser, whether something this site claims is true right now. The write checks are simulations: Arkiv runs the transaction as that address and answers, but nothing is signed or sent, so press them all.')}</p>
        <div className="row">
          <button className="btn primary" onClick={() => void runAll()}>{t('Run every check')}</button>
          {(running || done.length > 0) && (
            <span className="chip num" role="status">
              {running
                ? tf('{done} of {n} checks done…', { done: finished, n: checks.length })
                : finished < checks.length
                  ? tf('{passed} of {n} checks hold · {left} not run', { passed, n: done.length, left: checks.length - finished })
                  : done.length === checks.length
                    ? tf('{passed} of {n} checks hold', { passed, n: checks.length })
                    : tf('{passed} of {n} checks hold · {k} couldn’t run', { passed, n: checks.length, k: finished - done.length })}
            </span>
          )}
          {pick && <Link to={`/e/${pick.key}`} className="chip">{tf('Record under test: {state}, {date}', { state: t(pick.stateName), date: new Date(pick.starts * 1000).toISOString().slice(0, 10) })}</Link>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {checks.map((c) => {
          const r = results[c.id]
          return (
            <div key={c.id} className="panel" style={{ display: 'grid', gap: 10 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ display: 'grid', gap: 6, flex: '1 1 320px' }}>
                  <h2 className="h3">{t(c.title)}</h2>
                  <p className="mute" style={{ margin: 0 }}>{t(c.claim)}</p>
                </div>
                <button className="btn small" disabled={r === 'running'} onClick={() => void run(c)}>{r === 'running' ? t('Asking Arkiv…') : r ? t('Check again') : t('Check now')}</button>
              </div>
              {r && r !== 'running' && ('error' in r ? (
                <p className="hint" style={{ color: 'var(--vermilion)', margin: 0 }}>{tf('Couldn’t check just now: {error}', { error: r.error.slice(0, 200) })}</p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  <span className={`chip ${r.ok ? 'sodium' : 'red'}`} style={{ justifySelf: 'start' }}>{r.ok ? t('Holds') : t('Does not hold')}</span>
                  <pre className="code">{r.observed.join('\n')}</pre>
                  <pre className="code" style={{ opacity: 0.75 }}>{r.call}</pre>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="section-head" style={{ marginBottom: 0 }}>
        <h2 className="h2">{t('Every Arkiv feature, and what it changes for the person using it')}</h2>
        <p className="lede">{t('No feature is here for show: each row is something a reader, a reporter or a filer sees on this site.')}</p>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>{t('Arkiv feature')}</th><th>{t('What you see')}</th><th>{t('Code')}</th></tr></thead>
          <tbody>
            {FEATURES.map((f) => (
              <tr key={f.feature}><td><b>{t(f.feature)}</b></td><td>{t(f.sees)}</td><td><a href={GH + f.path}>{f.code}</a></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{tx('Transactions to look at yourself: the batch {batch}; the lapsed drill order {lapse}. More in {data} and {friction}.', {
        batch: <a href={`${EXPLORER}/tx/${BATCH_TX}`}>{BATCH_TX.slice(0, 12)}…</a>,
        lapse: <Link to={`/e/${EVIDENCE.key}`}>{EVIDENCE.key.slice(0, 12)}…</Link>,
        data: <Link to="/data">{t('Data & mirrors')}</Link>,
        friction: <a href="https://github.com/RohanGlitched/switched-off/blob/main/arkiv/friction.md">friction.md</a>,
      })}</p>
    </section>
  )
}
