// "Ask for the order": a Right to Information request for a suspension order nobody published. The
// letter is written in this browser from what the register knows; it is never sent to Arkiv or to
// any server, and nothing typed into it is kept. Copy it or download it, then send it yourself.
import { useId, useMemo, useState } from 'react'
import { LEGAL, isoDay, rtiFileName, rtiLetter, rtiPortal, letterLang, type Lang } from '../lib/cite'
import { tr, trIn, useLang, useT } from '../lib/i18n'
import { CopyButton, downloadText } from './Cite'

const unixOf = (day: string) => (day ? Math.floor(new Date(`${day}T00:00:00+05:30`).getTime() / 1000) : 0)

type Props = {
  state: string
  stateName: string
  districts: string[]
  /** the period to ask about (unix seconds) */
  from: number
  to: number
  orderId?: string
  authority?: string
  /** why the page offers this: "the order text was not published", "3 reports and no order" */
  why: string
  /** a district reported dark with no order on the register, rather than a known order */
  dark?: boolean
}

export function RtiPanel({ state, stateName, districts, from, to, orderId, authority, why, dark }: Props) {
  const t = useT()
  const uid = useId()
  // the letter is in the site's language (Hindi or English) until the reader picks one here
  const siteLang = useLang()
  const [picked, setLang] = useState<Lang | null>(null)
  const lang: Lang = picked ?? letterLang(siteLang)
  const [fromDay, setFromDay] = useState(isoDay(from))
  const [toDay, setToDay] = useState(isoDay(Math.max(from, to)))
  const [edited, setEdited] = useState<string | null>(null)
  const draft = useMemo(
    () => rtiLetter({ lang, state, stateName: trIn(lang, stateName), districts, from: unixOf(fromDay), to: unixOf(toDay), orderId, authority, dark, today: Math.floor(Date.now() / 1000) }),
    [lang, state, stateName, districts, fromDay, toDay, orderId, authority, dark],
  )
  const text = edited ?? draft
  // changing a setting rewrites the letter: ask first if the reader has typed into it
  const change = (apply: () => void) => {
    if (edited !== null && edited !== draft && !confirm(tr('Rewrite the letter with this change? Your edits to it will be lost.'))) return
    setEdited(null)
    apply()
  }
  const portal = rtiPortal(state)
  return (
    <section className="panel" id="rti" aria-labelledby={`${uid}-h`} style={{ display: 'grid', gap: 14, minWidth: 0, borderColor: 'color-mix(in srgb, var(--sodium) 40%, var(--line))' }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="chip sodium" style={{ justifySelf: 'start' }}>{t('Right to Information')}</span>
        <h2 id={`${uid}-h`} className="h3">{t('Ask for the order')}</h2>
        <p className="mute" style={{ margin: 0, fontSize: 15 }}>{why} {t('Anyone in India can ask the state for it under the Right to Information Act, 2005. This drafts the request: a copy of every suspension order, the review committee’s record of its review, and when each order was published.')}</p>
      </div>
      <div className="row" style={{ alignItems: 'end', gap: 12 }}>
        <label className="field" style={{ flex: '1 1 150px' }}>{t('From')}
          <input className="input" type="date" value={fromDay} max={toDay || undefined} onChange={(e) => { const v = e.target.value; change(() => setFromDay(v)) }} />
        </label>
        <label className="field" style={{ flex: '1 1 150px' }}>{t('To')}
          <input className="input" type="date" value={toDay} min={fromDay || undefined} onChange={(e) => { const v = e.target.value; change(() => setToDay(v)) }} />
        </label>
        <div className="seg" role="group" aria-label={t('Language of the letter')}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => change(() => setLang('en'))}>English</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => change(() => setLang('hi'))} lang="hi">हिन्दी</button>
        </div>
      </div>
      <label className="field">{t('The letter (edit it here or after you download it)')}
        <textarea className="input" lang={lang} rows={18} value={text} onChange={(e) => setEdited(e.target.value)} spellCheck={false} style={{ fontSize: 15, lineHeight: 1.5, resize: 'vertical' }} aria-describedby={`${uid}-privacy`} />
      </label>
      <div className="row">
        <CopyButton className="btn small primary" text={text} label={t('Copy the letter')} what={t('the RTI letter')} />
        <button type="button" className="btn small" onClick={() => downloadText(rtiFileName({ state, districts, lang }), 'text/plain', text.replace(/\r?\n/g, '\r\n'))}>{t('Download as a text file')}</button>
        {edited !== null && edited !== draft && <button type="button" className="btn small" onClick={() => change(() => {})}>{t('Start the letter again')}</button>}
      </div>
      <p id={`${uid}-privacy`} className="hint" style={{ margin: 0 }}>
        {t('Written in your browser and never sent anywhere: not to Arkiv, not to this site. Add your name and address to the letter after you download it, and never put them in a report or a filing on Switched Off: everything on the register is public and permanent.')}
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        <b style={{ fontSize: 14 }}>{t('How to send it')}</b>
        <ul className="mute" style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'grid', gap: 4 }}>
          <li>{t('By post or by hand to the Public Information Officer of the Home Department, with the fee. Keep a copy and the postal receipt.')}</li>
          {portal ? (
            <li>{t('Online, on the state’s RTI portal:')} <a href={portal.url} target="_blank" rel="noreferrer">{portal.label}</a></li>
          ) : (
            <li>{t('This site doesn’t list an online RTI portal for this state that it has checked; post or hand delivery always works.')}</li>
          )}
          <li>{t('If the order came from the Union Home Secretary, send the same request to the Ministry of Home Affairs:')} <a href={LEGAL.centralPortal.url} target="_blank" rel="noreferrer">rtionline.gov.in</a></li>
        </ul>
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, minHeight: 32 }}>{t('Where this comes from')}</summary>
        <ul className="hint" style={{ margin: '8px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
          {LEGAL.notes.map((n) => (
            <li key={n.url + n.text}>{t(n.text)} <a href={n.url} target="_blank" rel="noreferrer">{t(n.source)}</a></li>
          ))}
        </ul>
        <p className="hint" style={{ margin: '8px 0 0' }}>{t('This is a draft, not legal advice. Fees, payment methods and portals differ by state; check the state’s RTI rules before sending.')}</p>
      </details>
    </section>
  )
}
