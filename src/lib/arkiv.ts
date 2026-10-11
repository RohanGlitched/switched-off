// Everything the app reads and writes lives on Arkiv (Tiramisu testnet). This module is the
// whole data layer: the entity types, how they map to attributes vs payload, and the queries.
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { and, eq, gt, type Expression } from '@arkiv-network/sdk/query'
import { u64 } from '@arkiv-network/sdk/attr'
import { http, webSocket, parseAbiItem, type Hex, type Account } from 'viem'
import { REGISTRARS } from './registrars'

export const APP = 'switched-off'
export const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
export const WS = 'wss://rpc.tiramisu.db-chain.testnet.arkiv.network'
export const EXPLORER = 'https://tiramisu.explorer.arkiv.network'
export const BLOCK_SECONDS = 2
/** Sealed records are owned by this address. Nobody holds its key, so nobody can delete them. */
export const SEALED = '0x000000000000000000000000000000000000dEaD'
const ARKIV_ADDRESS = '0x4400000000000000000000000000000000000044'
/** The longest one order may run in law (15 days), with a day of slack for how dates are entered. */
export const LAW_CAP_DAYS = 16
const LAW_CAP_BLOCKS = BigInt((LAW_CAP_DAYS * 86_400) / 2)
export const isRegistrar = (a?: string) => REGISTRARS.some((r) => r.address.toLowerCase() === (a ?? '').toLowerCase())

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

// No transport retries: Arkiv's 429 arrives with retry-after of up to ~1000 s and viem would wait it out
// in silence. A failed read goes to the other path (below) instead.
const HTTP = { batch: { wait: 30 }, retryCount: 0, timeout: 9000 } as const
export const pub = createPublicClient({ chain: tiramisu, transport: http(ENDPOINT, HTTP) })
let direct: typeof pub | null = null
/** Arkiv's public endpoint, straight from the browser: the fallback when the relay can't answer. */
export const directClient = () => (direct ??= MODE === 'direct' ? pub : createPublicClient({ chain: tiramisu, transport: http(RPC, HTTP) }))
let relayC: typeof pub | null = null
/** This site's relay: the fallback when a direct read hits Arkiv's keyless budget. */
export const relayClient = () => (relayC ??= MODE === 'relay' ? pub : createPublicClient({ chain: tiramisu, transport: http(RELAY, HTTP) }))
const RELAY_DOWN = /budget|ANON|429|quota|rate ?limit|Arkiv answered|Method not relayed|only answers|only calls|timed out|timeout|HTTP request failed|Failed to fetch|NetworkError/i
/**
 * Every read goes through here: the page's own path first (relay by default), and if that path is
 * out (its key's budget, a limit, a timeout) the same read goes the other way, once, and the pages
 * say so. Direct → relay covers Arkiv's per-network keyless budget; relay → direct covers us.
 */
export async function viaFallback<T>(fn: (c: typeof pub) => Promise<T>): Promise<T> {
  try {
    return await fn(pub)
  } catch (e) {
    if (!RELAY_DOWN.test(String((e as Error).message))) throw e
    if (MODE === 'relay') {
      relayFailed = true
      fellBackTo = 'direct'
      return fn(directClient())
    }
    fellBackTo = 'relay'
    return fn(relayClient())
  }
}
/** Set once a read had to use the other path ('direct' or 'relay'); the pages say so. */
export let fellBackTo: 'relay' | 'direct' | null = null
export let relayFailed = false
let evClient: ReturnType<typeof createPublicClient> | null = null
/**
 * Entity events come over Arkiv's WebSocket whichever mode the page is in: a subscription costs no
 * query budget, so there is nothing to relay. If the socket can't be opened, the store falls back
 * to polling a node-side filter through the relay.
 */
export function eventsClient() {
  if (!evClient) {
    try {
      evClient = createPublicClient({ chain: tiramisu, transport: webSocket(WS, { retryCount: 3 }) })
    } catch {
      evClient = pub
    }
  }
  return evClient
}
export const pollingClient = () => pub
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
  /** Filed by the Switched Off registrar (by $creator); anything else is a community transcription. */
  official: boolean
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
    official: isRegistrar(e.creator),
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
async function pages(client: typeof pub, where: Expression[], atBlock?: bigint): Promise<Raw[]> {
  const out: Raw[] = []
  let q = client.select('*').where(and(where)).limit(200)
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
/** A paged query on whichever path answers. */
const all = (where: Expression[], atBlock?: bigint): Promise<Raw[]> => viaFallback((c) => pages(c, where, atBlock))

const base = (type: string, net: Net) => [eq('app', APP), eq('type', type), eq('net', net)]

/** The exact text a query sends to Arkiv, for the pages that show their work. */
export const queryText = (type: string, net: Net, extra: string[] = []) => [`app = str('${APP}')`, `type = str('${type}')`, `net = str('${net}')`, ...extra].join(' AND ')

/**
 * Orders in force right now: an order entity only exists while the order does. Anyone may file an
 * order; one that is not the registrar's switches districts off only if it runs within the law's
 * cap (15 days), so a stray or hostile filing dated years ahead can't darken the map.
 */
export async function activeOrders(net: Net, atBlock?: bigint): Promise<Order[]> {
  return (await all(base('order', net), atBlock)).map(toOrder).filter((o) => o.official || o.expiresAt - o.createdAt <= LAW_CAP_BLOCKS)
}
/**
 * The permanent register, every order ever transcribed. A correction replaces the record it names
 * in `corrects`, but only when the correction comes from the registrar or from whoever filed the
 * original: a stranger's "correction" can't hide a record.
 */
export async function records(net: Net, atBlock?: bigint): Promise<Record_[]> {
  return applyCorrections((await all(base('record', net), atBlock)).map(toRecord))
}
export function applyCorrections(rs: Record_[]): Record_[] {
  const byKey = new Map(rs.map((r) => [r.key.toLowerCase(), r]))
  const trusted = (c: Record_) => {
    const orig = byKey.get(c.corrects.toLowerCase())
    return c.official || (!!orig && orig.creator.toLowerCase() === c.creator.toLowerCase())
  }
  const corrected = new Map(rs.filter((r) => r.corrects && trusted(r)).map((r) => [r.corrects.toLowerCase(), r.key]))
  return rs.filter((r) => !corrected.has(r.key.toLowerCase())).map((r) => (r.corrects ? { ...r, correctedBy: undefined } : r))
}
/** Records narrowed on Arkiv itself (typed equality on `state`, a u64 range on `issued`), not in the browser. */
export async function recordsWhere(net: Net, f: { state?: string; since?: number }): Promise<{ list: Record_[]; query: string }> {
  const where = [...base('record', net)]
  const extra: string[] = []
  if (f.state) {
    where.push(eq('state', f.state))
    extra.push(`state = str('${f.state}')`)
  }
  if (f.since) {
    where.push(gt('issued', u64(BigInt(f.since))))
    extra.push(`issued > u64(${f.since})`)
  }
  return { list: applyCorrections((await all(where)).map(toRecord)), query: queryText('record', net, extra) }
}
/** Every record including the ones a correction replaced (for the entity page). */
export async function allRecords(net: Net): Promise<Record_[]> {
  return (await all(base('record', net))).map(toRecord)
}

/**
 * Who kept an entity alive: the senders of its ExpiryExtended events (the event itself only names
 * the owner). The entity's own creator is left out, so "confirmed by N keys" counts other keys.
 */
export async function extenders(key: Hex, fromBlock: bigint, creator?: string): Promise<Hex[]> {
  try {
    // the node answers at most 100,000 blocks per log query (about 55 hours): walk the range in windows
    const head = await viaFallback((c) => c.getBlockNumber())
    const WINDOW = 99_000n
    const event = parseAbiItem('event ExpiryExtended(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt)')
    const windows: [bigint, bigint][] = []
    for (let from = fromBlock > 0n ? fromBlock : 0n; from <= head && windows.length < 40; from += WINDOW + 1n) windows.push([from, from + WINDOW < head ? from + WINDOW : head])
    const logs = (await Promise.all(windows.map(([a, b]) => viaFallback((c) => c.getLogs({ address: ARKIV_ADDRESS, event, args: { entityKey: key }, fromBlock: a, toBlock: b }))))).flat()
    const froms = await Promise.all(logs.map((l) => viaFallback((c) => c.getTransaction({ hash: l.transactionHash! })).then((t) => t.from.toLowerCase() as Hex)))
    return [...new Set(froms)].filter((f) => f !== (creator ?? '').toLowerCase())
  } catch {
    return []
  }
}
/** Reports still alive: each one is gone within hours unless someone confirms it. */
export async function liveReports(net: Net, atBlock?: bigint): Promise<Report[]> {
  return (await all(base('report', net), atBlock)).map(toReport)
}
/** Reports seen after a moment: a u64 range on Arkiv (a bare number would compare as i32 and match nothing). */
export async function reportsSince(net: Net, sinceUnix: number): Promise<Report[]> {
  return (await all([...base('report', net), gt('seen', u64(BigInt(sinceUnix)))])).map(toReport)
}
export async function entity(key: Hex) {
  return viaFallback((c) => c.getEntity(key)) as unknown as Promise<Raw & { attributes: Record<string, unknown> }>
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
  const t = await viaFallback((c) => c.getBlockTiming())
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
