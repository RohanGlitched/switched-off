// Reports made while the network is down. The person saw the blackout at `seenAt`; we send the
// report the moment a connection comes back, marked "late" so readers know why it arrived then.
import { fileReport, type ReportInput } from './write'

const KEY = 'switched-off:queue'
type Item = ReportInput & { seenAt: number; id: string }
const read = (): Item[] => {
  try {
    return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Item[]).map((x) => ({ ...x, id: x.id ?? `${x.seenAt}-${x.district}` }))
  } catch {
    return []
  }
}
const write = (q: Item[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(q))
  } catch {
    /* storage blocked: nothing to keep */
  }
}
export const queued = () => read()
export function enqueue(r: ReportInput) {
  const seenAt = r.seenAt ?? Date.now()
  write([...read(), { ...r, seenAt, id: `${seenAt}-${Math.random().toString(36).slice(2, 8)}` }])
}

let flushing = false
/**
 * Send what is waiting, one report at a time. One tab flushes at a time (a Web Lock where the
 * browser has them), each item is removed by id after it lands, and a report added mid-flush stays.
 */
export async function flush(onSent?: (n: number) => void) {
  if (flushing || !navigator.onLine) return
  const run = async () => {
    flushing = true
    let sent = 0
    try {
      for (;;) {
        const [head] = read()
        if (!head) break
        await fileReport({ ...head, late: true })
        write(read().filter((x) => x.id !== head.id))
        sent++
      }
    } catch {
      /* still offline-ish: keep the queue for the next "online" */
    } finally {
      flushing = false
    }
    if (sent) onSent?.(sent)
  }
  const locks = (navigator as Navigator & { locks?: { request: (name: string, opts: { ifAvailable: boolean }, cb: (lock: unknown) => Promise<void>) => Promise<void> } }).locks
  if (locks) await locks.request('switched-off:flush', { ifAvailable: true }, async (lock) => (lock ? run() : undefined))
  else await run()
}
