import { useEffect, useMemo, useState } from 'react'
import { districtsOf, loadGeo, STATES, type Geo } from '../lib/geo'
import { fileReport, REPORT_LIFE } from '../lib/write'
import { enqueue, flush, queued } from '../lib/queue'
import { refresh, useRegister } from '../lib/store'
import { carriers, short, txUrl } from '../lib/fmt'
import { Link, go, param } from '../lib/router'
import { ReportCard, humanError } from './Entity'
import { toast } from '../components/Toast'
import type { Net, Report } from '../lib/arkiv'
import { witnessName, account, forgetKey } from '../lib/wallet'
import { useT } from '../lib/i18n'

import { personalData } from '../lib/pii'

export function ReportPage({ net = 'live' as Net }: { net?: Net }) {
  const reg = useRegister(net)
  const t = useT()
  const [geo, setGeo] = useState<Geo | null>(null)
  const pre = param('d')
  const [state, setState] = useState(pre ? pre.split('-')[0] : '')
  const [district, setDistrict] = useState('')
  const [carrier, setCarrier] = useState('Jio')
  const [status, setStatus] = useState<Report['status']>('down')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ key: string; tx: string } | null>(null)
  const [pending, setPending] = useState(queued().length)
  useEffect(() => void loadGeo().then((g) => {
    setGeo(g)
    if (pre) {
      const d = g.districts.find((x) => x.id === pre)
      if (d) { setState(d.code); setDistrict(d.name) }
    }
  }), [pre])
  useEffect(() => {
    const on = () => void flush((n) => { toast(`Signal’s back: sent ${n} report${n > 1 ? 's' : ''} you made while offline.`); setPending(queued().length); void refresh(net) })
    window.addEventListener('online', on)
    on()
    return () => window.removeEventListener('online', on)
  }, [net])

  const districts = useMemo(() => (geo && state ? districtsOf(geo, state) : []), [geo, state])
  const nearby = useMemo(() => reg.reports.filter((r) => !state || r.state === state).sort((a, b) => b.seen - a.seen).slice(0, 8), [reg.reports, state])
  const piiWarn = personalData(note)
  const [cooling, setCooling] = useState(false)

  const submit = async () => {
    if (!state || !district) return toast('Pick your state and district first.')
    if (piiWarn) return toast('Take out the phone number or ID: reports are public and permanent until they fade.')
    const input = { net, state, district, carrier, status, note: note.trim() }
    if (!navigator.onLine) {
      enqueue(input)
      setPending(queued().length)
      toast('No connection. Your report is saved on this phone with the time you saw it, and goes out the moment the signal returns.')
      return
    }
    setBusy(true)
    try {
      const r = await fileReport(input)
      setDone({ key: r.key, tx: r.txHash })
      setCooling(true)
      window.setTimeout(() => setCooling(false), 30_000)
      setNote('')
      void refresh(net)
      toast('Filed on Arkiv. Neighbours can now confirm it.')
    } catch (e) {
      const m = humanError(e)
      if (/didn’t answer|fetch|network/i.test(m)) {
        enqueue(input)
        setPending(queued().length)
        toast('Arkiv could not be reached, so the report is saved here and will be sent when the connection is back.')
      } else toast(m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="chip red">{net === 'drill' ? 'Report · drill (sandbox, not the live register)' : 'Report'}</span>
            <h1 className="h2">{t('Is your internet off?')}</h1>
            <p className="lede">{t('Say where and on which network. No sign-up and no name: this browser holds a throwaway key, and the report is owned by it.')} {t('It fades unless someone nearby confirms it.') === 'It fades unless someone nearby confirms it.' ? `It fades in ${net === 'drill' ? 'six minutes' : `${REPORT_LIFE.live / 3600} hours`} unless someone nearby confirms it.` : t('It fades unless someone nearby confirms it.')}</p>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <div className="seg" role="group" aria-label="What are you seeing">
              {([['down', 'No internet'], ['slow', 'Barely working'], ['back', 'It’s back']] as const).map(([k, v]) => (
                <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{t(v)}</button>
              ))}
            </div>
            <div className="grid2" style={{ gap: 12 }}>
              <label className="field">{t('State or UT')}
                <select className="input" value={state} onChange={(e) => { setState(e.target.value); setDistrict('') }}>
                  <option value="">{t('Choose…')}</option>
                  {Object.entries(STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="field">{t('District')}
                <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state}>
                  <option value="">{state ? t('Choose…') : t('Pick a state first')}</option>
                  {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <label className="field">{t('Network')}
              <div className="seg" role="group" aria-label="Network">
                {carriers.map((c) => <button key={c} aria-pressed={carrier === c} onClick={() => setCarrier(c)}>{c}</button>)}
              </div>
            </label>
            <label className="field">{t('What you see (optional, 140 characters)')}
              <textarea className="input" rows={2} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mobile data gone since morning; broadband still working" aria-invalid={!!piiWarn} aria-describedby="note-hint" />
              {piiWarn ? <span id="note-hint" className="hint" role="alert" style={{ color: 'var(--vermilion)' }}>That looks like {piiWarn}. Remove it: reports are public and permanent.</span> : <span id="note-hint" className="hint">{t('Never include names, phone numbers or exact addresses.')}</span>}
            </label>
            <button className="btn primary" disabled={busy || !district || !!piiWarn || cooling} onClick={submit}>{busy ? t('Writing to Arkiv… (about 8 seconds)') : cooling ? 'Filed ✓ (one report per district is enough; neighbours confirm it)' : !district ? t('Choose a district to report') : t('File this report')}</button>
            {pending > 0 && <p className="hint" style={{ margin: 0 }}>{pending} report{pending > 1 ? 's' : ''} saved on this phone, waiting for a connection.</p>}
            {done && (
              <p className="hint" style={{ margin: 0 }}>Filed as <Link to={`/e/${done.key}`}>{short(done.key)}</Link> in transaction <a href={txUrl(done.tx)}>{short(done.tx)}</a>, signed by {witnessName(account.address)}.</p>
            )}
          </div>
          <div className="panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
            <b style={{ fontSize: 15 }}>Your safety</b>
            <p className="hint" style={{ margin: 0 }}>Reports carry no name, number or location finer than a district. The only link between this phone and what it filed is the throwaway key in this browser ({witnessName(account.address)}). Forget it before handing your phone to anyone; your reports stay on the register, but nothing on the phone points to them.</p>
            <button className="btn small danger" style={{ justifySelf: 'start' }} onClick={() => { if (confirm('Forget this browser’s key? Reports you filed stay public, but you can no longer withdraw them from this phone.')) forgetKey() }}>Forget this browser’s key</button>
          </div>
          {net === 'live' && <p className="hint">Just trying it out? <Link to="/report?drill=1">Use the drill version of this form</Link>: same entities, kept off the live map.</p>}
          <p className="hint">{t('In a real blackout, this page works offline once it has been opened: reports are kept on the phone with the time they were made and sent when the signal comes back, marked as late.')}</p>
        </div>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <h2 className="h3">{state ? `Live reports in ${STATES[state]}` : t('Live reports across India')}</h2>
          {reg.loading && <div className="skel" style={{ height: 160 }} />}
          {!reg.loading && nearby.length === 0 && <div className="empty">No live reports{state ? ` in ${STATES[state]}` : ''}. Reports fade unless confirmed, so this list only ever shows what people are seeing now.</div>}
          {nearby.map((r) => (
            <div key={r.key} style={{ display: 'grid', gap: 8 }}>
              <ReportCard r={r} />
              <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => go(`/e/${r.key}`)}>Confirm or inspect</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
