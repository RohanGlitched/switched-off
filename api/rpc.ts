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
const ARKIV = '0x4400000000000000000000000000000000000044'
const MAX_BATCH = 10
const MAX_LOG_RANGE = 400_000n
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
/** Why a call is refused, or null. The key is spent only on this app's own reads and on Arkiv's contract. */
function refused(call: Call): string | null {
  const p = call.params ?? []
  if (call.method === 'arkiv_query') {
    const q = String(p[0] ?? '')
    if (typeof p[0] !== 'string' || !q.trim()) return 'Send a query expression.'
    if (q.length > 2000) return 'That query is too long.'
  }
  if (call.method === 'eth_getLogs') {
    const f = (p[0] ?? {}) as { address?: string | string[]; fromBlock?: string; toBlock?: string }
    const addrs = Array.isArray(f.address) ? f.address : [f.address ?? '']
    if (addrs.length !== 1 || String(addrs[0]).toLowerCase() !== ARKIV) return 'This relay only reads Arkiv entity logs.'
    if (typeof f.fromBlock === 'string' && typeof f.toBlock === 'string' && f.fromBlock.startsWith('0x') && f.toBlock.startsWith('0x') && BigInt(f.toBlock) - BigInt(f.fromBlock) > MAX_LOG_RANGE)
      return 'Ask for a narrower block range.'
  }
  if (call.method === 'eth_call' || call.method === 'eth_estimateGas') {
    const tx = (p[0] ?? {}) as { to?: string }
    if (String(tx.to ?? '').toLowerCase() !== ARKIV) return 'This relay only calls the Arkiv contract.'
  }
  return null
}

type Call = { jsonrpc: '2.0'; id: unknown; method: string; params?: unknown[] }
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

async function one(call: Call, key: string | undefined): Promise<unknown> {
  if (!call || typeof call.method !== 'string' || !ALLOW.has(call.method))
    return { jsonrpc: '2.0', id: call?.id ?? null, error: { code: -32601, message: `Method not relayed: ${call?.method}. Talk to ${UPSTREAM} directly for anything else.` } }
  const why = refused(call)
  if (why) return { jsonrpc: '2.0', id: call.id ?? null, error: { code: -32602, message: why } }
  // the key is spent on this app's data only: every query is wrapped in the app clause on the way out,
  // which also covers lookups by key ($key = key(0x…)) and attempts like NOT (app = …)
  if (call.method === 'arkiv_query') {
    const q = String(call.params![0])
    const scoped = /^\s*app\s*=\s*str\('switched-off'\)\s*AND\b/.test(q) ? q : `app = str('switched-off') AND (${q})`
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
  const j = (await r.json().catch(() => ({ error: { code: -32603, message: `Arkiv answered ${r.status}` } }))) as { result?: unknown; error?: unknown }
  const body = 'result' in j ? { result: j.result } : { error: j.error ?? { code: -32603, message: `Arkiv answered ${r.status}` } }
  if (ck && 'result' in body) {
    cache.set(ck, { at: Date.now(), body })
    if (cache.size > 500) cache.delete(cache.keys().next().value!)
  }
  return { jsonrpc: '2.0', id: call.id, ...body }
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
