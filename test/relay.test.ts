// The relay holds an API key, so what it forwards is the only thing standing between that key and
// anyone on the internet. Its grammar must accept every query the app itself sends and refuse
// anything that could escape the `app = str('switched-off')` clause put in front of it.
import { afterEach, describe, expect, it, vi } from 'vitest'
import handler, { QUERY, refused, ttlOf, type Call } from '../api/rpc'
import { queryText } from '../src/lib/arkiv'

const ARKIV = '0x4400000000000000000000000000000000000044'
const KEY = `0x${'a1'.repeat(32)}`
const ADDR = '0xA2724EA69eA093677D8426E7FE20644EE90a0E3e'
const call = (method: string, params?: unknown): Call => ({ jsonrpc: '2.0', id: 1, method, params: params as unknown[] })
const q = (query: unknown, opts?: unknown) => refused(call('arkiv_query', opts === undefined ? [query] : [query, opts]))

describe('the query grammar accepts the app’s own shapes', () => {
  it.each([
    "app = str('switched-off') AND type = str('order') AND net = str('live')",
    "app = str('switched-off') AND type = str('record') AND net = str('drill') AND $creator = addr(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e)",
    `$key = key(${KEY})`,
    `$creator = addr(${ADDR})`,
    `$owner = addr(${ADDR.toLowerCase()})`,
    'issued > u64(123)',
    "app = str('switched-off') AND type = str('report') AND net = str('live') AND seen > u64(1760000000)",
    "state = str('MN') AND issued >= u64(0) AND issued <= u64(18446744073709551615)",
    'seq = i32(-1) AND late = true AND emergency != false',
    "district = str('Imphal West')",
    "  type = str('order')  ",
  ])('%s', (query) => {
    expect(QUERY.test(query)).toBe(true)
    expect(q(query)).toBeNull()
  })

  it('accepts the text the pages show as their work', () => {
    expect(q(queryText('record', 'live'))).toBeNull()
    expect(q(queryText('record', 'drill', ["state = str('JK')", 'issued > u64(1683071999)']))).toBeNull()
  })

  it('accepts the options the SDK sends', () => {
    expect(q("type = str('order')", { select: { key: true, attributes: true }, limit: '0xc8', atBlock: '0x4c4b40', cursor: 'abc123' })).toBeNull()
    expect(q("type = str('order')", { limit: '0x1' })).toBeNull()
    expect(q("type = str('order')", {})).toBeNull()
  })
})

describe('the query grammar refuses escapes', () => {
  it.each([
    ["OR", "app = str('switched-off') OR type = str('order')"],
    ['lower-case or', "type = str('a') or type = str('b')"],
    ['NOT', "NOT type = str('order')"],
    ['brackets', "(type = str('order'))"],
    ['brackets after AND', "type = str('a') AND (net = str('b') OR net = str('c'))"],
    ['a quote that closes early', "type = str('a' OR x = 'b')"],
    ['an unclosed string', "type = str('order"],
    ['a doubled quote', "type = str('it''s')"],
    ['a bracket inside a string', "type = str('a) OR (b')"],
    ['a backslash inside a string', "type = str('a\\') OR x = str('b')"],
    ['a bare star', '*'],
    ['a star value', 'type = *'],
    ['STARTSWITH', "type STARTSWITH str('ord')"],
    ['EXISTS', 'EXISTS(type)'],
    ['a dangling AND', "type = str('order') AND"],
    ['two terms with no AND', "type = str('order') net = str('live')"],
    ['lower-case and', "type = str('order') and net = str('live')"],
    ['a short key', '$key = key(0x1234)'],
    ['a long address', `$creator = addr(0x${'1'.repeat(41)})`],
    ['an untyped string', "type = 'order'"],
    ['a semicolon', "type = str('order'); drop"],
    ['a newline joiner', "type = str('order')\nOR net = str('x')"],
  ])('%s', (_, query) => {
    expect(QUERY.test(query)).toBe(false)
    expect(q(query)).toMatch(/only simple AND queries/)
  })

  it('refuses an over-long query even when every term is well formed', () => {
    const long = Array.from({ length: 80 }, (_, i) => `t${i} = str('order')`).join(' AND ')
    expect(long.length).toBeGreaterThan(1200)
    expect(QUERY.test(long)).toBe(true)
    expect(q(long)).toBe('That query is too long.')
  })

  it('refuses an empty or non-string query', () => {
    expect(q('')).toMatch(/Send a query/)
    expect(q('   ')).toMatch(/Send a query/)
    expect(q(42)).toMatch(/Send a query/)
    expect(q({ query: "type = str('order')" })).toMatch(/Send a query/)
  })

  it.each([['0xc9'], ['0x3e8'], [200], ['200'], ['c8'], ['0x'], [`0x${'f'.repeat(17)}`]])('refuses limit %j', (limit) => expect(q("type = str('order')", { limit })).toMatch(/Limit must be/))
  it('refuses unknown options', () => {
    expect(q("type = str('order')", { where: 'x' })).toBe('Unknown query option where.')
    expect(q("type = str('order')", { includeDeleted: true })).toMatch(/Unknown query option/)
  })
  it('refuses options that are not an object', () => {
    expect(q("type = str('order')", null)).toMatch(/must be an object/)
    expect(q("type = str('order')", ['limit'])).toMatch(/must be an object/)
    expect(q("type = str('order')", 'limit=1')).toMatch(/must be an object/)
  })
  it('refuses a bad atBlock, cursor or select', () => {
    expect(q("type = str('order')", { atBlock: 'latest' })).toMatch(/atBlock/)
    expect(q("type = str('order')", { cursor: 'x'.repeat(400) })).toBe('Bad cursor.')
    expect(q("type = str('order')", { cursor: 7 })).toBe('Bad cursor.')
    expect(q("type = str('order')", { select: null })).toBe('Bad select.')
  })
  it('refuses params that are not an array', () => expect(refused({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: { q: 1 } as unknown as unknown[] })).toMatch(/array/))
})

describe('logs, calls and hashes are held to Arkiv’s own contract', () => {
  const logs = (f: unknown) => refused(call('eth_getLogs', [f]))
  it('reads Arkiv entity logs by block range', () => {
    expect(logs({ address: ARKIV, fromBlock: '0x1', toBlock: '0x100' })).toBeNull()
    expect(logs({ address: ARKIV.toUpperCase().replace('0X', '0x'), fromBlock: '0x1', toBlock: 'latest' })).toBeNull()
    expect(logs({ address: [ARKIV], fromBlock: '0x0', toBlock: '0x61a80' })).toBeNull()
  })
  it('refuses logs of any other contract, or of several', () => {
    expect(logs({ address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', fromBlock: '0x1', toBlock: '0x2' })).toMatch(/only reads Arkiv/)
    expect(logs({ fromBlock: '0x1', toBlock: '0x2' })).toMatch(/only reads Arkiv/)
    expect(logs({ address: [ARKIV, '0x0000000000000000000000000000000000000001'], fromBlock: '0x1', toBlock: '0x2' })).toMatch(/only reads Arkiv/)
    expect(refused(call('eth_newFilter', [{ address: '0x0000000000000000000000000000000000000001' }]))).toMatch(/only reads Arkiv/)
  })
  it('refuses a block hash, a tag for fromBlock, or a range over 400,000 blocks', () => {
    expect(logs({ address: ARKIV, blockHash: KEY })).toMatch(/block hash/)
    expect(logs({ address: ARKIV, fromBlock: 'earliest', toBlock: 'latest' })).toMatch(/fromBlock/)
    expect(logs({ address: ARKIV, fromBlock: '0x1', toBlock: 'pending' })).toMatch(/toBlock/)
    expect(logs({ address: ARKIV, fromBlock: '0x0', toBlock: '0x61a81' })).toMatch(/narrower/)
  })
  it('only calls the Arkiv contract', () => {
    expect(refused(call('eth_call', [{ to: ARKIV, data: '0x' }, 'latest']))).toBeNull()
    expect(refused(call('eth_estimateGas', [{ to: '0x0000000000000000000000000000000000000001' }]))).toMatch(/only calls the Arkiv/)
    expect(refused(call('eth_call', [{ data: '0x' }]))).toMatch(/only calls the Arkiv/)
  })
  it('checks transaction hashes', () => {
    expect(refused(call('eth_getTransactionReceipt', [KEY]))).toBeNull()
    expect(refused(call('eth_getTransactionByHash', ['0x1234']))).toBe('Bad transaction hash.')
    expect(refused(call('eth_getTransactionByHash', [{ hash: KEY }]))).toBe('Bad transaction hash.')
  })
})

// The handler end to end, with Arkiv replaced by a stub: nothing here touches the network.
type Sent = { method: string; params: unknown[] }
function upstream(answer: (b: Sent, headers: Record<string, string>) => { status?: number; body: unknown } = () => ({ body: { jsonrpc: '2.0', id: 1, result: { data: [], blockNumber: '0x1' } } })) {
  const sent: { body: Sent; headers: Record<string, string> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Sent
      sent.push({ body, headers: init.headers as Record<string, string> })
      const a = answer(body, init.headers as Record<string, string>)
      return new Response(JSON.stringify(a.body), { status: a.status ?? 200 })
    }),
  )
  return sent
}
let ip = 0
async function post(body: unknown, headers: Record<string, string> = {}, method = 'POST') {
  let status = 0
  let out: unknown
  const res = { status: (n: number) => ((status = n), res), json: (b: unknown) => void (out = b), setHeader: () => {} }
  await handler({ method, body, headers: { 'x-forwarded-for': `10.0.0.${++ip}`, ...headers } }, res)
  return { status, out: out as { result?: unknown; error?: { message: string } } & unknown[] }
}

describe('the relay handler', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('puts the app clause in front of every query it forwards', async () => {
    vi.stubEnv('ARKIV_KEY', 'test-key')
    const sent = upstream()
    await post(call('arkiv_query', ["type = str('order') AND net = str('handler-1')"]))
    await post(call('arkiv_query', ["app = str('switched-off') AND type = str('order') AND net = str('handler-2')"]))
    expect(sent.map((s) => s.body.params[0])).toEqual(["app = str('switched-off') AND type = str('order') AND net = str('handler-1')", "app = str('switched-off') AND type = str('order') AND net = str('handler-2')"])
    expect(sent[0].headers['x-api-key']).toBe('test-key')
  })

  it('never forwards a refused query', async () => {
    const sent = upstream()
    const r = await post(call('arkiv_query', ["type = str('order') OR 1 = 1"]))
    expect(r.out.error?.message).toMatch(/only simple AND queries/)
    expect(sent).toHaveLength(0)
  })

  it('never forwards a method outside its list', async () => {
    const sent = upstream()
    for (const m of ['eth_sendTransaction', 'eth_accounts', 'debug_traceTransaction', 'admin_peers', 'personal_sign']) {
      const r = await post(call(m, []))
      expect(r.out.error?.message).toMatch(/Method not relayed/)
    }
    expect(sent).toHaveLength(0)
  })

  it('answers a batch call by call, and refuses a batch over ten', async () => {
    const sent = upstream(() => ({ body: { jsonrpc: '2.0', id: 1, result: '0xbeef' } }))
    const r = await post([call('eth_chainId', []), call('eth_accounts', [])])
    expect(r.status).toBe(200)
    expect(r.out).toHaveLength(2)
    expect(r.out[0]).toMatchObject({ result: '0xbeef' })
    expect(r.out[1]).toMatchObject({ error: { code: -32601 } })
    expect(sent).toHaveLength(1)
    const big = await post(Array.from({ length: 11 }, () => call('eth_chainId', [])))
    expect(big.status).toBe(400)
  })

  it('shares an identical read for a moment, unless the browser asks for a fresh one', async () => {
    const sent = upstream()
    const read = call('arkiv_query', ["type = str('order') AND net = str('cache-test')"])
    await post(read)
    await post(read)
    expect(sent).toHaveLength(1)
    await post(read, { 'x-fresh': '1' })
    expect(sent).toHaveLength(2)
  })

  it('refuses anything but POST, and bad JSON', async () => {
    upstream()
    expect((await post(undefined, {}, 'GET')).status).toBe(405)
    expect((await post(undefined, {}, 'OPTIONS')).status).toBe(204)
    expect((await post('{not json', {})).status).toBe(400)
  })

  it('gives Arkiv’s bare QUOTA_EXCEEDED answer a message, and retries once without the spent key', async () => {
    vi.stubEnv('ARKIV_KEY', 'spent-key')
    const sent = upstream((b) => (b.method === 'eth_blockNumber' ? { status: 429, body: { error: 'QUOTA_EXCEEDED', message: 'quota exhausted' } } : { body: { result: '0x1' } }))
    const r = await post(call('eth_blockNumber', []))
    expect(sent).toHaveLength(2)
    expect(sent[0].headers['x-api-key']).toBe('spent-key')
    expect(sent[1].headers['x-api-key']).toBeUndefined()
    expect(r.out.error?.message).toBe('Arkiv answered 429: QUOTA_EXCEEDED (quota exhausted)')
  })

  it("moves to the second key when the first key's month is spent, and stays there", async () => {
    vi.stubEnv('ARKIV_KEY', 'month-one')
    vi.stubEnv('ARKIV_KEY_2', 'month-two')
    const sent = upstream((_b, h) => (h['x-api-key'] === 'month-one' ? { status: 429, body: { error: 'QUOTA_EXCEEDED', message: 'quota exhausted' } } : { body: { result: '0x2' } }))
    const r = await post(call('eth_gasPrice', []))
    expect(sent.map((x) => x.headers['x-api-key'])).toEqual(['month-one', 'month-two'])
    expect(r.out.result).toBe('0x2')
    await post(call('eth_maxPriorityFeePerGas', []))
    expect(sent[2].headers['x-api-key']).toBe('month-two')
  })
})

describe('how long a read is shared between visitors', () => {
  const q = (expr: string, opts: Record<string, unknown> = {}) => ({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [expr, opts] }) as Call
  it('the sealed archive for five minutes', () => expect(ttlOf(q("app = str('switched-off') AND type = str('record') AND net = str('live')"))).toBe(300_000))
  it('anything pinned to a block for fifteen, since it can never change', () => expect(ttlOf(q("app = str('switched-off') AND type = str('order') AND net = str('live')", { atBlock: '0x10' }))).toBe(900_000))
  it('orders and reports in force for twenty seconds', () => expect(ttlOf(q("app = str('switched-off') AND type = str('report') AND net = str('live')"))).toBe(20_000))
  it('the block number for a moment', () => expect(ttlOf({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] } as Call)).toBe(1500))
})

describe('transactions go to the Arkiv contract only', () => {
  const sign = async (to: `0x${string}`) => {
    const { privateKeyToAccount } = await import('viem/accounts')
    const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
    return account.signTransaction({ to, chainId: 7738577, nonce: 0, gas: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, type: 'eip1559', value: 0n })
  }
  const tx = (raw: string) => ({ jsonrpc: '2.0', id: 1, method: 'eth_sendRawTransaction', params: [raw] }) as Call
  it('a transaction to Arkiv is forwarded', async () => expect(refused(tx(await sign('0x4400000000000000000000000000000000000044')))).toBeNull())
  it('a transaction anywhere else is refused', async () => expect(refused(tx(await sign('0x1111111111111111111111111111111111111111')))).toMatch(/only sends transactions to the Arkiv contract/))
  it('junk is refused', () => expect(refused(tx('0xdeadbeef'))).toMatch(/Not a signed transaction/))
})
