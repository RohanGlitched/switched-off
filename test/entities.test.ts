// Hostile entities. Anyone can write an entity tagged `app = switched-off` with any attributes and
// any payload. toOrder / toRecord / toReport are the only door to the pages, so whatever comes in,
// what comes out has the schema's types and sizes, and nothing throws.
import { describe, expect, it } from 'vitest'
import { SEALED, toOrder, toRecord, toReport, type Raw } from '../src/lib/arkiv'
import { ALICE, raw, s, u } from './helpers'

const HUGE = 'x'.repeat(100_000)

describe('an honest order reads back as filed', () => {
  const o = toOrder(
    raw({
      attributes: { type: s('order'), net: s('live'), order_id: s('12/2023-Home'), state: s('MN'), scope: s('all-internet'), issued: u(1_683_072_000n), starts: u(1_683_072_000n), ends: u(1_683_504_000n), emergency: { type: 'bool', value: false }, basis: s('tsr-2017'), renews: s(''), seq: { type: 'i32', value: 3 } },
      payload: { authority: 'Home Department, Government of Manipur', reason: 'Law and order', districts: ['Imphal West', 'Imphal East'], stateName: 'Manipur', sources: [{ title: 'Order', url: 'https://manipur.gov.in/order.pdf' }], published: true, basis: 'Temporary Suspension of Telecom Services Rules, 2017' },
    }),
  )
  it('keeps every field', () => {
    expect(o).toMatchObject({ net: 'live', orderId: '12/2023-Home', state: 'MN', stateName: 'Manipur', scope: 'all-internet', issued: 1_683_072_000, ends: 1_683_504_000, emergency: false, basisCode: 'tsr-2017', renews: null, seq: 3, published: true, endStated: true })
    expect(o.districts).toEqual(['Imphal West', 'Imphal East'])
    expect(o.sources).toEqual([{ title: 'Order', url: 'https://manipur.gov.in/order.pdf' }])
  })
})

describe('malformed attributes', () => {
  it('wrong types fall back to safe defaults', () => {
    const o = toOrder(raw({ attributes: { net: s('mainnet'), scope: s('everything'), issued: s('soon'), starts: { type: 'u64', value: {} }, emergency: s('yes'), confirmed: 1, seq: s('NaN') }, payload: {} }))
    expect(o.net).toBe('live')
    expect(o.scope).toBe('unknown')
    expect(o.issued).toBe(0)
    expect(o.starts).toBe(0)
    expect(o.emergency).toBe(false)
    expect(o.confirmed).toBe(false)
    expect(o.seq).toBe(0)
  })
  it('only the exact word "drill" makes a drill entity', () => {
    expect(toOrder(raw({ attributes: { net: s('drill') } })).net).toBe('drill')
    expect(toOrder(raw({ attributes: { net: s('DRILL') } })).net).toBe('live')
  })
  it('huge strings are cut to the schema sizes', () => {
    const o = toOrder(raw({ attributes: { order_id: s(HUGE), state: s(HUGE), basis: s(HUGE), renews: s(HUGE), district: s(HUGE) }, payload: {} }))
    expect(o.orderId).toHaveLength(80)
    expect(o.state).toHaveLength(4)
    expect(o.basisCode).toHaveLength(40)
    expect(o.renews).toHaveLength(80)
    expect(o.districts).toEqual(['x'.repeat(80)])
  })
  it('missing attributes and system fields are filled, not left undefined', () => {
    const o = toOrder({ key: '0x01' } as Raw)
    expect(o).toMatchObject({ orderId: '', state: '', districts: [], scope: 'unknown', owner: '0x', creator: '0x', createdAt: 0n, expiresAt: 0n, readonly: false, official: false, published: null, renews: null })
  })
  it('a u64 bigint attribute becomes a number', () => expect(toOrder(raw({ attributes: { issued: u(1_700_000_000n) } })).issued).toBe(1_700_000_000))
  it('untagged values are read too', () => expect(toOrder(raw({ attributes: { order_id: 'plain', issued: 42 } }))).toMatchObject({ orderId: 'plain', issued: 42 }))
})

describe('malformed payloads', () => {
  it('a payload that throws on read is an empty payload', () => {
    const o = toOrder(
      raw({
        toJson: () => {
          throw new SyntaxError('Unexpected token')
        },
      }),
    )
    expect(o.authority).toBe('')
    expect(o.sources).toEqual([])
  })
  it.each([null, 'a string', 42, ['an', 'array']])('a payload of %j is an empty payload', (p) => {
    const o = toOrder(raw({ toJson: () => p }))
    expect(o.authority).toBe('')
    expect(o.districts).toEqual([])
  })
  it('wrong-typed payload fields are dropped', () => {
    const o = toOrder(raw({ payload: { authority: { html: '<script>' }, reason: 42, stateName: ['MN'], notes: null, published: 'yes', endStated: 'no', basis: false } }))
    expect(o).toMatchObject({ authority: '', reason: '', notes: '', published: null, basis: '' })
    expect(typeof o.endStated).toBe('boolean')
    expect(o.stateName).toBe('MN')
  })
  it('huge payload text is capped per field', () => {
    const o = toOrder(raw({ payload: { authority: HUGE, reason: HUGE, notes: HUGE, stateName: HUGE, basis: HUGE } }))
    expect([o.authority.length, o.reason.length, o.notes.length, o.stateName.length, o.basis.length]).toEqual([200, 600, 1200, 60, 200])
  })
  it('districts that are not an array of strings are cleaned', () => {
    expect(toOrder(raw({ payload: { districts: 'Imphal West' } })).districts).toEqual([])
    expect(toOrder(raw({ payload: { districts: { 0: 'Imphal West' } } })).districts).toEqual([])
    expect(toOrder(raw({ payload: { districts: ['Imphal West', 7, null, '', { a: 1 }, 'Thoubal'] } })).districts).toEqual(['Imphal West', 'Thoubal'])
  })
  it('a district flood is cut to 60 names of 80 characters', () => {
    const ds = toOrder(raw({ payload: { districts: Array.from({ length: 5000 }, (_, i) => `${i}${HUGE}`) } })).districts
    expect(ds).toHaveLength(60)
    expect(Math.max(...ds.map((d) => d.length))).toBe(80)
  })
})

describe('sources', () => {
  const sources = (list: unknown) => toOrder(raw({ payload: { sources: list } })).sources
  it('a javascript: or data: link is emptied, its text kept only as a title', () => {
    expect(sources([{ title: 'Click', url: 'javascript:alert(document.cookie)' }])).toEqual([{ title: 'Click', url: '' }])
    expect(sources([{ title: 'x', url: 'data:text/html,<script>alert(1)</script>' }])[0].url).toBe('')
    expect(sources([{ title: 'x', url: '  javascript:alert(1)' }])[0].url).toBe('')
    expect(sources([{ title: 'x', url: 'JaVaScRiPt:alert(1)' }])[0].url).toBe('')
  })
  it('http and https links are kept, capped at 500 characters', () => {
    expect(sources([{ title: 't', url: 'HTTP://example.org/a' }])[0].url).toBe('HTTP://example.org/a')
    expect(sources([{ title: 't', url: `https://example.org/${HUGE}` }])[0].url).toHaveLength(500)
  })
  it('entries without a string url are dropped, and at most 12 are kept', () => {
    expect(sources([null, 'https://x.org', { title: 'no url' }, { url: 42 }, { title: 't', url: 'https://ok.org' }])).toEqual([{ title: 't', url: 'https://ok.org' }])
    expect(sources(Array.from({ length: 100 }, (_, i) => ({ title: `${i}`, url: 'https://x.org' })))).toHaveLength(12)
  })
  it('a missing or non-string title falls back to the link text, capped', () => {
    expect(sources([{ url: 'https://x.org/a' }])[0].title).toBe('https://x.org/a')
    expect(sources([{ title: { evil: true }, url: `https://x.org/${HUGE}` }])[0].title).toHaveLength(200)
  })
  it('a non-array sources field is no sources', () => expect(sources({ url: 'https://x.org' })).toEqual([]))
})

describe('records', () => {
  it('is sealed only when owned by the dead address', () => {
    expect(toRecord(raw({ owner: SEALED.toLowerCase() as `0x${string}` })).sealed).toBe(true)
    expect(toRecord(raw({ owner: ALICE })).sealed).toBe(false)
    expect(toRecord(raw({ owner: undefined })).sealed).toBe(false)
  })
  it('reads the flags and what it corrects', () => {
    const r = toRecord(raw({ creationFlags: { readonly: true, permissionlessExtension: false }, attributes: { corrects: s('0xabc') } }))
    expect(r).toMatchObject({ readonly: true, permissionless: false, corrects: '0xabc' })
    expect(toRecord(raw({ creationFlags: undefined })).permissionless).toBe(false)
  })
})

describe('reports', () => {
  it('an honest report reads back as filed', () => {
    const r = toReport(raw({ attributes: { net: s('drill'), state: s('MN'), district: s('Imphal West'), carrier: s('Jio'), status: s('slow'), seen: u(1_760_000_000n), late: { type: 'bool', value: true } }, payload: { note: 'Mobile data gone since 9 am' } }))
    expect(r).toMatchObject({ net: 'drill', state: 'MN', district: 'Imphal West', carrier: 'Jio', status: 'slow', seen: 1_760_000_000, late: true, note: 'Mobile data gone since 9 am' })
  })
  it('an unknown status is read as down', () => expect(toReport(raw({ attributes: { status: s('<img src=x onerror=alert(1)>') } })).status).toBe('down'))
  it('huge fields are capped', () => {
    const r = toReport(raw({ attributes: { state: s(HUGE), district: s(HUGE), carrier: s(HUGE) }, payload: { note: HUGE } }))
    expect([r.state.length, r.district.length, r.carrier.length, r.note.length]).toEqual([4, 80, 40, 140])
  })
  it('a non-string note is no note', () => expect(toReport(raw({ payload: { note: ['a'] } })).note).toBe(''))
})

describe('nothing throws', () => {
  const nasty: unknown[] = [
    { key: '0x0' },
    { key: '0x0', attributes: null },
    { key: '0x0', attributes: { scope: { value: { value: 'deep' } }, issued: { value: Symbol.iterator.toString() } } },
    { key: '0x0', toJson: () => ({ districts: [Symbol('x')], sources: [{ url: 'https://a', title: 1n }] }) },
    { key: '0x0', creationFlags: null, attributes: { net: undefined, order_id: null } },
  ]
  it.each(nasty.map((e, i) => [i, e]))('hostile entity %i', (_, e) => {
    expect(() => toOrder(e as Raw)).not.toThrow()
    expect(() => toRecord(e as Raw)).not.toThrow()
    expect(() => toReport(e as Raw)).not.toThrow()
  })
})
