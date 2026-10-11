// A thin JSON-RPC relay to Arkiv Tiramisu. It exists for one reason: Arkiv meters anonymous
// queries, and an API key in browser code can be read and spent by anyone. So the key stays here,
// identical reads are shared for a few seconds, and only the methods this app needs pass.
// Transactions are signed in the visitor's browser; this relay only forwards the signed bytes.
// Readers who don't want to trust it can flip the site to "direct" and talk to Arkiv themselves.

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
const CACHE_MS: Record<string, number> = { arkiv_query: 4000, eth_blockNumber: 1500, arkiv_getBlockTiming: 1500, arkiv_getEntityCount: 10000, eth_chainId: 3600_000, eth_getLogs: 1500, eth_getFilterChanges: 1500 }
const cache = new Map<string, { at: number; body: unknown }>()
const CACHE_MAX_BYTES = 200_000
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
 * The only query shape the relay forwards: a conjunction of simple comparisons, exactly as the SDK
 * writes them (`name = str('…') AND issued > u64(1)`), plus `$key = key(0x…)`, `$owner`/`$creator =
 * addr(0x…)`. No brackets, no OR, no NOT, no stray quotes: nothing a caller writes can escape the
 * app clause that is put in front of it.
 */
const TERM = String.raw`\$?[A-Za-z_][A-Za-z0-9_.-]*\s*(?:=|!=|>=|<=|>|<)\s*(?:str\('[^'()\\]*'\)|u64\(\d{1,20}\)|i32\(-?\d{1,10}\)|key\(0x[0-9a-fA-F]{64}\)|addr\(0x[0-9a-fA-F]{40}\)|true|false|-?\d{1,20})`
const QUERY = new RegExp(String.raw`^\s*(?:${TERM})(?:\s+AND\s+(?:${TERM}))*\s*$`)
const HEX = /^0x[0-9a-fA-F]{1,16}$/
const HEX_WORD = /^0x[0-9a-fA-F]{64}$/

/** Why a call is refused, or null. The key is spent only on this app's own reads and on Arkiv's contract. */
function refused(call: Call): string | null {
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
  if (call.method === 'eth_getTransactionByHash' || call.method === 'eth_getTransactionReceipt') {
    if (typeof p[0] !== 'string' || !HEX_WORD.test(p[0])) return 'Bad transaction hash.'
  }
  return null
}

type Call = { jsonrpc: '2.0'; id: unknown; method: string; params?: unknown[] }
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

async function one(call: Call, key: string | undefined): Promise<unknown> {
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
    const ttl = CACHE_MS[call.method]
    const ck = ttl ? `${call.method}:${JSON.stringify(call.params ?? [])}` : ''
    const hit = ck ? cache.get(ck) : undefined
    if (hit && Date.now() - hit.at < ttl) return { jsonrpc: '2.0', id: call.id, ...(hit.body as object) }
    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: call.method, params: call.params ?? [] }),
    })
    const text = await r.text()
    let j: { result?: unknown; error?: unknown }
    try {
      j = JSON.parse(text) as { result?: unknown; error?: unknown }
    } catch {
      j = { error: { code: -32603, message: `Arkiv answered ${r.status}: ${text.slice(0, 160)}` } }
    }
    const body = 'result' in j ? { result: j.result } : { error: j.error ?? { code: -32603, message: `Arkiv answered ${r.status}` } }
    if (ck && 'result' in body && text.length <= CACHE_MAX_BYTES) {
      cache.set(ck, { at: Date.now(), body })
      if (cache.size > 500) cache.delete(cache.keys().next().value!)
    }
    return { jsonrpc: '2.0', id: call.id, ...body }
  } catch (e) {
    return { jsonrpc: '2.0', id: (call as Call | null)?.id ?? null, error: { code: -32603, message: `Relay error: ${String((e as Error).message).slice(0, 160)}` } }
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  // mirrors on other hosts (GitHub Pages, a saved file) may fall back to this relay
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') return res.status(204).json(null)
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST JSON-RPC here, or use the Arkiv RPC directly: ' + UPSTREAM })
  let body: Call | Call[]
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Call | Call[]
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  const key = process.env.ARKIV_KEY
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const n = Array.isArray(body) ? body.length : 1
  if (Array.isArray(body) && body.length > MAX_BATCH) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `At most ${MAX_BATCH} calls per batch` } })
  if (paced(ip, n)) {
    res.setHeader('Retry-After', '30')
    return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32005, message: `Too many calls from this network in a minute. Flip the site to "direct" or talk to ${UPSTREAM} yourself.` } })
  }
  if (Array.isArray(body)) return res.status(200).json(await Promise.all(body.map((c) => one(c, key))))
  return res.status(200).json(await one(body, key))
}
