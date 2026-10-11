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
const CACHE_MS: Record<string, number> = { arkiv_query: 4000, eth_blockNumber: 1500, arkiv_getBlockTiming: 1500, arkiv_getEntityCount: 10000, eth_chainId: 3600_000, eth_getLogs: 1500 }
const cache = new Map<string, { at: number; body: unknown }>()

type Call = { jsonrpc: '2.0'; id: unknown; method: string; params?: unknown[] }
type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

async function one(call: Call, key: string | undefined): Promise<unknown> {
  if (!call || typeof call.method !== 'string' || !ALLOW.has(call.method))
    return { jsonrpc: '2.0', id: call?.id ?? null, error: { code: -32601, message: `Method not relayed: ${call?.method}. Talk to ${UPSTREAM} directly for anything else.` } }
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST JSON-RPC here, or use the Arkiv RPC directly: ' + UPSTREAM })
  let body: Call | Call[]
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Call | Call[]
  } catch {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })
  }
  const key = process.env.ARKIV_KEY
  if (Array.isArray(body)) {
    if (body.length > 20) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'At most 20 calls per batch' } })
    return res.status(200).json(await Promise.all(body.map((c) => one(c, key))))
  }
  return res.status(200).json(await one(body, key))
}
