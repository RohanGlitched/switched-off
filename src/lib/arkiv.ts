// Everything the app reads and writes lives on Arkiv (Tiramisu testnet). This module is the
// whole data layer: the entity types, how they map to attributes vs payload, and the queries.
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { and, eq, gt, type Expression } from '@arkiv-network/sdk/query'
import { http, webSocket, parseAbiItem, type Hex, type Account } from 'viem'

export const APP = 'switched-off'
export const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
export const WS = 'wss://rpc.tiramisu.db-chain.testnet.arkiv.network'
export const EXPLORER = 'https://tiramisu.explorer.arkiv.network'
export const BLOCK_SECONDS = 2
/** Sealed records are owned by this address. Nobody holds its key, so nobody can delete them. */
export const SEALED = '0x000000000000000000000000000000000000dEaD'
const ARKIV_ADDRESS = '0x4400000000000000000000000000000000000044'

/** "live" is the real register; "drill" is the sandbox where the law runs at one day per minute. */
export type Net = 'live' | 'drill'

/**
 * Two ways to reach Arkiv. "relay" (default) goes through this site's /api/rpc, which holds the
 * API key and shares identical reads between visitors for a few seconds. "direct" talks to the
 * public Tiramisu endpoint from your browser, with no Switched Off server in between.
 */
export type Mode = 'relay' | 'direct'
const MODE_KEY = 'switched-off:mode'
export function getMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'direct' ? 'direct' : 'relay'
  } catch {
    return 'relay'
  }
}
export function setMode(m: Mode) {
  try {
    localStorage.setItem(MODE_KEY, m)
  } catch {
    /* ignore */
  }
  location.reload()
}
export const MODE = getMode()
const RELAY = typeof location !== 'undefined' ? `${location.origin}/api/rpc` : RPC
export const ENDPOINT = MODE === 'direct' ? RPC : RELAY

export const pub = createPublicClient({ chain: tiramisu, transport: http(ENDPOINT, { batch: { wait: 30 }, retryCount: 2 }) })
let evClient: ReturnType<typeof createPublicClient> | null = null
/** Entity events: over the WebSocket in direct mode, polled through the relay otherwise. */
export function eventsClient() {
  if (!evClient) {
    try {
      evClient = MODE === 'direct' ? createPublicClient({ chain: tiramisu, transport: webSocket(WS, { retryCount: 5 }) }) : pub
    } catch {
      evClient = pub
    }
  }
  return evClient
}
export const walletFor = (account: Account) => createWalletClient({ chain: tiramisu, transport: http(ENDPOINT, { retryCount: 3 }), account })

// ─── entity shapes ───────────────────────────────────────────────────────────

export type Scope = 'mobile-data' | 'broadband' | 'all-internet' | 'voice-sms-too' | 'unknown'
export type Source = { title: string; url: string }

/** A suspension order, as published. Lives exactly as long as the order does in law. */
export type Order = {
  key: Hex
  net: Net
  orderId: string
  state: string
  stateName: string
  districts: string[]
  scope: Scope
  issued: number
  starts: number
  ends: number
  emergency: boolean
  confirmed: boolean
  basis: string
  basisCode: string
  notes: string
  endStated: boolean
  authority: string
  reason: string
  renews: string | null
  seq: number
  published: boolean | null
  sources: Source[]
  owner: Hex
  creator: Hex
  createdAt: bigint
  expiresAt: bigint
  readonly: boolean
}

/** The permanent copy of an order: readonly, and anyone may pay to keep it alive. */
export type Record_ = Omit<Order, 'emergency' | 'confirmed'> & { permissionless: boolean; sealed: boolean; corrects: string; correctedBy?: Hex }

/** A citizen's connectivity report. Gone in hours unless other people confirm it by extending it. */
export type Report = {
  key: Hex
  net: Net
  state: string
  district: string
  carrier: string
  status: 'down' | 'slow' | 'back'
  seen: number
  late: boolean
  note: string
  owner: Hex
  creator: Hex
  createdAt: bigint
  expiresAt: bigint
}

// ─── reading ─────────────────────────────────────────────────────────────────

type Raw = {
  key: Hex
  owner?: Hex
  creator?: Hex
  createdAt?: bigint
  expiresAt?: bigint
  creationFlags?: { readonly: boolean; permissionlessExtension: boolean }
  attributes?: Record<string, unknown>
  toJson?: () => unknown
}

/** Attributes come back tagged, { type: 'u64', value: 123n }: take the value. */
const un = (v: unknown): unknown => (v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v)
const num = (v0: unknown) => {
  const v = un(v0)
  return typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0) || 0
}
const str = (v0: unknown) => {
  const v = un(v0)
  return v == null ? '' : String(v)
}
const bool = (v0: unknown) => {
  const v = un(v0)
  return v === true || v === 'true'
}
const json = <T,>(e: Raw, fallback: T): T => {
  try {
    return (e.toJson?.() as T) ?? fallback
  } catch {
    return fallback
  }
}

function toOrder(e: Raw): Order {
  const a = e.attributes ?? {}
  const p = json<{ authority?: string; reason?: string; districts?: string[]; sources?: Source[]; stateName?: string; published?: boolean | null; basis?: string; notes?: string; endStated?: boolean }>(e, {})
  return {
    key: e.key,
    net: (str(a.net) as Net) || 'live',
    orderId: str(a.order_id),
    state: str(a.state),
    stateName: p.stateName ?? str(a.state),
    districts: p.districts ?? (str(a.district) ? [str(a.district)] : []),
    scope: (str(a.scope) as Scope) || 'unknown',
    issued: num(a.issued),
    starts: num(a.starts),
    ends: num(a.ends),
    emergency: bool(a.emergency),
    confirmed: bool(a.confirmed),
    basis: p.basis || str(a.basis),
    basisCode: str(a.basis),
    notes: p.notes ?? '',
    endStated: p.endStated ?? num(a.ends) > 0,
    authority: p.authority ?? '',
    reason: p.reason ?? '',
    renews: str(a.renews) || null,
    seq: num(a.seq),
    published: p.published ?? null,
    sources: p.sources ?? [],
    owner: e.owner ?? '0x',
    creator: e.creator ?? '0x',
    createdAt: e.createdAt ?? 0n,
    expiresAt: e.expiresAt ?? 0n,
    readonly: !!e.creationFlags?.readonly,
  }
}

function toRecord(e: Raw): Record_ {
  const o = toOrder(e)
  return { ...o, permissionless: !!e.creationFlags?.permissionlessExtension, sealed: (e.owner ?? '').toLowerCase() === SEALED.toLowerCase(), corrects: str(e.attributes?.corrects) }
}

function toReport(e: Raw): Report {
  const a = e.attributes ?? {}
  const p = json<{ note?: string }>(e, {})
  return {
    key: e.key,
    net: (str(a.net) as Net) || 'live',
    state: str(a.state),
    district: str(a.district),
    carrier: str(a.carrier),
    status: (str(a.status) as Report['status']) || 'down',
    seen: num(a.seen),
    late: bool(a.late),
    note: p.note ?? '',
    owner: e.owner ?? '0x',
    creator: e.creator ?? '0x',
    createdAt: e.createdAt ?? 0n,
    expiresAt: e.expiresAt ?? 0n,
  }
}

/** Arkiv returns at most 200 per page: walk every page. */
async function all(where: Expression[], atBlock?: bigint): Promise<Raw[]> {
  const out: Raw[] = []
  let q = pub.select('*').where(and(where)).limit(200)
  if (atBlock) q = q.atBlock(atBlock)
  let page = await q.fetch()
  out.push(...(page.entities as unknown as Raw[]))
  let guard = 0
  while (page.hasNextPage() && guard++ < 25) {
    page = await page.next()
    out.push(...(page.entities as unknown as Raw[]))
  }
  return out
}

const base = (type: string, net: Net) => [eq('app', APP), eq('type', type), eq('net', net)]

/** Orders in force right now: an order entity only exists while the order does. */
export async function activeOrders(net: Net, atBlock?: bigint): Promise<Order[]> {
  return (await all(base('order', net), atBlock)).map(toOrder)
}
/** The permanent register, every order ever transcribed. A correction replaces the record it names in `corrects`. */
export async function records(net: Net, atBlock?: bigint): Promise<Record_[]> {
  const rs = (await all(base('record', net), atBlock)).map(toRecord)
  const corrected = new Map(rs.filter((r) => r.corrects).map((r) => [r.corrects.toLowerCase(), r.key]))
  return rs.filter((r) => !corrected.has(r.key.toLowerCase())).map((r) => (r.corrects ? { ...r, correctedBy: undefined } : r))
}
/** Every record including the ones a correction replaced (for the entity page). */
export async function allRecords(net: Net): Promise<Record_[]> {
  return (await all(base('record', net))).map(toRecord)
}

/** Who kept an entity alive: the senders of its ExpiryExtended events (the event itself only names the owner). */
export async function extenders(key: Hex, fromBlock: bigint): Promise<Hex[]> {
  try {
    const logs = await pub.getLogs({ address: ARKIV_ADDRESS, event: parseAbiItem('event ExpiryExtended(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt)'), args: { entityKey: key }, fromBlock, toBlock: 'latest' })
    const froms = await Promise.all(logs.map((l) => pub.getTransaction({ hash: l.transactionHash! }).then((t) => t.from.toLowerCase() as Hex)))
    return [...new Set(froms)]
  } catch {
    return []
  }
}
/** Reports still alive: each one is gone within hours unless someone confirms it. */
export async function liveReports(net: Net, atBlock?: bigint): Promise<Report[]> {
  return (await all(base('report', net), atBlock)).map(toReport)
}
export async function reportsSince(net: Net, sinceUnix: number): Promise<Report[]> {
  return (await all([...base('report', net), gt('seen', sinceUnix)])).map(toReport)
}
export async function entity(key: Hex) {
  return pub.getEntity(key) as unknown as Promise<Raw & { attributes: Record<string, unknown> }>
}
export async function orderByKey(key: Hex): Promise<Order | Record_ | Report | null> {
  try {
    const e = await entity(key)
    const t = str(e.attributes?.type)
    return t === 'report' ? toReport(e) : t === 'record' ? toRecord(e) : toOrder(e)
  } catch {
    return null
  }
}

// ─── block clock ─────────────────────────────────────────────────────────────

let clock: { block: bigint; time: number; at: number } | null = null
/** Block numbers to wall-clock time: expiries are kept in blocks, people think in hours. */
export async function syncClock() {
  const t = await pub.getBlockTiming()
  clock = { block: t.currentBlock, time: t.currentBlockTime, at: Date.now() }
  return clock
}
export function blockToTime(block: bigint): number {
  if (!clock) return 0
  return clock.time * 1000 + Number(block - clock.block) * BLOCK_SECONDS * 1000
}
export function timeToBlock(ms: number): bigint {
  if (!clock) return 0n
  return clock.block + BigInt(Math.round((ms - clock.time * 1000) / 1000 / BLOCK_SECONDS))
}
export function currentBlock(): bigint {
  if (!clock) return 0n
  return clock.block + BigInt(Math.floor((Date.now() - clock.at) / 1000 / BLOCK_SECONDS))
}
