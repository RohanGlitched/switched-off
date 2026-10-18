// A thin JSON-RPC relay to Arkiv Tiramisu. It exists for one reason: Arkiv meters anonymous
// queries, and an API key in browser code can be read and spent by anyone. So the key stays here,
// identical reads are shared for a few seconds, and only the methods this app needs pass.
// Transactions are signed in the visitor's browser; this relay only forwards the signed bytes.
// Readers who don't want to trust it can flip the site to "direct" and talk to Arkiv themselves.

import { parseTransaction, type Hex } from 'viem'

const UPSTREAM = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const ALLOW = new Set([
  'arkiv_query', 'arkiv_getEntityCount', 'arkiv_getBlockTiming', 'arkiv_getEntityNonce',
  'eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getTransactionCount', 'eth_gasPrice', 'eth_maxPriorityFeePerGas',
  'eth_feeHistory', 'eth_estimateGas', 'eth_call', 'eth_sendRawTransaction', 'eth_getTransactionReceipt', 'eth_getTransactionByHash',
  'eth_getBlockByNumber', 'eth_getLogs', 'net_version',
  // entity events: viem's watchEvent polls a node-side filter
  'eth_newFilter', 'eth_getFilterChanges', 'eth_getFilterLogs', 'eth_uninstallFilter', 'eth_newBlockFilter',
])
// reads that can be shared between visitors for a moment
const CACHE_MS: Record<string, number> = { arkiv_query: 20_000, eth_blockNumber: 1500, arkiv_getBlockTiming: 1500, arkiv_getEntityCount: 10000, eth_chainId: 3600_000, eth_getLogs: 1500, eth_getFilterChanges: 1500 }
const cache = new Map<string, { at: number; body: unknown }>()
// when Arkiv refuses a read (a budget, a 5xx), the last good answer to the same read is served for this long
const STALE_MS = 15 * 60_000
// The sealed archive is the heavy read (about 350 KB a page) and changes only when someone files an order,
// so it is shared for five minutes; a read pinned to a past block can never change, so it is shared longer.
// A browser that has just written still skips the cache (x-fresh). Memory is bounded by total bytes.
const ARCHIVE_MS = 300_000
const PINNED_MS = 900_000
const CACHE_MAX_BYTES = 2_000_000
const CACHE_TOTAL_BYTES = 40_000_000
const sizes = new Map<string, number>()
let cachedBytes = 0
export function ttlOf(call: Call): number | undefined {
  if (call.method !== 'arkiv_query') return CACHE_MS[call.method]
  const opts = (call.params?.[1] ?? {}) as { atBlock?: unknown }
  if (opts.atBlock !== undefined) return PINNED_MS
  if (/\btype = str\('record'\)/.test(String(call.params?.[0] ?? ''))) return ARCHIVE_MS
  return CACHE_MS.arkiv_query
}
const ARKIV = '0x4400000000000000000000000000000000000044'
const MAX_BATCH = 10
const MAX_LOG_RANGE = 400_000n
const APP_CLAUSE = "app = str('switched-off')"
// the relay's key has a monthly quota: a visitor gets a fair share, not the whole of it
const PER_IP = 150
const WINDOW_MS = 60_000
const hits = new Map<string, number[]>()
function paced(ip: string, n: number): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length + n > PER_IP) {
    hits.set(ip, list)
    return true
  }
  for (let i = 0; i < n; i++) list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.delete(hits.keys().next().value!)
  return false
}
/**
 * The key's month is the scarce thing, and anyone can ask for a read the cache can't answer (a fresh
 * read, a new cursor or block). So each network gets a small number of keyed queries a minute and of
 * cache-skipping fresh reads; past that, its reads go out on Arkiv's keyless budget (shared caches still
 * answer them first). Normal browsing, a page of reads every few seconds, stays well inside both.
 */
const KEYED_PER_IP = 40
const FRESH_PER_IP = 12
const keyed = new Map<string, number[]>()
const freshes = new Map<string, number[]>()
function allow(map: Map<string, number[]>, ip: string, max: number): boolean {
  const now = Date.now()
  const list = (map.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  const ok = list.length < max
  if (ok) list.push(now)
  map.set(ip, list)
  if (map.size > 5000) map.delete(map.keys().next().value!)
  return ok
}

/**
 * The only query shape the relay forwards: a conjunction of simple comparisons, exactly as the SDK
 * writes them (`name = str('…') AND issued > u64(1)`), plus `$key = key(0x…)`, `$owner`/`$creator =
 * addr(0x…)`. No brackets, no OR, no NOT, no stray quotes: nothing a caller writes can escape the
 * app clause that is put in front of it.
 */
const TERM = String.raw`\$?[A-Za-z_][A-Za-z0-9_.-]*\s*(?:=|!=|>=|<=|>|<)\s*(?:str\('[^'()\\]*'\)|u64\(\d{1,20}\)|i32\(-?\d{1,10}\)|key\(0x[0-9a-fA-F]{64}\)|addr\(0x[0-9a-fA-F]{40}\)|true|false|-?\d{1,20})`
export const QUERY = new RegExp(String.raw`^\s*(?:${TERM})(?:\s+AND\s+(?:${TERM}))*\s*$`)
const HEX = /^0x[0-9a-fA-F]{1,16}$/
const HEX_WORD = /^0x[0-9a-fA-F]{64}$/

/** Why a call is refused, or null. The key is spent only on this app's own reads and on Arkiv's contract. */
export function refused(call: Call): string | null {
  const p = call.params ?? []
  if (!Array.isArray(p)) return 'Params must be an array.'
  if (call.method === 'arkiv_query') {
    const q = p[0]
    if (typeof q !== 'string' || !q.trim()) return 'Send a query expression.'
    if (q.length > 1200) return 'That query is too long.'
    if (!QUERY.test(q)) return "This relay forwards only simple AND queries (name = str('…'), name > u64(n), $key = key(0x…)). Ask Arkiv directly for anything else."
    const o = p[1]
    if (o !== undefined) {
      if (typeof o !== 'object' || o === null || Array.isArray(o)) return 'Query options must be an object.'
      const opts = o as Record<string, unknown>
      for (const k of Object.keys(opts)) if (!['select', 'limit', 'atBlock', 'cursor', 'orderBy'].includes(k)) return `Unknown query option ${k}.`
      if (opts.limit !== undefined && !(typeof opts.limit === 'string' && HEX.test(opts.limit) && parseInt(opts.limit, 16) <= 200)) return 'Limit must be a hex string up to 0xc8.'
      if (opts.atBlock !== undefined && !(typeof opts.atBlock === 'string' && HEX.test(opts.atBlock))) return 'atBlock must be a hex block number.'
      if (opts.cursor !== undefined && !(typeof opts.cursor === 'string' && opts.cursor.length < 400)) return 'Bad cursor.'
      if (opts.select !== undefined && (typeof opts.select !== 'object' || opts.select === null)) return 'Bad select.'
    }
  }
  if (call.method === 'eth_getLogs' || call.method === 'eth_newFilter') {
    const f = (p[0] ?? {}) as { address?: string | string[]; fromBlock?: string; toBlock?: string; blockHash?: string }
    if (typeof f !== 'object' || f === null) return 'Bad filter.'
    const addrs = Array.isArray(f.address) ? f.address : [f.address ?? '']
    if (addrs.length !== 1 || String(addrs[0]).toLowerCase() !== ARKIV) return 'This relay only reads Arkiv entity logs.'
    if (f.blockHash !== undefined) return 'Ask by block numbers, not a block hash.'
    if (call.method === 'eth_getLogs') {
      if (typeof f.fromBlock !== 'string' || !HEX.test(f.fromBlock)) return 'fromBlock must be a hex block number.'
      if (typeof f.toBlock !== 'string' || !(HEX.test(f.toBlock) || f.toBlock === 'latest')) return 'toBlock must be a hex block number or latest.'
      if (HEX.test(f.toBlock) && BigInt(f.toBlock) - BigInt(f.fromBlock) > MAX_LOG_RANGE) return 'Ask for a narrower block range.'
    }
  }
  if (call.method === 'eth_call' || call.method === 'eth_estimateGas') {
    const tx = (p[0] ?? {}) as { to?: string }
    if (typeof tx !== 'object' || tx === null || String(tx.to ?? '').toLowerCase() !== ARKIV) return 'This relay only calls the Arkiv contract.'
  }
  // the relay forwards transactions to Arkiv's contract only, so it isn't a free RPC for anything else
  if (call.method === 'eth_sendRawTransaction') {
    try {
      if (typeof p[0] !== 'string' || String(parseTransaction(p[0] as Hex).to ?? '').toLowerCase() !== ARKIV) return 'This relay only sends transactions to the Arkiv contract.'
    } catch {
      return 'Not a signed transaction.'
    }
  }
  if (call.method === 'eth_getTransactionByHash' || call.method === 'eth_getTransactionReceipt') {
    if (typeof p[0] !== 'string' || !HEX_WORD.test(p[0])) return 'Bad transaction hash.'
  }
  return null
}

export type Call = { jsonrpc: '2.0'; id: unknown; method: string; params?: unknown[] }
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

async function one(call: Call, key: string | undefined, fresh = false, ip = 'unknown'): Promise<unknown> {
  try {
    if (!call || typeof call !== 'object' || typeof call.method !== 'string' || !ALLOW.has(call.method))
      return { jsonrpc: '2.0', id: (call as Call | null)?.id ?? null, error: { code: -32601, message: `Method not relayed: ${(call as Call | null)?.method}. Talk to ${UPSTREAM} directly for anything else.` } }
    const why = refused(call)
    if (why) return { jsonrpc: '2.0', id: call.id ?? null, error: { code: -32602, message: why } }
    // the key is spent on this app's data only: every query goes out with the app clause in front
    if (call.method === 'arkiv_query') {
      const q = String(call.params![0]).trim()
      const scoped = q.startsWith(APP_CLAUSE) ? q : `${APP_CLAUSE} AND ${q}`
      call = { ...call, params: [scoped, ...(call.params ?? []).slice(1)] }
    }
    const ttl = ttlOf(call)
    const ck = ttl ? `${call.method}:${JSON.stringify(call.params ?? [])}` : ''
    const hit = ck ? cache.get(ck) : undefined
    // a browser that has just written asks for a fresh read, or it would be shown the page before its own write
    if (hit && !fresh && Date.now() - hit.at < (ttl ?? 0)) return { jsonrpc: '2.0', id: call.id, ...(hit.body as object) }
    const { r, text } = await upstream(call, call.method === 'arkiv_query' && !allow(keyed, ip, KEYED_PER_IP) ? undefined : key)
    let j: { result?: unknown; error?: unknown; message?: unknown }
    try {
      j = JSON.parse(text) as { result?: unknown; error?: unknown; message?: unknown }
    } catch {
      j = { error: { code: -32603, message: `Arkiv answered ${r.status}: ${text.slice(0, 160)}` } }
    }
    // Arkiv's budget answers are not JSON-RPC shaped: {"error":"QUOTA_EXCEEDED","message":"quota exhausted"}.
    // Passed through as they are, the string has no `message`, so clients report "RPC Request failed." and
    // nothing else. Give them a proper error object that names the status and the reason.
    if (typeof j.error === 'string' || (j.error && typeof j.error === 'object' && !('message' in (j.error as object))))
      j = { error: { code: r.status === 429 ? -32005 : -32603, message: `Arkiv answered ${r.status}: ${typeof j.error === 'string' ? j.error : JSON.stringify(j.error).slice(0, 120)}${j.message ? ` (${String(j.message)})` : ''}` } }
    const body = 'result' in j ? { result: j.result } : { error: j.error ?? { code: -32603, message: `Arkiv answered ${r.status}` } }
    if (ck && 'result' in body && text.length <= CACHE_MAX_BYTES) {
      cachedBytes += text.length - (sizes.get(ck) ?? 0)
      cache.delete(ck)
      cache.set(ck, { at: Date.now(), body })
      sizes.set(ck, text.length)
      while ((cache.size > 500 || cachedBytes > CACHE_TOTAL_BYTES) && cache.size > 1) {
        const old = cache.keys().next().value!
        cache.delete(old)
        cachedBytes -= sizes.get(old) ?? 0
        sizes.delete(old)
      }
    }
    // a refused read with a recent good answer: serve that rather than nothing (a visitor's own fallback
    // to Arkiv's keyless budget comes first in the page; this is what is left when every path is out)
    if (ck && !('result' in body) && hit && Date.now() - hit.at < STALE_MS) return { jsonrpc: '2.0', id: call.id, ...(hit.body as object) }
    return { jsonrpc: '2.0', id: call.id, ...body }
  } catch (e) {
    return { jsonrpc: '2.0', id: (call as Call | null)?.id ?? null, error: { code: -32603, message: `Relay error: ${reason(e).slice(0, 160)}` } }
  }
}

/** Node's fetch says only "fetch failed" and keeps the real reason (ECONNRESET, a DNS miss) in `cause`. */
function reason(e: unknown): string {
  const x = e as { message?: unknown; cause?: { message?: unknown; code?: unknown } } | null
  const cause = x?.cause ? String(x.cause.code ?? x.cause.message ?? '') : ''
  return [String(x?.message ?? e ?? 'unknown'), cause].filter(Boolean).join(': ')
}

const UPSTREAM_TIMEOUT_MS = 8000
// Keys in order of use: ARKIV_KEY, then ARKIV_KEY_2 (a second Hub account's key, held for when the first
// month runs out). A key whose monthly quota answered QUOTA_EXCEEDED is rested and the next one is used;
// with every key out, reads go keyless (the relay's own anonymous budget).
const keyOut = new Map<string, number>()
const KEY_OUT_MS = 10 * 60_000
const keysNow = (): string[] => [process.env.ARKIV_KEY, process.env.ARKIV_KEY_2].filter((k): k is string => !!k && Date.now() > (keyOut.get(k) ?? 0))
/**
 * One call to Arkiv. With the first key that isn't rested; if its monthly quota is spent (`QUOTA_EXCEEDED`,
 * a 429) the key is rested for ten minutes and the same call goes out with the next key, then keyless. A
 * plain 429 is not retried: it is a budget, and the browser is told so it can go direct.
 */
async function upstream(call: Call, key: string | undefined): Promise<{ r: Response; text: string }> {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: call.method, params: call.params ?? [] })
  if (key)
    for (const k of keysNow()) {
      const res = await attempt(body, k)
      if (res.r.status === 429 && /QUOTA_EXCEEDED/.test(res.text)) {
        keyOut.set(k, Date.now() + KEY_OUT_MS)
        continue
      }
      return res
    }
  return attempt(body, undefined)
}
/** The call itself, bounded in time and tried twice: a dropped socket or a 5xx is retried once after a short pause. */
async function attempt(body: string, key: string | undefined): Promise<{ r: Response; text: string }> {
  let last: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(UPSTREAM, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
        body,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
      const text = await r.text()
      if (r.status < 500 || attempt === 1) return { r, text }
      last = new Error(`Arkiv answered ${r.status}`)
    } catch (e) {
      last = e
      if (attempt === 1) throw e
    }
    await new Promise((f) => setTimeout(f, 250))
  }
  throw last
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  // mirrors on other hosts (GitHub Pages, a saved file) may fall back to this relay
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-fresh')
  if (req.method === 'OPTIONS') return res.status(204).json(null)
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST JSON-RPC here, or use the Arkiv RPC directly: ' + UPSTREAM })
  let body: Call | Call[]
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Call | Call[]
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  // a marker that reads may use the relay's keys (which one is upstream()'s choice)
  const key = process.env.ARKIV_KEY || process.env.ARKIV_KEY_2
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const n = Array.isArray(body) ? body.length : 1
  if (Array.isArray(body) && body.length > MAX_BATCH) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `At most ${MAX_BATCH} calls per batch` } })
  if (paced(ip, n)) {
    res.setHeader('Retry-After', '30')
    return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32005, message: `Too many calls from this network in a minute. Flip the site to "direct" or talk to ${UPSTREAM} yourself.` } })
  }
  const fresh = req.headers['x-fresh'] === '1' && allow(freshes, ip, FRESH_PER_IP)
  if (Array.isArray(body)) return res.status(200).json(await Promise.all(body.map((c) => one(c, key, fresh, ip))))
  return res.status(200).json(await one(body, key, fresh, ip))
}
