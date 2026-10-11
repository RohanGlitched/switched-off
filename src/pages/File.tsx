// Transcribe a published suspension order onto the live register. Anyone can: the entity is
// signed by this browser's key, so readers see a community transcription, not the registrar's.
import { useEffect, useMemo, useState } from 'react'
import { districtsOf, loadGeo, STATES, type Geo } from '../lib/geo'
import { fileOrder } from '../lib/write'
import { refresh } from '../lib/store'
import { scopeLabel, short, txUrl } from '../lib/fmt'
import { Link } from '../lib/router'
import { toast } from '../components/Toast'
import { humanError } from './Entity'
import { BASIS_LABEL } from '../lib/basis'
import type { Scope } from '../lib/arkiv'
import { personalData } from '../lib/pii'

const day = 86_400_000
const toMs = (d: string) => (d ? new Date(`${d}T00:00:00+05:30`).getTime() : 0)

export function FilePage() {
  const [geo, setGeo] = useState<Geo | null>(null)
  useEffect(() => void loadGeo().then(setGeo), [])
  const [state, setState] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [scope, setScope] = useState<Scope>('mobile-data')
  const [starts, setStarts] = useState('')
  const [ends, setEnds] = useState('')
  const [authority, setAuthority] = useState('')
  const [basis, setBasis] = useState('tsr-2024')
  const [reason, setReason] = useState('')
  const [srcTitle, setSrcTitle] = useState('')
  const [srcUrl, setSrcUrl] = useState('')
  const [published, setPublished] = useState<'yes' | 'no' | 'unknown'>('unknown')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ order: string | null; record: string; tx: string } | null>(null)
  const districts = useMemo(() => (geo && state ? districtsOf(geo, state) : []), [geo, state])
  const len = starts && ends ? Math.round((toMs(ends) - toMs(starts)) / day) : null
  const problems = [
    !state && 'Pick the state or UT.',
    !starts && 'Give the start date stated in the order.',
    ends && starts && toMs(ends) < toMs(starts) && 'The end date is before the start date.',
    !/^https:\/\/\S+\.\S+/.test(srcUrl) && 'Link the published order or reporting that cites it (https://…).',
    reason.trim().length < 10 && 'Paraphrase the reason the order gives.',
    personalData(`${reason} ${authority} ${srcTitle}`) && `Remove ${personalData(`${reason} ${authority} ${srcTitle}`)}: the register is public.`,
  ].filter(Boolean) as string[]
  const nameWarn = /\b(shri|smt|sh\.|dr\.|mr\.|mrs\.|ms\.)\s+[A-Z]/i.test(authority)

  const submit = async () => {
    if (problems.length) return toast(problems[0])
    if (nameWarn) return toast('Use the designation (e.g. "Home Secretary, Government of Manipur"), not an official’s name.')
    setBusy(true)
    try {
      const now = Date.now()
      const s = toMs(starts)
      const r = await fileOrder({
        net: 'live',
        orderId: `${state.toLowerCase()}-${starts}-${now.toString(36).slice(-4)}`,
        state,
        stateName: STATES[state],
        districts: picked.length ? picked : ['Statewide'],
        scope,
        issued: s,
        starts: s,
        ends: ends ? toMs(ends) + day - 1000 : 0,
        emergency: false,
        basis: BASIS_LABEL[basis],
        authority: authority.trim(),
        reason: reason.trim().slice(0, 280),
        renews: null,
        seq: 1,
        published: published === 'unknown' ? null : published === 'yes',
        sources: [{ title: srcTitle.trim() || srcUrl, url: srcUrl.trim() }],
      })
      setDone({ order: r.orderKey, record: r.recordKey, tx: r.txHash })
      void refresh('live')
      toast(r.orderKey ? 'Filed: the order is in force on the map until it lapses, and its record is sealed.' : 'Filed to the archive and sealed.')
    } catch (e) {
      toast(humanError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px' }}>
      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <span className="chip sodium">File an order</span>
          <h1 className="h2">Transcribe a published order.</h1>
          <p className="lede">Saw a suspension order in a gazette, a district’s website or the news? Put it on the register. It is signed by this browser’s key, labelled as a community transcription, and its archive copy is sealed straight away, so nobody can delete it afterwards, you included.</p>
          <ul className="mute" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
            <li>An order whose end date is still ahead goes on the live map and lapses on its own.</li>
            <li>Use the issuing authority’s designation, never an official’s name.</li>
            <li>Paraphrase the stated reason; link the source.</li>
            <li>Got something wrong? File again: a correction is a new entity, and both are kept.</li>
          </ul>
          <p className="hint">Practising? The <Link to="/drill">drill</Link> uses the same entities without touching the live register.</p>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 14 }}>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="field">State or UT
              <select className="input" value={state} onChange={(e) => { setState(e.target.value); setPicked([]) }}>
                <option value="">Choose…</option>
                {Object.entries(STATES).sort((a, b) => a[1].localeCompare(b[1])).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="field">What was cut
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
                {Object.entries(scopeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          </div>
          {state && (
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="mute" style={{ fontSize: 14, marginBottom: 6 }}>Districts named in the order ({picked.length || 'whole state'})</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                {districts.map((d) => {
                  const on = picked.includes(d.name)
                  return <button key={d.id} className={`chip${on ? ' sodium' : ''}`} style={{ cursor: 'pointer', background: 'none', minHeight: 36 }} aria-pressed={on} onClick={() => setPicked(on ? picked.filter((x) => x !== d.name) : [...picked, d.name])}>{d.name}</button>
                })}
              </div>
            </fieldset>
          )}
          <div className="grid2" style={{ gap: 12 }}>
            <label className="field">Starts<input className="input" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} /></label>
            <label className="field">Ends (as stated)<input className="input" type="date" value={ends} onChange={(e) => setEnds(e.target.value)} /></label>
          </div>
          {len !== null && len > 15 && <p className="hint" style={{ margin: 0, color: 'var(--vermilion)' }}>{len} days: longer than the fifteen days one order may run (since November 2020). If that is what the order says, file it as written; the register will show it.</p>}
          <label className="field">Issuing authority (designation)
            <input className="input" value={authority} onChange={(e) => setAuthority(e.target.value)} placeholder="Home Department, Government of Manipur" />
            {nameWarn && <span className="hint" style={{ color: 'var(--vermilion)' }}>That looks like a person’s name. Use the designation.</span>}
          </label>
          <label className="field">Legal basis
            <select className="input" value={basis} onChange={(e) => setBasis(e.target.value)}>
              {Object.entries(BASIS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="field">Reason the order gives (paraphrase)
            <textarea className="input" rows={2} maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="To prevent the spread of rumours on social media during unrest" />
          </label>
          <div className="grid2" style={{ gap: 12 }}>
            <label className="field">Source link<input className="input" value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="https://…" inputMode="url" /></label>
            <label className="field">Source title<input className="input" value={srcTitle} onChange={(e) => setSrcTitle(e.target.value)} placeholder="Home Department order no. …" /></label>
          </div>
          <div className="seg" role="group" aria-label="Was the order text published">
            {(['yes', 'no', 'unknown'] as const).map((p) => <button key={p} aria-pressed={published === p} onClick={() => setPublished(p)}>{p === 'yes' ? 'Text published' : p === 'no' ? 'Not published' : 'Don’t know'}</button>)}
          </div>
          <button className="btn primary" disabled={busy} onClick={submit}>{busy ? 'Writing order and record to Arkiv…' : problems.length ? problems[0] : 'File this order'}</button>
          {done && (
            <p className="hint" style={{ margin: 0 }}>
              Filed in <a href={txUrl(done.tx)}>{short(done.tx)}</a>. Record <Link to={`/e/${done.record}`}>{short(done.record)}</Link>
              {done.order ? <> · in force as <Link to={`/e/${done.order}`}>{short(done.order)}</Link></> : null}.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
