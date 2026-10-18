// Every read the app makes, built by the real Arkiv SDK, captured off the wire (fetch is stubbed:
// nothing reaches the network) and put through the relay's own check. If the grammar and the app
// ever drift apart, this fails before visitors' reads do.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refused, type Call } from '../api/rpc'
import { activeOrders, allRecords, liveReports, records, recordsWhere, reportsSince } from '../src/lib/arkiv'

let calls: Call[] = []
beforeEach(() => {
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Call | Call[]
      const list = Array.isArray(body) ? body : [body]
      calls.push(...list)
      const answer = (c: Call) => ({ jsonrpc: '2.0', id: c.id, result: c.method === 'arkiv_query' ? { data: [], blockNumber: '0x10' } : '0x10' })
      return new Response(JSON.stringify(Array.isArray(body) ? list.map(answer) : answer(list[0])), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
})
const queries = () => calls.filter((c) => c.method === 'arkiv_query')

describe("the app's reads pass the relay", () => {
  it.each([
    ['orders in force', () => activeOrders('live')],
    ['orders at a past block', () => activeOrders('drill', 1234n)],
    ['the register (registrar by $creator, then everyone)', () => records('live')],
    ['every record', () => allRecords('drill')],
    ['records by state and date', () => recordsWhere('live', { state: 'MN', since: 1_683_072_000 })],
    ['live reports', () => liveReports('live')],
    ['reports since a moment', () => reportsSince('drill', 1_760_000_000)],
  ] as const)('%s', async (_, read) => {
    await read()
    const qs = queries()
    expect(qs.length).toBeGreaterThan(0)
    for (const c of qs) {
      expect(String(c.params?.[0])).toMatch(/^app = str\('switched-off'\) AND type = str\('(order|record|report)'\) AND net = str\('(live|drill)'\)/)
      expect(refused(c)).toBeNull()
    }
  })

  it('reads the registrar by $creator and asks for at most 200 a page', async () => {
    await records('live')
    const qs = queries().map((c) => ({ q: String(c.params?.[0]), opts: c.params?.[1] as { limit?: string } }))
    expect(qs.some((x) => /\$creator = addr\(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e\)/i.test(x.q))).toBe(true)
    expect(qs.every((x) => x.opts.limit === '0xc8')).toBe(true)
  })

  it('narrows by state and date on Arkiv, with "since" inclusive', async () => {
    const r = await recordsWhere('live', { state: 'MN', since: 1_683_072_000 })
    expect(r.query).toBe("app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('MN') AND issued > u64(1683071999)")
    expect(queries().every((c) => String(c.params?.[0]).includes("state = str('MN') AND issued > u64(1683071999)"))).toBe(true)
  })
})
