// Live view of the register: one load, then Arkiv's entity events keep it current.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Hex } from 'viem'
import { activeOrders, eventsClient, liveReports, records, syncClock, type Net, type Order, type Record_, type Report } from './arkiv'

export type WireItem = { id: string; at: number; kind: 'created' | 'extended' | 'deleted' | 'patched' | 'transferred'; key: Hex; block: bigint }
export type Snapshot = { orders: Order[]; records: Record_[]; reports: Report[]; loadedAt: number; error: string | null; loading: boolean }

const empty: Snapshot = { orders: [], records: [], reports: [], loadedAt: 0, error: null, loading: true }
const snaps: Record<Net, Snapshot> = { live: { ...empty }, drill: { ...empty } }
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())
let wire: WireItem[] = []
let pending: WireItem[] = []
function settlePending() {
  if (!pending.length) return
  const mine = new Set<string>()
  for (const n of ['live', 'drill'] as Net[]) for (const x of [...snaps[n].orders, ...snaps[n].records, ...snaps[n].reports]) mine.add(x.key.toLowerCase())
  const keep = pending.filter((p) => mine.has(p.key.toLowerCase()))
  pending = pending.filter((p) => !mine.has(p.key.toLowerCase()) && Date.now() - p.at < 60_000)
  if (keep.length) wire = [...keep.reverse(), ...wire].slice(0, 40)
}
const inflight: Partial<Record<Net, Promise<void>>> = {}

export async function refresh(net: Net) {
  if (inflight[net]) return inflight[net]
  inflight[net] = (async () => {
    try {
      await syncClock()
      const [o, r, p] = await Promise.all([activeOrders(net), records(net), liveReports(net)])
      snaps[net] = { orders: o, records: r, reports: p, loadedAt: Date.now(), error: null, loading: false }
    } catch (e) {
      snaps[net] = { ...snaps[net], loading: false, error: (e as Error).message || 'Arkiv did not answer.' }
    } finally {
      delete inflight[net]
      settlePending()
      emit()
    }
  })()
  return inflight[net]
}

let watching = false
let timer: number | undefined
/** Follow Arkiv's entity events; any change to our entities triggers a (debounced) re-read. */
function watch() {
  if (watching) return
  watching = true
  const ours = new Set<string>()
  // Tiramisu's public RPC allows 600 requests a minute per IP: re-read quickly for our own
  // entities, but at most every 8 s when a stranger's entity appears (other apps write constantly)
  let lastRead = 0
  const bump = (urgent = false) => {
    clearTimeout(timer)
    const wait = urgent ? 700 : Math.max(700, 8000 - (Date.now() - lastRead))
    timer = window.setTimeout(() => {
      lastRead = Date.now()
      void refresh('live')
      void refresh('drill')
    }, wait)
  }
  const keysNow = () => {
    for (const n of ['live', 'drill'] as Net[]) for (const x of [...snaps[n].orders, ...snaps[n].records, ...snaps[n].reports]) ours.add(x.key.toLowerCase())
  }
  try {
    eventsClient().watchEntityEvents({
      onEvent: (ev) => {
        keysNow()
        const key = (ev as { entityKey: Hex }).entityKey
        const kind = ({ EntityCreated: 'created', ExpiryExtended: 'extended', EntityDeleted: 'deleted', EntityPatched: 'patched', OwnershipTransferred: 'transferred' } as const)[ev.type as 'EntityCreated']
        const item: WireItem = { id: `${ev.transactionHash}-${ev.logIndex}`, at: Date.now(), kind, key, block: ev.blockNumber }
        // a new entity is a stranger's until we've read it: hold it, re-read, keep it if it's ours
        if (ev.type === 'EntityCreated') {
          pending.push(item)
          return bump(false)
        }
        if (!ours.has(key.toLowerCase())) return
        wire = [item, ...wire].slice(0, 40)
        bump(true)
      },
      onError: () => {
        /* the watcher retries; the page keeps its last snapshot */
      },
      pollingInterval: 3000,
    })
  } catch {
    window.setInterval(() => bump(false), 15000)
  }
  // expiry has no event: re-read on a slow beat so lapsed orders leave the map on time
  window.setInterval(() => bump(false), 30000)
}

export function useRegister(net: Net): Snapshot {
  const s = useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => snaps[net],
  )
  useEffect(() => {
    if (!snaps[net].loadedAt) void refresh(net)
    watch()
  }, [net])
  return s
}

export function useWire(): WireItem[] {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => wire,
  )
}

/** A clock that ticks once a second, for countdowns. */
export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now())
  const r = useRef<number | undefined>(undefined)
  useEffect(() => {
    r.current = window.setInterval(() => setN(Date.now()), ms)
    return () => clearInterval(r.current)
  }, [ms])
  return n
}

/** After our own write: re-read now, not on the slow beat. */
export const refreshSoon = () => {
  void refresh('live')
  void refresh('drill')
}

export function getSnapshot(net: Net) {
  return snaps[net]
}
