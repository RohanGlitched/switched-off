// Re-checks every machine-checkable item in arkiv/friction.md against the installed SDK, the live
// Tiramisu node and the published docs. Run: npm run friction            (read-only, no key)
//                                         npm run friction -- --write (also the write checks)
//
// Each check reports one of:
//   STILL    the behaviour we documented still happens
//   CHANGED  Arkiv fixed or changed it since we wrote it down (good news; the item needs updating)
//   ERROR    the check could not run (network down, budget spent, ...): says nothing either way
//   SKIPPED  a write check with no funded key
// The exit code is 0 whatever the states are; only a crash of this script exits non-zero.
//
// Write checks need a funded Tiramisu key: FRICTION_KEY in the environment, or --write with a
// REGISTRAR_KEY line in .env.local (or in the file named by --key-file <path>). The key is never
// printed. Writes use small lifetimes and the app attribute 'switched-off-friction', and delete what
// they create, so they never touch the real register.
//
// Keyless reads spend a per-IP budget (100 units per arkiv_query, 10,000 an hour), so the read
// checks stay under 15 requests, and every transport has retryCount 0 and a timeout (item 11).
import fs from 'node:fs'
import http from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPublicClient, createWalletClient, ENTITY_EVENTS_ABI } from '@arkiv-network/sdk'
import { isValidAttributeName } from '@arkiv-network/sdk/attr'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { eq, MAX_LIMIT, SelectQueryBuilder } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { custom, http as httpTransport, keccak256, toHex, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

type State = 'STILL' | 'CHANGED' | 'ERROR' | 'SKIPPED'
type Kind = 'offline' | 'read' | 'docs' | 'write'
type Result = { id: string; item: string; title: string; kind: Kind; state: State; observed: string; at: string; durationMs: number }

const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const DOCS = 'https://docs.arkiv.network'
const DEAD = '0x000000000000000000000000000000000000dead'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'arkiv', 'friction-check.json')
const WRITE_FLAG = process.argv.includes('--write')
const require = createRequire(import.meta.url)
const sdkVersion: string = require('@arkiv-network/sdk/package.json').version
const viemVersion: string = require('viem/package.json').version
const started = Date.now()

// Every request to the Arkiv RPC goes through here, so the run can say how much budget it spent and
// notice a 429 whichever check hit it.
let rpcRequests = 0
let last429: { status: number; retryAfter: string | null; ratelimit: string | null; body: string } | undefined
const rpcFetch: typeof fetch = async (input, init) => {
  rpcRequests++
  const res = await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) })
  if (res.status === 429) {
    last429 = { status: 429, retryAfter: res.headers.get('retry-after'), ratelimit: res.headers.get('ratelimit'), body: (await res.clone().text()).slice(0, 300) }
  }
  return res
}
const transport = () => httpTransport(RPC, { retryCount: 0, timeout: 15_000, fetchFn: rpcFetch })
const pub = createPublicClient({ chain: tiramisu, transport: transport() })

const raw = async (method: string, params: unknown[], headers: Record<string, string> = {}) => {
  const res = await rpcFetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = undefined }
  if (res.status === 429) throw new Error(`HTTP 429 (keyless budget or rate limit; retry-after ${res.headers.get('retry-after')} s): ${text.slice(0, 160)}`)
  if (json === undefined) throw new Error(`HTTP ${res.status}, not JSON: ${text.slice(0, 160)}`)
  return { status: res.status, headers: res.headers, json }
}
const query = (q: string, opts: Record<string, unknown>) => raw('arkiv_query', [q, opts])

const docsCache = new Map<string, Promise<string>>()
const docs = (p: string) => {
  if (!docsCache.has(p)) {
    docsCache.set(p, fetch(DOCS + p, { signal: AbortSignal.timeout(15_000) }).then(async (r) => {
      if (!r.ok) throw new Error(`${DOCS + p} answered HTTP ${r.status}`)
      return r.text()
    }))
  }
  return docsCache.get(p)!
}

const oneLine = (s: unknown) => String(s).replace(/\s+/g, ' ').trim()
const errText = (e: unknown) => {
  const err = e as Error & { details?: string }
  return oneLine(`${err?.name ?? 'Error'}: ${err?.details ? `${err.message.split('\n')[0]} (${err.details})` : err?.message ?? e}`).slice(0, 400)
}

const results: Result[] = []
async function check(id: string, item: string, title: string, kind: Kind, f: () => Promise<[State, string]> | [State, string]) {
  const t0 = Date.now()
  let state: State
  let observed: string
  try {
    ;[state, observed] = await f()
  } catch (e) {
    state = 'ERROR'
    observed = `could not check: ${errText(e)}`
  }
  const r: Result = { id, item, title, kind, state, observed: oneLine(observed), at: new Date().toISOString(), durationMs: Date.now() - t0 }
  results.push(r)
  console.log(`${state.padEnd(8)} #${id.padEnd(11)} ${title} — observed: ${r.observed}`)
}

// A wallet on a transport that answers eth_blockNumber and refuses everything else, so we can see
// whether the SDK stops a write client-side (no request past the block number) or sends it.
function probeWallet() {
  const calls: string[] = []
  const t = custom({
    async request({ method }) {
      calls.push(method)
      if (method === 'eth_blockNumber') return '0x100000'
      if (method === 'eth_chainId') return toHex(tiramisu.id)
      throw new Error(`probe stop at ${method}`)
    },
  }, { retryCount: 0 })
  return { calls, w: createWalletClient({ chain: tiramisu, transport: t, account: privateKeyToAccount(generatePrivateKey()) }) }
}
const base = { payload: jsonToPayload({ note: 'friction check' }), contentType: 'application/json' as const }

console.log(`Arkiv friction re-check · @arkiv-network/sdk ${sdkVersion} · viem ${viemVersion} · Node ${process.version} · chain ${tiramisu.id}\n`)

// ---------------------------------------------------------------- offline: the installed SDK and viem

await check('1-sdk', '1', 'SDK accepts a camelCase attribute name client-side', 'offline', async () => {
  const valid = isValidAttributeName('orderId')
  const { calls, w } = probeWallet()
  let err = ''
  try { await w.createEntity({ ...base, attributes: { app: 'switched-off-friction', orderId: 'x' }, expires: ExpirationTime.fromBlocks(30) }) } catch (e) { err = errText(e) }
  // Past eth_blockNumber (expiry resolution) the SDK has encoded the attributes and is building the transaction.
  const sent = calls.some((c) => c !== 'eth_blockNumber' && c !== 'eth_chainId') && !/InvalidAttributeName/.test(err)
  if (valid && sent) return ['STILL', `isValidAttributeName('orderId') = true and createEntity went on to build the transaction (${calls.join(', ')}); the node half is check 1-node`]
  return ['CHANGED', `isValidAttributeName('orderId') = ${valid}; createEntity: ${err || 'no error'} (requests: ${calls.join(', ') || 'none'})`]
})

await check('2', '2', 'fromSeconds(299) is refused, and the message does not point at atDate', 'offline', () => {
  try {
    const l = ExpirationTime.fromSeconds(299)
    return ['CHANGED', `fromSeconds(299) no longer throws: ${JSON.stringify(l, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}`]
  } catch (e) {
    const m = errText(e)
    if (/atDate/.test(m)) return ['CHANGED', `still refused, but the message now mentions atDate: ${m}`]
    return ['STILL', m]
  }
})

await check('3-sdk', '3', 'SDK refuses a query with no filter, before sending anything', 'offline', async () => {
  const calls: string[] = []
  const c = createPublicClient({ chain: tiramisu, transport: custom({ async request({ method }) { calls.push(method); throw new Error(`probe stop at ${method}`) } }, { retryCount: 0 }) })
  try {
    await c.select({ key: true }).limit(1).fetch()
    return ['CHANGED', 'select().limit(1).fetch() no longer throws']
  } catch (e) {
    const m = errText(e)
    if (!/InvalidPredicateError/.test(m)) return ['CHANGED', `throws something else now: ${m}`]
    const quotes = m.includes(`'match every entity"`) ? ' (quotes still mismatched)' : ' (quotes now match)'
    return ['STILL', `${m.slice(0, 200)}${quotes}; requests sent: ${calls.length}`]
  }
})

await check('6', '6', 'watchEntityEvents has no filter, and polls every second by default', 'offline', async () => {
  // 1) The parameter type, read from the SDK's published declarations.
  const dist = path.dirname(require.resolve('@arkiv-network/sdk'))
  let names: string[] = []
  for (const f of fs.readdirSync(dist).filter((f) => f.endsWith('.d.ts'))) {
    const src = fs.readFileSync(path.join(dist, f), 'utf8')
    const at = src.indexOf('type WatchEntityEventsParameters = {')
    if (at < 0) continue
    const block = src.slice(at, src.indexOf('\n};', at))
    names = [...block.matchAll(/^\s+(\w+)\?:/gm)].map((m) => m[1])
    break
  }
  if (names.length === 0) throw new Error('WatchEntityEventsParameters not found in the SDK declarations')
  const filterish = names.filter((n) => !n.startsWith('on') && /filter|where|owner|creator|attribute|query|key/i.test(n))
  // 2) What the watcher actually asks the node for, on a transport that records it.
  const seen: { method: string; params: any; t: number }[] = []
  const t0 = Date.now()
  const c = createPublicClient({
    chain: tiramisu,
    transport: custom({
      async request({ method, params }) {
        seen.push({ method, params, t: Date.now() - t0 })
        if (method === 'eth_newFilter') return '0x1'
        if (method === 'eth_getFilterChanges') return []
        if (method === 'eth_blockNumber') return '0x1'
        if (method === 'eth_uninstallFilter') return true
        if (method === 'eth_chainId') return toHex(tiramisu.id)
        throw new Error(`unexpected ${method}`)
      },
    }, { retryCount: 0 }),
  })
  // An owner filter is passed on purpose: if the watcher ever grows one, it shows up in the topics.
  const unwatch = c.watchEntityEvents({ onEvent: () => {}, onError: () => {}, ...({ owner: DEAD } as object) })
  await new Promise((r) => setTimeout(r, 2_300))
  unwatch()
  const nf = seen.find((s) => s.method === 'eth_newFilter')
  const polls = seen.filter((s) => s.method === 'eth_getFilterChanges')
  const topics = nf?.params?.[0]?.topics ?? []
  const narrowed = topics.slice(1).some((t: unknown) => t !== null && t !== undefined)
  const interval = polls.length >= 2 ? polls[1].t - polls[0].t : polls.length === 1 && nf ? polls[0].t - nf.t : NaN
  const obs = `options: ${names.join(', ')}; eth_newFilter address ${nf?.params?.[0]?.address}, ${Array.isArray(topics[0]) ? topics[0].length : 0} event topics, ${narrowed ? 'narrowed by a second topic' : 'nothing narrower'}; poll gap ${interval} ms`
  if (filterish.length || narrowed) return ['CHANGED', obs]
  return ['STILL', obs]
})

await check('7', '7', 'ExpiryExtended does not carry who extended', 'offline', () => {
  const ev = (ENTITY_EVENTS_ABI as readonly any[]).find((e) => e.name === 'ExpiryExtended')
  if (!ev) throw new Error('ExpiryExtended is not in ENTITY_EVENTS_ABI')
  const inputs = ev.inputs.map((i: any) => `${i.type} ${i.name}`)
  const sender = ev.inputs.some((i: any) => /sender|extender|from|caller|by/i.test(i.name))
  return [sender ? 'CHANGED' : 'STILL', `ExpiryExtended(${inputs.join(', ')})`]
})

await check('9-readme', '9', 'SDK README install snippet pins an older version than npm installs', 'offline', () => {
  const readme = fs.readFileSync(path.join(path.dirname(require.resolve('@arkiv-network/sdk/package.json')), 'README.md'), 'utf8')
  const pinned = readme.match(/"@arkiv-network\/sdk":\s*"([^"]+)"/)?.[1]
  if (!pinned) return ['CHANGED', 'the README no longer shows a version in its install snippet']
  const same = pinned.replace(/^[\^~]/, '') === sdkVersion
  return [same ? 'CHANGED' : 'STILL', `README snippet "${pinned}", installed ${sdkVersion}`]
})

await check('9-limits', '9', 'No orderBy in the query builder; MAX_LIMIT is 200', 'offline', () => {
  const hasOrder = Object.getOwnPropertyNames(SelectQueryBuilder.prototype).filter((n) => /order|sort/i.test(n))
  const obs = `MAX_LIMIT = ${MAX_LIMIT}; ordering methods: ${hasOrder.join(', ') || 'none'}`
  return [hasOrder.length === 0 && MAX_LIMIT === 200 ? 'STILL' : 'CHANGED', obs]
})

await check('11-viem', '11', "viem's http transport obeys a 429 retry-after with 3 retries by default", 'offline', async () => {
  // A local server that answers every request with 429 and retry-after: 1, like the spent budget.
  let hits = 0
  const server = http.createServer((_req, res) => {
    hits++
    res.writeHead(429, { 'retry-after': '1', 'content-type': 'application/json' })
    res.end('{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted"}')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  try {
    const c = createPublicClient({ chain: tiramisu, transport: httpTransport(`http://127.0.0.1:${port}`) })
    const t0 = Date.now()
    let msg = ''
    try { await c.getBlockNumber() } catch (e) { msg = errText(e) }
    const waited = (Date.now() - t0) / 1000
    const defaults = hits
    hits = 0
    const fast = createPublicClient({ chain: tiramisu, transport: httpTransport(`http://127.0.0.1:${port}`, { retryCount: 0 }) })
    const t1 = Date.now()
    try { await fast.getBlockNumber() } catch { /* expected */ }
    const fastWait = (Date.now() - t1) / 1000
    const obs = `default transport: ${defaults} requests over ${waited.toFixed(1)} s for retry-after 1 s (every retry waits the full retry-after; at Arkiv's ~1000 s the first retry alone is ~17 min); retryCount 0: ${hits} request, ${fastWait.toFixed(1)} s; error: ${msg.slice(0, 80)}`
    return [defaults >= 4 && waited >= (defaults - 1) * 0.9 ? 'STILL' : 'CHANGED', obs]
  } finally {
    server.close()
  }
})

await check('ok-str128', 'smooth', 'A str attribute over 128 bytes is refused before sending', 'offline', async () => {
  const { calls, w } = probeWallet()
  try {
    await w.createEntity({ ...base, attributes: { app: 'switched-off-friction', basis: 'x'.repeat(139) }, expires: ExpirationTime.fromBlocks(30) })
    return ['CHANGED', 'a 139-byte str was accepted client-side']
  } catch (e) {
    const m = errText(e)
    const sentTx = calls.some((c) => c !== 'eth_blockNumber' && c !== 'eth_chainId')
    if (/InvalidValueError/.test(m) && !sentTx) return ['STILL', `${m.slice(0, 220)} (requests: ${calls.join(', ') || 'none'})`]
    return ['CHANGED', `${m.slice(0, 220)} (requests: ${calls.join(', ')})`]
  }
})

// ---------------------------------------------------------------- docs.arkiv.network (no RPC budget)

await check('2-docs', '2', 'The docs point a deadline at atDate', 'docs', async () => {
  const md = await docs('/typescript-sdk/mutating-data.md')
  const atDate = /atDate\(/.test(md)
  const deadline = /deadline/i.test(md) && atDate
  return [deadline ? 'CHANGED' : 'STILL', deadline ? 'the SDK mutating-data page now explains atDate() for deadlines ("rounds up, so the entity lives until at least that instant")' : 'no atDate guidance for deadlines on the mutating-data page']
})

await check('3-docs', '3', 'The RPC docs list `*` as match-everything, and do not say the SDK refuses it', 'docs', async () => {
  const rpcDocs = await docs('/json-rpc/querying-data.md')
  const sdkDocs = await docs('/typescript-sdk/querying-data.md')
  const star = /Match everything/i.test(rpcDocs)
  const explained = /SDK[^.\n]{0,160}(\*|match every|at least one filter)/i.test(rpcDocs)
  const sdkNote = /needs at least one filter/i.test(sdkDocs)
  const obs = `RPC querying page ${star ? 'lists `*` under "Match everything"' : 'no longer lists `*`'}${explained ? ' and says the SDK refuses it' : ', no word that the SDK refuses it'}; SDK querying page ${sdkNote ? 'says "A query needs at least one filter."' : 'does not mention it'}`
  return [star && !explained ? 'STILL' : 'CHANGED', obs]
})

await check('4-docs', '4', 'The Tiramisu network page does not link the query grammar', 'docs', async () => {
  const md = await docs('/networks/tiramisu.md')
  const linked = /json-rpc\/querying-data|str\('/.test(md)
  return [linked ? 'CHANGED' : 'STILL', linked ? 'the network page body now links the query grammar' : "the page body (RPC URL table, raw JSON-RPC tip) has no link to json-rpc/querying-data; only the site-wide sidebar lists it"]
})

const budgetNumber = /\b\d[\d,.]*\s*(cost\s*)?units\b|\b\d[\d,.]*\s*(requests|queries|calls)\s*(per|an?|\/|every)\s*(second|minute|hour|day|month)/i
await check('5-docs', '5', 'The keyless budget (size, window, per-method cost) is not written down', 'docs', async () => {
  const pages = ['/networks/tiramisu.md', '/start-here/access-keys.md', '/json-rpc/querying-data.md']
  const hits: string[] = []
  for (const p of pages) { const m = (await docs(p)).match(budgetNumber); if (m) hits.push(`${p}: "${m[0]}"`) }
  return [hits.length ? 'CHANGED' : 'STILL', hits.length ? `numbers now stated: ${hits.join('; ')}` : `no budget size, window or per-call cost on ${pages.join(', ')} (access-keys says only "at the default rate limit")`]
})

await check('9-docs', '9', 'The docs home and Python guide state old SDK versions', 'docs', async () => {
  const home = await docs('/')
  const sitemap = await docs('/sitemap-0.xml')
  const homeVersion = home.match(/SDK v?(\d+\.\d+\.\d+)/i)?.[1]
  const python = (sitemap.match(/<loc>[^<]*python[^<]*<\/loc>/gi) ?? []).length
  const obs = `docs home ${homeVersion ? `says SDK v${homeVersion}` : 'shows no SDK version string'}; sitemap lists ${python} Python page(s)`
  if (homeVersion && homeVersion !== sdkVersion) return ['STILL', obs]
  return ['CHANGED', obs]
})

await check('12-docs', '12', "A key's quota use and reset day are not shown anywhere", 'docs', async () => {
  const md = await docs('/start-here/access-keys.md')
  const usage = /Usage\*\* tab|Usage tab/i.test(md) && /reset/i.test(md)
  const size = md.match(budgetNumber)
  const obs = `${usage ? 'access-keys page now says the Hub\'s Usage tab shows the cost units used this month and the reset date' : 'no usage meter described'}; quota size ${size ? `stated ("${size[0]}")` : 'still not stated'}`
  return [usage || size ? 'CHANGED' : 'STILL', obs]
})

// ---------------------------------------------------------------- keyless reads (about 10 requests)

let blockNumber: bigint | undefined
try { blockNumber = await pub.getBlockNumber() } catch (e) { console.log(`(could not read the block number: ${errText(e)})`) }

let starHeaders: Headers | undefined
await check('3-rpc', '3', 'Raw arkiv_query accepts `*`', 'read', async () => {
  const r = await raw('arkiv_query', ['*', { select: { key: true }, limit: '0x1' }], { origin: 'https://example.org' })
  starHeaders = r.headers
  if (r.json.error) return ['CHANGED', `the node now refuses "*": ${JSON.stringify(r.json.error).slice(0, 200)}`]
  return ['STILL', `"*" returned ${r.json.result?.data?.length ?? '?'} entity (HTTP ${r.status}); the SDK refuses the same query (3-sdk)`]
})

await check('4', '4', 'A JSON-style string literal fails with a bare "unexpected character"', 'read', async () => {
  const r = await query('app = "switched-off"', { select: { key: true }, limit: '0x1' })
  const e = r.json.error
  if (!e) return ['CHANGED', `the node now accepts app = "switched-off" (${r.json.result?.data?.length} results)`]
  const hint = /str\(/.test(JSON.stringify(e))
  return [hint ? 'CHANGED' : 'STILL', `${JSON.stringify(e)}${hint ? ' (now suggests str(...))' : ''}`]
})

await check('4a', '4a', 'A bare number compares as i32, so a u64 range silently returns nothing', 'read', async () => {
  const q = "app = str('switched-off') AND type = str('record') AND issued > "
  const count = async (lit: string) => {
    const r = await query(q + lit, { select: { key: true }, limit: '0x5' })
    if (r.json.error) return `error ${JSON.stringify(r.json.error).slice(0, 120)}`
    return r.json.result.data.length as number
  }
  const bare = await count('1')
  const typed = await count('u64(1)')
  const obs = `issued > 1 → ${bare}, issued > u64(1) → ${typed} (limit 5)`
  if (bare === 0 && typeof typed === 'number' && typed > 0) return ['STILL', `${obs}; no error for the mismatch`]
  if (typeof typed !== 'number' || typed === 0) return ['ERROR', `${obs}; the typed query found nothing, so the comparison proves nothing`]
  return ['CHANGED', obs]
})

await check('5', '5', 'Every keyless arkiv_query costs 100 units, rate limit in headers only', 'read', () => {
  if (!starHeaders) throw new Error('no response headers (3-rpc did not complete)')
  const cost = starHeaders.get('arkiv-cost')
  const rl = starHeaders.get('ratelimit')
  const policy = starHeaders.get('ratelimit-policy')
  let obs = `arkiv-cost: ${cost ?? 'absent'}; ratelimit: ${rl ?? 'absent'}${policy ? `; ratelimit-policy: ${policy}` : ''}`
  if (last429) obs += `; a 429 this run: retry-after ${last429.retryAfter}, body ${last429.body.slice(0, 120)} (${/"jsonrpc"/.test(last429.body) ? 'JSON-RPC shaped' : 'not JSON-RPC shaped'})`
  return [cost === '100' ? 'STILL' : 'CHANGED', obs]
})

await check('12-header', '12', 'A keyless read carries no Arkiv-Quota-Used-Percent, though CORS exposes it', 'read', () => {
  if (!starHeaders) throw new Error('no response headers (3-rpc did not complete)')
  const pct = starHeaders.get('arkiv-quota-used-percent')
  const exposed = (starHeaders.get('access-control-expose-headers') ?? '').toLowerCase().includes('arkiv-quota-used-percent')
  const obs = `arkiv-quota-used-percent ${pct === null ? 'absent' : `= ${pct}`}; listed in access-control-expose-headers: ${exposed}`
  return [pct === null ? 'STILL' : 'CHANGED', obs]
})

// The pinned expiry evidence (scripts/evidence.json): a 30-block entity created at block 437835.
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'evidence.json'), 'utf8')) as { entityKey: Hex; atBlockHex: string; query: string }
let historyRow: any
await check('8', '8', 'getEntity says the same thing for expired and never-existed keys', 'read', async () => {
  const never = keccak256(toHex('switched-off friction: a key nobody created')) as Hex
  const ask = async (k: Hex) => { try { await pub.getEntity(k); return 'found' } catch (e) { return errText(e) } }
  const expired = await ask(evidence.entityKey)
  const missing = await ask(never)
  if (expired === 'found') return ['ERROR', `the evidence entity ${evidence.entityKey} is live again (extended?), so it cannot stand for an expired one`]
  if (/HTTP|429|timed out|fetch failed/i.test(expired + missing)) throw new Error(expired)
  const same = expired.replace(evidence.entityKey, '<key>').replace(evidence.entityKey.toLowerCase(), '<key>') === missing.replace(never, '<key>')
  return [same ? 'STILL' : 'CHANGED', same ? `identical for both: ${expired.replace(evidence.entityKey, '<key>').slice(0, 200)}` : `expired: ${expired.slice(0, 160)} | never existed: ${missing.slice(0, 160)}`]
})

await check('ok-history', 'smooth', 'An expired entity is still returned by a query at an earlier block', 'read', async () => {
  const r = await pub.select({ key: true, attributes: true }).where(eq('app', 'switched-off'), eq('order_id', 'drill-evidence-lapse')).atBlock(BigInt(evidence.atBlockHex)).fetch()
  historyRow = r.entities[0]
  const found = r.entities.some((e: any) => e.key === evidence.entityKey)
  return [found ? 'STILL' : 'CHANGED', `atBlock(${evidence.atBlockHex}) → ${r.entities.length} entity${found ? ' (the evidence key)' : ''}, ${blockNumber ? `${(blockNumber - BigInt(evidence.atBlockHex)).toLocaleString('en')} blocks ago` : ''}`]
})

await check('9-tagged', '9', 'Attributes read back tagged ({type, value}) though written bare', 'read', () => {
  if (!historyRow) throw new Error('no entity from ok-history to inspect')
  const attrs = historyRow.attributes
  const [name, value] = Array.isArray(attrs) ? [attrs[0]?.key ?? attrs[0]?.name, attrs[0]] : (Object.entries(attrs ?? {})[0] ?? [])
  const json = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? 'undefined'
  const tagged = /"type"/.test(json) && /"value"/.test(json)
  return [tagged ? 'STILL' : 'CHANGED', `written as app: 'switched-off', reads back as ${name}: ${json.slice(0, 160)}`]
})

await check('10', '10', 'A sealed record cannot be repaired: its owner is 0x…dEaD', 'read', async () => {
  const corrections = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'corrections.json'), 'utf8'))
  const original = corrections.batches[0].corrections[0].corrects as Hex
  const e = await pub.getEntity(original)
  const owner = String(e.owner).toLowerCase()
  return [owner === DEAD ? 'STILL' : 'CHANGED', `original ${original.slice(0, 10)}… is live, owner ${e.owner}, so only a correction entity can fix it`]
})

await check('11-logs', '11', 'eth_getLogs answers at most 100,000 blocks', 'read', async () => {
  const head = blockNumber ?? (await pub.getBlockNumber())
  const r = await raw('eth_getLogs', [{ fromBlock: toHex(head - 100_001n), toBlock: toHex(head), address: '0x4400000000000000000000000000000000000044', topics: [keccak256(toHex('friction-check: no such event()'))] }])
  if (r.json.error) return [/100000|100,000/.test(r.json.error.message) ? 'STILL' : 'CHANGED', `100,002-block range: ${JSON.stringify(r.json.error)}`]
  return ['CHANGED', `a 100,002-block range is answered now (${r.json.result.length} logs)`]
})

// ---------------------------------------------------------------- writes (need a funded key)

function writeKey(): { key?: Hex; why?: string } {
  const fromEnv = process.env.FRICTION_KEY?.trim()
  let k: string | undefined = fromEnv
  if (!k) {
    if (!WRITE_FLAG) return { why: 'read-only run (pass --write, or set FRICTION_KEY, to run the write checks)' }
    const at = process.argv.indexOf('--key-file')
    const envFile = at > 0 && process.argv[at + 1] ? path.resolve(process.argv[at + 1]) : path.join(process.cwd(), '.env.local')
    if (!fs.existsSync(envFile)) return { why: `--write given, but no FRICTION_KEY and no ${path.basename(envFile)} file` }
    const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.startsWith('REGISTRAR_KEY='))
    k = line?.slice('REGISTRAR_KEY='.length).trim()
    if (!k) return { why: '--write given, but .env.local has no REGISTRAR_KEY' }
  }
  if (!k.startsWith('0x')) k = `0x${k}`
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) return { why: 'the key is not a 32-byte hex private key' }
  return { key: k as Hex }
}

const wk = writeKey()
let wallet: ReturnType<typeof createWalletClient> | undefined
if (wk.key) {
  const account = privateKeyToAccount(wk.key)
  try {
    const bal = await pub.getBalance({ address: account.address })
    if (bal === 0n) wk.why = 'the write key holds no GLM'
    else wallet = createWalletClient({ chain: tiramisu, transport: httpTransport(RPC, { retryCount: 0, timeout: 60_000, fetchFn: rpcFetch }), account })
  } catch (e) { wk.why = `could not read the write key's balance: ${errText(e)}` }
}
const writeCheck = (id: string, item: string, title: string, f: (w: NonNullable<typeof wallet>) => Promise<[State, string]>) =>
  check(id, item, title, 'write', () => (wallet ? f(wallet) : (['SKIPPED', wk.why ?? 'no write key'] as [State, string])))

await writeCheck('1-node', '1', 'The node rejects the camelCase name the SDK let through', async (w) => {
  try {
    const r = await w.createEntity({ ...base, attributes: { app: 'switched-off-friction', orderId: 'x' }, expires: ExpirationTime.fromBlocks(30) })
    return ['CHANGED', `the node accepted orderId (entity ${r.entityKey}, lives 30 blocks)`]
  } catch (e) {
    const m = errText(e)
    if (!/name/i.test(m)) throw e
    const listsUpper = /"A"\s*-\s*"Z"/.test(m)
    return [listsUpper ? 'STILL' : 'CHANGED', `${m.slice(0, 300)}${listsUpper ? '' : ' (message changed)'}`]
  }
})

await writeCheck('ok-pricing', 'smooth', 'Lifetime is not priced: a 1-day and a 365-day create cost the same gas', async (w) => {
  const gas: Record<number, bigint> = {}
  const keys: Hex[] = []
  let cleanup = 'nothing to delete'
  try {
    for (const days of [1, 365]) {
      const r = await w.createEntity({ ...base, attributes: { app: 'switched-off-friction', probe: 'pricing', days }, expires: ExpirationTime.fromDays(days) })
      keys.push(r.entityKey)
      gas[days] = (await pub.getTransactionReceipt({ hash: r.txHash })).gasUsed
    }
  } finally {
    if (keys.length) {
      cleanup = await w.executeBatch({ deletes: keys.map((entityKey) => ({ entityKey })) }).then(
        () => `deleted both again in one batch`,
        (e) => `delete failed, they lapse on their own: ${errText(e).slice(0, 120)}`,
      )
    }
  }
  const obs = `gasUsed 1 day ${gas[1]}, 365 days ${gas[365]}; ${cleanup}`
  return [gas[365] <= (gas[1] * 101n) / 100n ? 'STILL' : 'CHANGED', obs]
})

// ---------------------------------------------------------------- summary

// Report in the order of arkiv/friction.md; checks of one item keep the order they ran in.
const ORDER = ['1', '2', '3', '4a', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'smooth']
results.sort((a, b) => ORDER.indexOf(a.item) - ORDER.indexOf(b.item))
const counts = { STILL: 0, CHANGED: 0, ERROR: 0, SKIPPED: 0 } as Record<State, number>
for (const r of results) counts[r.state]++
const durationMs = Date.now() - started
const report = {
  tool: 'scripts/friction-check.ts',
  generatedAt: new Date().toISOString(),
  mode: wallet ? 'read+write' : 'read-only',
  sdkVersion,
  viemVersion,
  node: process.version,
  chainId: tiramisu.id,
  rpc: RPC,
  blockNumber: blockNumber?.toString() ?? null,
  durationMs,
  rpcRequests,
  counts,
  states: { STILL: 'the behaviour we documented still happens', CHANGED: 'Arkiv fixed or changed it', ERROR: 'could not check', SKIPPED: 'write check without a funded key' },
  checks: results,
}
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n')

const w1 = Math.max(...results.map((r) => r.id.length), 2)
const w2 = Math.max(...results.map((r) => r.title.length), 5)
console.log(`\n${'id'.padEnd(w1)}  ${'state'.padEnd(8)}  ${'kind'.padEnd(7)}  title`)
console.log(`${'-'.repeat(w1)}  ${'-'.repeat(8)}  ${'-'.repeat(7)}  ${'-'.repeat(Math.min(w2, 80))}`)
for (const r of results) console.log(`${r.id.padEnd(w1)}  ${r.state.padEnd(8)}  ${r.kind.padEnd(7)}  ${r.title}`)
console.log(`\n${results.length} checks: ${counts.STILL} still, ${counts.CHANGED} changed, ${counts.ERROR} error, ${counts.SKIPPED} skipped · block ${blockNumber ?? '?'} · ${rpcRequests} RPC requests · ${(durationMs / 1000).toFixed(1)} s`)
console.log(`Written: ${path.relative(process.cwd(), OUT)}`)
