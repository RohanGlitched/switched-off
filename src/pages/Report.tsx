import { useEffect, useMemo, useState } from 'react'
import { districtsOf, loadGeo, STATES, type Geo } from '../lib/geo'
import { fileReport, REPORT_LIFE } from '../lib/write'
import { enqueue, flush, queued } from '../lib/queue'
import { refresh, useRegister } from '../lib/store'
import { carrierName, carriers, short, txUrl } from '../lib/fmt'
import { Link, go, param } from '../lib/router'
import { ReportCard, humanError, humanErrorEn } from './Entity'
import { toast } from '../components/Toast'
import type { Net, Report } from '../lib/arkiv'
import { witnessName, account, forgetKey } from '../lib/wallet'
import { LANGS, dirOf, setLang, tf, tp, tr, tx, useLang, useT } from '../lib/i18n'

import { personalData } from '../lib/pii'
import { useMapState } from '../components/NightMap'
import { RtiPanel } from '../components/Rti'

export function ReportPage({ net = 'live' as Net }: { net?: Net }) {
  const reg = useRegister(net)
  const t = useT()
  const lang = useLang()
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
    const on = () => void flush((n) => { toast(tp(n, 'Signal’s back: sent {n} report you made while offline.', 'Signal’s back: sent {n} reports you made while offline.')); setPending(queued().length); void refresh(net) })
    window.addEventListener('online', on)
    on()
    return () => window.removeEventListener('online', on)
  }, [net])

  const districts = useMemo(() => (geo && state ? districtsOf(geo, state) : []), [geo, state])
  const nearby = useMemo(() => reg.reports.filter((r) => !state || r.state === state).sort((a, b) => b.seen - a.seen).slice(0, 8), [reg.reports, state])
  const piiWarn = personalData(note)
  const [cooling, setCooling] = useState(false)
  // a district reported dark (or about to be) with no order in force on the register: offer the RTI request for it
  const map = useMapState(geo, reg.orders, reg.reports)
  const dIndex = geo && state && district ? geo.districts.findIndex((d) => d.code === state && d.name === district) : -1
  const darkReports = dIndex >= 0 ? map.flagged.get(dIndex) ?? [] : []
  // only once the orders in force have been read: "no order" must mean Arkiv said so
  const askForOrder = net === 'live' && !reg.loading && !reg.error && dIndex >= 0 && !map.off.has(dIndex) && (darkReports.length > 0 || status !== 'back')
  const nowS = Math.floor(Date.now() / 1000)
  const darkSince = darkReports.length ? Math.min(...darkReports.map((r) => r.seen)) : nowS

  const submit = async () => {
    if (!state || !district) return toast(tr('Pick your state and district first.'))
    if (piiWarn) return toast(tr('Take out the phone number or ID: reports are public and permanent until they fade.'))
    const input = { net, state, district, carrier, status, note: note.trim() }
    if (!navigator.onLine) {
      enqueue(input)
      setPending(queued().length)
      toast(tr('No connection. Your report is saved on this phone with the time you saw it, and goes out the moment the signal returns.'))
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
      toast(tr('Filed on Arkiv. Neighbours can now confirm it.'))
    } catch (e) {
      const m = humanError(e)
      if (/didn’t answer|fetch|network/i.test(humanErrorEn(e))) {
        enqueue(input)
        setPending(queued().length)
        toast(tr('Arkiv could not be reached, so the report is saved here and will be sent when the connection is back.'))
      } else toast(m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }} dir={dirOf(lang)} lang={lang}>
      {/* the people who need this form most read Urdu in Kashmir, Bengali and Assamese in the north-east, Punjabi, Odia */}
      <nav className="langs" aria-label={t('Report in your language')}>
        <span className="hint">{t('Report in your language')}</span>
        {LANGS.map(([l, name]) => <button key={l} className="lang" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{name}</button>)}
      </nav>
      {lang !== 'en' && lang !== 'hi' && <p className="hint" style={{ marginTop: 0 }}>{t('Machine-drafted translation, not yet checked by a native speaker. Corrections are welcome on GitHub.')} {t('The report form is in your language; the rest of the site is in English or Hindi for now.')}</p>}
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="chip red">{net === 'drill' ? t('Report · drill (sandbox, not the live register)') : t('Report')}</span>
            <h1 className="h2">{t('Is your internet off?')}</h1>
            <p className="lede">{t('Say where and on which network. No sign-up and no name: this browser holds a throwaway key, and the report is owned by it.')} {tf('It fades in {time} unless someone nearby confirms it.', { time: net === 'drill' ? t('six minutes') : tf('{n} hours', { n: REPORT_LIFE.live / 3600 }) })}</p>
          </div>
          <div className="panel" style={{ display: 'grid', gap: 14 }}>
            <div className="seg" role="group" aria-label={t('What are you seeing')}>
              {([['down', 'No internet'], ['slow', 'Barely working'], ['back', 'It’s back']] as const).map(([k, v]) => (
                <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{t(v)}</button>
              ))}
            </div>
            <div className="grid2" style={{ gap: 12 }}>
              <label className="field">{t('State or UT')}
                <select className="input" value={state} onChange={(e) => { setState(e.target.value); setDistrict('') }}>
                  <option value="">{t('Choose…')}</option>
                  {Object.entries(STATES).sort((a, b) => t(a[1]).localeCompare(t(b[1]))).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
                </select>
              </label>
              <label className="field">{t('District')}
                <select className="input" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={!state}>
                  <option value="">{state ? t('Choose…') : t('Pick a state first')}</option>
                  {districts.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </label>
            </div>
            <div className="field">
              <span id="report-network">{t('Network')}</span>
              <div className="seg" role="group" aria-labelledby="report-network">
                {carriers.map((c) => <button key={c} aria-pressed={carrier === c} onClick={() => setCarrier(c)}>{carrierName(c)}</button>)}
              </div>
            </div>
            <label className="field">{t('What you see (optional, 140 characters)')}
              <textarea className="input" rows={2} maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Mobile data gone since morning; broadband still working')} aria-invalid={!!piiWarn} aria-describedby="note-hint" />
              {piiWarn ? <span id="note-hint" className="hint" role="alert" style={{ color: 'var(--vermilion)' }}>{tf('That looks like {what}. Remove it: reports are public and permanent.', { what: t(piiWarn.startsWith("a person's name") ? "a person's name (reports never need a name)" : piiWarn) })}</span> : <span id="note-hint" className="hint">{t('Never include names, phone numbers or exact addresses.')}</span>}
            </label>
            <button className="btn primary" disabled={busy || !district || !!piiWarn || cooling} onClick={submit}>{busy ? t('Writing to Arkiv… (about 8 seconds)') : cooling ? t('Filed ✓ (one report per district is enough; neighbours confirm it)') : !district ? t('Choose a district to report') : t('File this report')}</button>
            {pending > 0 && <p className="hint" style={{ margin: 0 }}>{tp(pending, '{n} report saved on this phone, waiting for a connection.', '{n} reports saved on this phone, waiting for a connection.')}</p>}
            {done && (
              <p className="hint" style={{ margin: 0 }}>{tx('Filed as {key} in transaction {tx}, signed by {witness}.', { key: <Link to={`/e/${done.key}`}>{short(done.key)}</Link>, tx: <a href={txUrl(done.tx)}>{short(done.tx)}</a>, witness: witnessName(account.address) })}</p>
            )}
          </div>
          {askForOrder && (
            <RtiPanel
              key={`${state}|${district}`}
              state={state}
              stateName={STATES[state] ?? state}
              districts={[district]}
              from={darkSince}
              to={nowS}
              why={darkReports.length ? tp(darkReports.length, '{n} live report says {district} has no internet, and no order covering it is on the register.', '{n} live reports say {district} has no internet, and no order covering it is on the register.', { district }) : tf('No order covering {district} is in force on the register.', { district })}
              dark
            />
          )}
          <div className="panel" style={{ padding: 16, display: 'grid', gap: 8 }}>
            <b style={{ fontSize: 15 }}>{t('Your safety')}</b>
            <p className="hint" style={{ margin: 0 }}>{tf('Reports carry no name, number or location finer than a district. The only link between this phone and what it filed is the throwaway key in this browser ({witness}). Forget it before handing your phone to anyone; your reports stay on the register, but nothing on the phone points to them.', { witness: witnessName(account.address) })}</p>
            <button className="btn small danger" style={{ justifySelf: 'start' }} onClick={() => { if (confirm(tr('Forget this browser’s key? Reports you filed stay public, but you can no longer withdraw them from this phone.'))) forgetKey() }}>{t('Forget this browser’s key')}</button>
          </div>
          {net === 'live' && <p className="hint">{tx('Just trying it out? {link}: same entities, kept off the live map.', { link: <Link to="/report?drill=1">{t('Use the drill version of this form')}</Link> })}</p>}
          <p className="hint">{t('In a real blackout, this page works offline once it has been opened: reports are kept on the phone with the time they were made and sent when the signal comes back, marked as late.')}</p>
        </div>
        <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
          <h2 className="h3">{state ? tf('Live reports in {state}', { state: t(STATES[state] ?? state) }) : t('Live reports across India')}</h2>
          {reg.loading && <div className="skel" style={{ height: 160 }} />}
          {!reg.loading && nearby.length === 0 && <div className="empty">{state ? tf('No live reports in {state}. Reports fade unless confirmed, so this list only ever shows what people are seeing now.', { state: t(STATES[state] ?? state) }) : t('No live reports. Reports fade unless confirmed, so this list only ever shows what people are seeing now.')}</div>}
          {nearby.map((r) => (
            <div key={r.key} style={{ display: 'grid', gap: 8 }}>
              <ReportCard r={r} />
              <button className="btn small" style={{ justifySelf: 'start' }} onClick={() => go(`/e/${r.key}`)}>{t('Confirm or inspect')}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
