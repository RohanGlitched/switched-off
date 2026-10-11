// Live view of the register: one load, then Arkiv's entity events keep it current.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Hex } from 'viem'
import { activeOrders, blockToTime, currentBlock, eventsClient, liveReports, pollingClient, records, syncClock, type Net, type Order, type Record_, type Report } from './arkiv'

export type WireItem = { id: string; at: number; kind: 'created' | 'extended' | 'deleted' | 'patched' | 'transferred' | 'expired'; key: Hex; block: bigint; text?: string }
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

const recordsReadAt: Partial<Record<Net, number>> = {}
/**
 * Re-read a net. Orders and reports are small and change often; the archive of records is the
 * heavy read and changes only when something is filed, so it is re-read when our own write says so
 * or at most every five minutes (`light` skips it).
 */
export async function refresh(net: Net, light = false) {
  if (inflight[net]) return inflight[net]
  inflight[net] = (async () => {
    try {
      await syncClock()
      const before = snaps[net]
      const wantRecords = !light || !before.loadedAt || Date.now() - (recordsReadAt[net] ?? 0) > 300_000
      const [o, p, r] = await Promise.all([activeOrders(net), liveReports(net), wantRecords ? records(net) : Promise.resolve(before.records)])
      if (wantRecords) recordsReadAt[net] = Date.now()
      // an order that was on screen and is now gone past its expiry lapsed on Arkiv's clock: say so
      const head = currentBlock()
      const still = new Set(o.map((x) => x.key.toLowerCase()))
      for (const old of before.orders)
        if (!still.has(old.key.toLowerCase()) && old.expiresAt <= head + 6n)
          wire = [{ id: `expired-${old.key}`, at: Date.now(), kind: 'expired' as const, key: old.key, block: old.expiresAt, text: `${net === 'drill' ? 'Drill: ' : ''}Order lapsed on Arkiv's clock: ${old.stateName}, ${old.districts.length === 1 ? old.districts[0] : `${old.districts.length} districts`} relit. Nobody deleted it; its expiry block arrived.` }, ...wire].slice(0, 40)
      snaps[net] = { orders: o, records: r, reports: p, loadedAt: Date.now(), error: null, loading: false }
    } catch (e) {
      snaps[net] = { ...snaps[net], loading: false, error: (e as Error).message || 'Arkiv did not answer.' }
    } finally {
      delete inflight[net]
      settlePending()
      emit()
      scheduleExpiry()
    }
  })()
  return inflight[net]
}

let expiryTimer: number | undefined
/**
 * Expiry emits no event, so the next re-read is timed to the soonest expiry on screen (an order
 * lapsing, a report fading) instead of a blind loop; a slow safety beat covers clock drift.
 */
function scheduleExpiry() {
  clearTimeout(expiryTimer)
  let next = Infinity
  for (const n of ['live', 'drill'] as Net[])
    for (const x of [...snaps[n].orders, ...snaps[n].reports]) {
      const t = blockToTime(x.expiresAt)
      if (t > Date.now()) next = Math.min(next, t)
    }
  const wait = Number.isFinite(next) ? Math.min(Math.max(next - Date.now() + 1500, 1500), 180_000) : 180_000
  expiryTimer = window.setTimeout(() => {
    void refresh('live')
    void refresh('drill')
  }, wait)
}

let watching = false
let timer: number | undefined
/** Follow Arkiv's entity events; any change to our entities triggers a (debounced) re-read. */
function watch() {
  if (watching) return
  watching = true
  const ours = new Set<string>()
  // Re-read quickly for our own entities. A stranger's entity (other apps write constantly) only
  // earns a light re-read, orders and reports, at most every 20 s, so an idle tab stays cheap.
  let lastRead = 0
  const bump = (urgent = false) => {
    clearTimeout(timer)
    const wait = urgent ? 700 : Math.max(700, 20_000 - (Date.now() - lastRead))
    timer = window.setTimeout(() => {
      lastRead = Date.now()
      void refresh('live', !urgent)
      void refresh('drill', !urgent)
    }, wait)
  }
  const keysNow = () => {
    for (const n of ['live', 'drill'] as Net[]) for (const x of [...snaps[n].orders, ...snaps[n].records, ...snaps[n].reports]) ours.add(x.key.toLowerCase())
  }
  // the WebSocket first (no query budget, no polling); a node-side filter through the relay if it fails
  let fellBack = false
  const start = (client: ReturnType<typeof eventsClient>, polling: boolean) =>
    client.watchEntityEvents({
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
        if (polling || fellBack) return /* the poller retries; the page keeps its last snapshot */
        fellBack = true
        try {
          start(pollingClient(), true)
        } catch {
          window.setInterval(() => bump(false), 15000)
        }
      },
      ...(polling ? { pollingInterval: 3000 } : {}),
    })
  try {
    start(eventsClient(), false)
  } catch {
    try {
      start(pollingClient(), true)
    } catch {
      window.setInterval(() => bump(false), 15000)
    }
  }
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
