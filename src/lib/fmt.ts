import { EXPLORER } from './arkiv'

const IST = 'Asia/Kolkata'
export const fmtDate = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '—'
export const fmtDateTime = (ms: number) =>
  ms ? new Date(ms).toLocaleString('en-IN', { day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', timeZone: IST }) + ' IST' : '—'
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: IST })

/** "3d 4h", "47m 10s", "lapsed" */
export function left(ms: number): string {
  if (ms <= 0) return 'lapsed'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${String(r).padStart(2, '0')}s`
}
export const ago = (ms: number) => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
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
/** "Statewide", "3 districts", "Imphal West" */
export const where = (ds: string[]) => (ds.some((d) => /statewide/i.test(d)) ? 'statewide' : ds.length === 1 ? ds[0] : `${ds.length} districts`)

export const carriers = ['Jio', 'Airtel', 'Vi', 'BSNL', 'Broadband', 'All networks']
