// Reports made while the network is down. The person saw the blackout at `seenAt`; we send the
// report the moment a connection comes back, marked "late" so readers know why it arrived then.
import { fileReport, type ReportInput } from './write'

const KEY = 'switched-off:queue'
type Item = ReportInput & { seenAt: number }
const read = (): Item[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Item[]
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
  write([...read(), { ...r, seenAt: r.seenAt ?? Date.now() }])
}

let flushing = false
export async function flush(onSent?: (n: number) => void) {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    let q = read()
    let sent = 0
    while (q.length) {
      const [head, ...rest] = q
      await fileReport({ ...head, late: true })
      q = rest
      write(q)
      sent++
    }
    if (sent) onSent?.(sent)
  } catch {
    /* still offline-ish: keep the queue for the next "online" */
  } finally {
    flushing = false
  }
}
