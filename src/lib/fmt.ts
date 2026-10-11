import { EXPLORER } from './arkiv'
import { getLang, locale, tf, tr } from './i18n'

const IST = 'Asia/Kolkata'
export const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '—'
export const fmtDateTime = (ms: number) =>
  ms ? new Date(ms).toLocaleString(locale(), { day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', timeZone: IST }) + ' IST' : '—'
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', timeZone: IST })

/** "3d 4h", "47m 10s", "lapsed" (in Hindi: "3 दिन 4 घंटे") */
export function left(ms: number): string {
  if (ms <= 0) return tr('lapsed')
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  const hi = getLang() === 'hi'
  if (d > 0) return hi ? `${d} दिन ${h} घंटे` : `${d}d ${h}h`
  if (h > 0) return hi ? `${h} घंटे ${m} मिनट` : `${h}h ${m}m`
  return hi ? `${m} मिनट ${String(r).padStart(2, '0')} सेकंड` : `${m}m ${String(r).padStart(2, '0')}s`
}
export const ago = (ms: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return tf('{n}s ago', { n: s })
  if (s < 3600) return tf('{n}m ago', { n: Math.floor(s / 60) })
  if (s < 86400) return tf('{n}h ago', { n: Math.floor(s / 3600) })
  return tf('{n}d ago', { n: Math.floor(s / 86400) })
}
export const days = (a: number, b: number) => Math.max(0, Math.round((b - a) / 86_400_000))
export const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`
export const txUrl = (h: string) => `${EXPLORER}/tx/${h}`
export const addrUrl = (h: string) => `${EXPLORER}/address/${h}`
export const scopeLabel: Record<string, string> = {
  'mobile-data': 'Mobile internet',
  broadband: 'Broadband',
  'all-internet': 'All internet',
  'voice-sms-too': 'Internet, calls and SMS',
  unknown: 'Internet',
}
/** "statewide", "3 districts", "Imphal West" (translated; a single district name stays as stored) */
export const where = (ds: string[]) => (ds.some((d) => /statewide/i.test(d)) ? tr('statewide') : ds.length === 1 ? ds[0] : tf('{n} districts', { n: ds.length }))
/** The label for what an order cuts, in the current language. */
export const scopeName = (k: string) => tr(scopeLabel[k] ?? scopeLabel.unknown)
/** A network name for display: brand names stay, the generic ones are translated. */
export const carrierName = (c: string) => tr(c)

export const carriers = ['Jio', 'Airtel', 'Vi', 'BSNL', 'Broadband', 'All networks']
