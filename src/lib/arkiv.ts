// Everything the app reads and writes lives on Arkiv (Tiramisu testnet). This module is the
// whole data layer: the entity types, how they map to attributes vs payload, and the queries.
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { and, eq, gt, type Expression } from '@arkiv-network/sdk/query'
import { u64 } from '@arkiv-network/sdk/attr'
import { fallback, http, webSocket, parseAbiItem, type Hex, type Account } from 'viem'
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
export const LAW_CAP_BLOCKS = BigInt((LAW_CAP_DAYS * 86_400) / 2)
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
// The relay shares a query's answer between visitors for up to twenty seconds. Once this browser sends a
// transaction, its reads skip that shared answer for a minute, so whoever just filed something sees it on
// the next read (a drill emergency order only lives one minute).
let freshUntil = 0
const relayFetch = (input: string | URL | Request, init?: RequestInit) => {
  if (typeof init?.body === 'string' && init.body.includes('eth_sendRawTransaction')) freshUntil = Date.now() + 60_000
  if (Date.now() < freshUntil && String(input).startsWith(RELAY)) {
    const headers = new Headers(init?.headers)
    headers.set('x-fresh', '1')
    init = { ...init, headers }
  }
  return fetch(input, init)
}
const HTTP = { batch: { wait: 30, batchSize: 10 }, retryCount: 0, timeout: 9000, fetchFn: relayFetch } as const
export const pub = createPublicClient({ chain: tiramisu, transport: http(ENDPOINT, HTTP) })
let direct: typeof pub | null = null
/** Arkiv's public endpoint, straight from the browser: the fallback when the relay can't answer. */
export const directClient = () => (direct ??= MODE === 'direct' ? pub : createPublicClient({ chain: tiramisu, transport: http(RPC, HTTP) }))
let relayC: typeof pub | null = null
/** This site's relay: the fallback when a direct read hits Arkiv's keyless budget. */
export const relayClient = () => (relayC ??= MODE === 'relay' ? pub : createPublicClient({ chain: tiramisu, transport: http(RELAY, HTTP) }))
// Words that mean "this path is out", not "this read is wrong": the other path gets the same read. The relay
// prefixes its own upstream failures with "Relay error" (Node's wording is "fetch failed", the browser's
// "Failed to fetch"); "Too many calls" is its per-network pace; the rest are Arkiv's and viem's transport words.
const RELAY_DOWN = /budget|ANON|429|quota|rate ?limit|Too many calls|Arkiv answered|Relay error|Method not relayed|only answers|only calls|timed out|timeout|took too long|HTTP request failed|Failed to fetch|fetch failed|NetworkError|ECONN|socket|terminated|aborted|unavailable|overloaded|internal error|FUNCTION_INVOCATION/i
/**
 * The useful part of an error, one line, for banners and toasts. viem's messages open with "RPC Request
 * failed. URL: … Request body: {…}" and keep the reason for a "Details:" line at the end, so the first
 * 80 characters of `message` say nothing; `details` (or that last line) is what a reader needs.
 */
export function errText(e: unknown): string {
  const x = e as { details?: unknown; shortMessage?: unknown; message?: unknown } | null
  const details = typeof x?.details === 'string' ? x.details.trim() : ''
  if (details) return details.replace(/\s+/g, ' ')
  const m = String(x?.message ?? e ?? '')
  const tail = /Details:\s*([\s\S]+?)\s*(?:Version:[\s\S]*)?$/.exec(m)?.[1]?.trim()
  const short = typeof x?.shortMessage === 'string' ? x.shortMessage.trim() : ''
  return (tail || short || m.split('\n')[0] || m).replace(/\s+/g, ' ')
}
/**
 * Every read goes through here: the page's own path first (relay by default), and if that path is
 * out (its key's budget, a limit, a timeout) the same read goes the other way, once, and the pages
 * say so. Direct → relay covers Arkiv's per-network keyless budget; relay → direct covers us.
 */
export async function viaFallback<T>(fn: (c: typeof pub) => Promise<T>): Promise<T> {
  try {
    return await fn(pub)
  } catch (e) {
    if (!RELAY_DOWN.test(`${String((e as Error).message)} ${errText(e)}`)) throw e
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
/** Writes: the page's own path first, then the other one, so a paced relay or a spent keyless budget doesn't lose a report. */
export const walletFor = (account: Account) => createWalletClient({ chain: tiramisu, transport: fallback([http(ENDPOINT, { retryCount: 1, timeout: 20_000, fetchFn: relayFetch }), http(ENDPOINT === RPC ? RELAY : RPC, { retryCount: 1, timeout: 20_000, fetchFn: relayFetch })]), account })

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

export type Raw = {
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
  // a hostile str('1e999') would read as Infinity: dates and lifetimes need finite numbers
  const n = typeof v === 'bigint' ? Number(v) : typeof v === 'number' ? v : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}
const str = (v0: unknown) => {
  const v = un(v0)
  return v == null ? '' : String(v)
}
const bool = (v0: unknown) => {
  const v = un(v0)
  return v === true || v === 'true'
}
const json = <T,>(e: Raw, fallbackValue: T): T => {
  try {
    const v = e.toJson?.() as T
    return v && typeof v === 'object' && !Array.isArray(v) ? v : fallbackValue
  } catch {
    return fallbackValue
  }
}
// Anyone can write an entity tagged like ours, with any payload. Nothing reaches a component unless
// it has the type and size the schema says, so a hostile record can't crash a page.
const text = (v: unknown, max = 600): string => (typeof v === 'string' ? v.slice(0, max) : '')
const textList = (v: unknown, max = 60): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, max).map((x) => x.slice(0, 80)) : [])
const sourceList = (v: unknown): Source[] =>
  Array.isArray(v)
    ? v
        .filter((s): s is Source => !!s && typeof s === 'object' && typeof (s as Source).url === 'string')
        .slice(0, 12)
        .map((s) => ({ title: text(s.title, 200) || text(s.url, 200), url: /^https?:\/\//i.test(s.url) ? s.url.slice(0, 500) : '' }))
    : []

export function toOrder(e: Raw): Order {
  const a = e.attributes ?? {}
  const p = json<{ authority?: string; reason?: string; districts?: string[]; sources?: Source[]; stateName?: string; published?: boolean | null; basis?: string; notes?: string; endStated?: boolean }>(e, {})
  const scope = str(a.scope)
  const districts = textList(p.districts)
  return {
    key: e.key,
    net: str(a.net) === 'drill' ? 'drill' : 'live',
    orderId: str(a.order_id).slice(0, 80),
    state: str(a.state).slice(0, 4),
    stateName: text(p.stateName, 60) || str(a.state).slice(0, 4),
    districts: districts.length ? districts : str(a.district) ? [str(a.district).slice(0, 80)] : [],
    scope: (['mobile-data', 'broadband', 'all-internet', 'voice-sms-too'].includes(scope) ? scope : 'unknown') as Scope,
    issued: num(a.issued),
    starts: num(a.starts),
    ends: num(a.ends),
    emergency: bool(a.emergency),
    confirmed: bool(a.confirmed),
    basis: text(p.basis, 200) || str(a.basis).slice(0, 40),
    basisCode: str(a.basis).slice(0, 40),
    notes: text(p.notes, 1200),
    endStated: typeof p.endStated === 'boolean' ? p.endStated : num(a.ends) > 0,
    authority: text(p.authority, 200),
    reason: text(p.reason, 600),
    renews: str(a.renews).slice(0, 80) || null,
    seq: num(a.seq),
    published: typeof p.published === 'boolean' ? p.published : null,
    sources: sourceList(p.sources),
    owner: e.owner ?? '0x',
    creator: e.creator ?? '0x',
    createdAt: e.createdAt ?? 0n,
    expiresAt: e.expiresAt ?? 0n,
    readonly: !!e.creationFlags?.readonly,
    official: isRegistrar(e.creator),
  }
}

export function toRecord(e: Raw): Record_ {
  const o = toOrder(e)
  return { ...o, permissionless: !!e.creationFlags?.permissionlessExtension, sealed: (e.owner ?? '').toLowerCase() === SEALED.toLowerCase(), corrects: str(e.attributes?.corrects) }
}

export function toReport(e: Raw): Report {
  const a = e.attributes ?? {}
  const p = json<{ note?: string }>(e, {})
  return {
    key: e.key,
    net: str(a.net) === 'drill' ? 'drill' : 'live',
    state: str(a.state).slice(0, 4),
    district: str(a.district).slice(0, 80),
    carrier: str(a.carrier).slice(0, 40),
    status: (['down', 'slow', 'back'].includes(str(a.status)) ? str(a.status) : 'down') as Report['status'],
    seen: num(a.seen),
    late: bool(a.late),
    note: text(p.note, 140),
    owner: e.owner ?? '0x',
    creator: e.creator ?? '0x',
    createdAt: e.createdAt ?? 0n,
    expiresAt: e.expiresAt ?? 0n,
  }
}

/** Arkiv returns at most 200 per page: walk every page. */
async function pages(client: typeof pub, where: Expression[], atBlock?: bigint, opts: { creator?: Hex; maxPages?: number } = {}): Promise<Raw[]> {
  const out: Raw[] = []
  let q = client.select('*').where(and(where)).limit(200)
  if (opts.creator) q = q.createdBy(opts.creator)
  if (atBlock) q = q.atBlock(atBlock)
  let page = await q.fetch()
  out.push(...(page.entities as unknown as Raw[]))
  let guard = 0
  while (page.hasNextPage() && guard++ < (opts.maxPages ?? 25)) {
    page = await page.next()
    out.push(...(page.entities as unknown as Raw[]))
  }
  return out
}
/** A paged query on whichever path answers. */
const all = (where: Expression[], atBlock?: bigint, opts: { creator?: Hex; maxPages?: number } = {}): Promise<Raw[]> => viaFallback((c) => pages(c, where, atBlock, opts))
const REGISTRAR = REGISTRARS[0].address as Hex
/**
 * The archive is read in two parts: the registrar's records by `$creator` (so no amount of junk in
 * the namespace can bury them or make the page read thousands of entities), and community records
 * with a page cap, labelled as such wherever they show.
 */
async function recordsOfficialAndCommunity(where: Expression[], atBlock?: bigint): Promise<Raw[]> {
  const [official, everyone] = await Promise.all([all(where, atBlock, { creator: REGISTRAR }), all(where, atBlock, { maxPages: 3 })])
  const seen = new Set(official.map((e) => e.key.toLowerCase()))
  return [...official, ...everyone.filter((e) => !seen.has(e.key.toLowerCase()))]
}

const base = (type: string, net: Net) => [eq('app', APP), eq('type', type), eq('net', net)]

/** The exact text a query sends to Arkiv, for the pages that show their work. */
export const queryText = (type: string, net: Net, extra: string[] = []) => [`app = str('${APP}')`, `type = str('${type}')`, `net = str('${net}')`, ...extra].join(' AND ')

/**
 * Orders in force right now: an order entity only exists while the order does. Anyone may file an
 * order; one that is not the registrar's switches districts off only if it runs within the law's
 * cap (15 days), so a stray or hostile filing dated years ahead can't darken the map.
 */
export async function activeOrders(net: Net, atBlock?: bigint): Promise<Order[]> {
  return (await all(base('order', net), atBlock)).map(toOrder).filter(withinLawCap)
}
/** An order darkens the map if the registrar filed it, or if it lives no longer than the law allows. */
export const withinLawCap = (o: Order) => o.official || o.expiresAt - o.createdAt <= LAW_CAP_BLOCKS
/**
 * The permanent register, every order ever transcribed. A correction replaces the record it names
 * in `corrects`, but only when the correction comes from the registrar or from whoever filed the
 * original: a stranger's "correction" can't hide a record.
 */
export async function records(net: Net, atBlock?: bigint): Promise<Record_[]> {
  return applyCorrections((await recordsOfficialAndCommunity(base('record', net), atBlock)).map(toRecord))
}
export function applyCorrections(rs: Record_[]): Record_[] {
  const byKey = new Map(rs.map((r) => [r.key.toLowerCase(), r]))
  const corrected = new Map(rs.filter((r) => trustedCorrection(r, byKey)).map((r) => [r.corrects.toLowerCase(), r.key]))
  return rs.filter((r) => !corrected.has(r.key.toLowerCase())).map((r) => (r.corrects ? { ...r, correctedBy: undefined } : r))
}
/** Records narrowed on Arkiv itself (typed equality on `state`, a u64 range on `issued`), not in the browser. */
export async function recordsWhere(net: Net, f: { state?: string; since?: number }): Promise<{ list: Record_[]; query: string; hidden: number }> {
  const where = [...base('record', net)]
  const extra: string[] = []
  if (f.state) {
    where.push(eq('state', f.state))
    extra.push(`state = str('${f.state}')`)
  }
  if (f.since) {
    // "issued since" is inclusive: strictly greater than the second before
    where.push(gt('issued', u64(BigInt(f.since - 1))))
    extra.push(`issued > u64(${f.since - 1})`)
  }
  const raw = (await recordsOfficialAndCommunity(where)).map(toRecord)
  const list = applyCorrections(raw)
  return { list, query: queryText('record', net, extra), hidden: raw.length - list.length }
}
/** Every record including the ones a correction replaced (for the entity page). */
export async function allRecords(net: Net): Promise<Record_[]> {
  return (await recordsOfficialAndCommunity(base('record', net))).map(toRecord)
}
/** Which corrections readers trust: from the registrar, or from whoever filed the record they correct. */
export function trustedCorrection(c: Record_, byKey: Map<string, Record_>): boolean {
  if (!c.corrects) return false
  const orig = byKey.get(c.corrects.toLowerCase())
  return c.official || (!!orig && orig.creator.toLowerCase() === c.creator.toLowerCase())
}
/** Records that may stand in a renewal chain with `r`: the registrar's, or the same filer's. */
export const sameDesk = (a: Record_, b: Record_) => (a.official && b.official) || a.creator.toLowerCase() === b.creator.toLowerCase()

/** The recent EntityCreated / ExpiryExtended events for a set of keys, newest first, so the wire has history on arrival. */
export async function recentEvents(keys: Hex[], lookBack = 99_000n): Promise<{ kind: 'created' | 'extended'; key: Hex; block: bigint; hash: Hex; index: number }[]> {
  if (!keys.length) return []
  try {
    const head = await viaFallback((c) => c.getBlockNumber())
    const from = head > lookBack ? head - lookBack : 0n
    const ks = keys.slice(0, 300)
    const [created, extended] = await Promise.all([
      viaFallback((c) => c.getLogs({ address: ARKIV_ADDRESS, event: parseAbiItem('event EntityCreated(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt, uint8 creationFlags)'), args: { entityKey: ks }, fromBlock: from, toBlock: head })),
      viaFallback((c) => c.getLogs({ address: ARKIV_ADDRESS, event: parseAbiItem('event ExpiryExtended(bytes32 indexed entityKey, address indexed owner, uint64 expiresAt)'), args: { entityKey: ks }, fromBlock: from, toBlock: head })),
    ])
    const out = [
      ...created.map((l) => ({ kind: 'created' as const, key: (l.args as { entityKey: Hex }).entityKey, block: l.blockNumber!, hash: l.transactionHash!, index: l.logIndex! })),
      ...extended.map((l) => ({ kind: 'extended' as const, key: (l.args as { entityKey: Hex }).entityKey, block: l.blockNumber!, hash: l.transactionHash!, index: l.logIndex! })),
    ]
    return out.sort((a, b) => (a.block === b.block ? b.index - a.index : Number(b.block - a.block))).slice(0, 30)
  } catch {
    return []
  }
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
    const hashes = [...new Set(logs.map((l) => l.transactionHash!))].slice(0, 40)
    const froms = await Promise.all(hashes.map((hash) => viaFallback((c) => c.getTransaction({ hash })).then((t) => t.from.toLowerCase() as Hex)))
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
