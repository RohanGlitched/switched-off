// "Cite this order": a permalink, a plain-text citation and a one-line curl that re-reads the entity
// from Arkiv, each with a Copy button. Everything here is built in the browser from what Arkiv
// returned; nothing is written anywhere.
import { useId, useState } from 'react'
import type { Order, Record_ } from '../lib/arkiv'
import { citationText, curlForKey, permalink } from '../lib/cite'
import { getLang, tr, useT } from '../lib/i18n'
import { toast } from './Toast'

/** Copy to the clipboard; on old browsers or plain http, through a hidden textarea. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Save text as a file, in the browser only (a Blob and an object URL). */
export function downloadText(name: string, mime: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function CopyButton({ text, label, what, className = 'btn small' }: { text: string | (() => string); label?: string; what?: string; className?: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const onClick = async () => {
    const ok = await copyText(typeof text === 'function' ? text() : text)
    if (ok) {
      setDone(true)
      window.setTimeout(() => setDone(false), 2000)
      toast(what ? `${tr('Copied:')} ${what}` : tr('Copied.'))
    } else toast(tr('Couldn’t copy. Select the text and copy it yourself.'))
  }
  return (
    <button type="button" className={className} onClick={onClick} aria-label={what ? `${t('Copy')}: ${what}` : undefined}>
      {done ? t('Copied ✓') : label ?? t('Copy')}
    </button>
  )
}

/** A labelled block of text to copy: the label names the Copy button for screen readers. */
function Copyable({ label, text, mono = true }: { label: string; text: string; mono?: boolean }) {
  const hid = useId()
  return (
    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
        <b id={hid} style={{ fontSize: 14 }}>{label}</b>
        <CopyButton text={text} what={label} />
      </div>
      <pre className="code" aria-labelledby={hid} tabIndex={0} style={mono ? undefined : { whiteSpace: 'pre-wrap', font: 'inherit', fontSize: 14 }}>{text}</pre>
    </div>
  )
}

export function CitePanel({ o }: { o: Order | Record_ }) {
  const t = useT()
  const lang = getLang()
  const link = permalink(o.key)
  const cite = citationText(o, { t: tr, lang })
  const curl = curlForKey(o.key)
  return (
    <section className="panel" id="cite" aria-labelledby="cite-h" style={{ display: 'grid', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <h2 id="cite-h" className="h3">{t('Cite this order')}</h2>
        <p className="mute" style={{ margin: 0, fontSize: 15 }}>{t('For a petition, a news story or a letter: the link, a citation that says where the record lives on Arkiv, and one command that reads it back from the network without this site.')}</p>
      </div>
      <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
          <b style={{ fontSize: 14 }}>{t('Permalink')}</b>
          <CopyButton text={link} what={t('Permalink')} />
        </div>
        <a href={link} className="num" style={{ overflowWrap: 'anywhere', fontSize: 14 }}>{link}</a>
      </div>
      <Copyable label={t('Citation')} text={cite} mono={false} />
      <Copyable label={t('Re-read it from Arkiv')} text={curl} />
      <p className="hint" style={{ margin: 0 }}>{t('Runs in any shell with curl. Arkiv answers with the entity as stored: its payload comes back hex-encoded JSON, its owner, creator and expiry block as they are on the chain.')}</p>
    </section>
  )
}
