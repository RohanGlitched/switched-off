// Reports made with no signal wait in the phone and go out when it comes back, marked late, with
// the moment the person actually saw the blackout. The write itself is mocked: nothing is filed.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fileReport = vi.fn()
vi.mock('../src/lib/write', () => ({ fileReport: (...a: unknown[]) => fileReport(...a) }))
const { enqueue, flush, queued } = await import('../src/lib/queue')

const KEY = 'switched-off:queue'
let store: Map<string, string>
const memoryStorage = () => ({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
const report = (district: string, seenAt?: number) => ({ net: 'live' as const, state: 'MN', district, carrier: 'Jio', status: 'down' as const, ...(seenAt ? { seenAt } : {}) })

beforeEach(() => {
  store = new Map()
  fileReport.mockReset()
  fileReport.mockResolvedValue({ key: '0x1', txHash: '0x2' })
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('navigator', { onLine: true })
})

describe('the queue', () => {
  it('keeps the time the blackout was seen, not the time it was sent', () => {
    enqueue(report('Imphal West', 1_760_000_000_000))
    expect(queued()).toMatchObject([{ district: 'Imphal West', seenAt: 1_760_000_000_000 }])
  })
  it('stamps a report with no time as seen now', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_760_000_123_000)
    enqueue(report('Thoubal'))
    expect(queued()[0].seenAt).toBe(1_760_000_123_000)
  })
  it('gives two reports seen at the same moment different ids, and keeps both', () => {
    enqueue(report('Imphal West', 1000))
    enqueue(report('Imphal West', 1000))
    const q = queued()
    expect(q).toHaveLength(2)
    expect(q[0].id).not.toBe(q[1].id)
    expect(q[0].id.startsWith('1000-')).toBe(true)
  })
  it('gives an item saved by an older version an id from its time and district', () => {
    store.set(KEY, JSON.stringify([{ ...report('Bishnupur'), seenAt: 42 }]))
    expect(queued()[0].id).toBe('42-Bishnupur')
  })
  it('reads corrupt storage as empty', () => {
    store.set(KEY, '{not json')
    expect(queued()).toEqual([])
  })
  it('survives storage that is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    })
    expect(() => enqueue(report('Imphal West', 1))).not.toThrow()
    expect(queued()).toEqual([])
  })
})

describe('flush', () => {
  it('sends every report in order, marked late, with its own seen time, then empties the queue', async () => {
    enqueue(report('Imphal West', 1000))
    enqueue(report('Thoubal', 2000))
    const onSent = vi.fn()
    await flush(onSent)
    expect(fileReport.mock.calls.map(([r]) => [r.district, r.seenAt, r.late])).toEqual([
      ['Imphal West', 1000, true],
      ['Thoubal', 2000, true],
    ])
    expect(queued()).toEqual([])
    expect(onSent).toHaveBeenCalledWith(2)
  })
  it('does nothing while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    enqueue(report('Imphal West', 1000))
    await flush()
    expect(fileReport).not.toHaveBeenCalled()
    expect(queued()).toHaveLength(1)
  })
  it('keeps what did not go out when the network drops again mid-flush', async () => {
    enqueue(report('A', 1))
    enqueue(report('B', 2))
    enqueue(report('C', 3))
    fileReport.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Failed to fetch'))
    const onSent = vi.fn()
    await flush(onSent)
    expect(queued().map((x) => x.district)).toEqual(['B', 'C'])
    expect(onSent).toHaveBeenCalledWith(1)
  })
  it('does not lose a report added while a flush is running', async () => {
    enqueue(report('A', 1))
    fileReport.mockImplementationOnce(async () => {
      enqueue(report('Added mid-flush', 5))
      return {}
    })
    await flush()
    expect(fileReport.mock.calls.map(([r]) => r.district)).toEqual(['A', 'Added mid-flush'])
    expect(queued()).toEqual([])
  })
  it('never sends a report twice when two flushes start together', async () => {
    enqueue(report('A', 1))
    enqueue(report('B', 2))
    await Promise.all([flush(), flush()])
    expect(fileReport).toHaveBeenCalledTimes(2)
  })
  it('leaves the queue alone when another tab holds the flush lock', async () => {
    vi.stubGlobal('navigator', { onLine: true, locks: { request: async (_n: string, _o: unknown, cb: (lock: unknown) => Promise<void>) => cb(null) } })
    enqueue(report('A', 1))
    await flush()
    expect(fileReport).not.toHaveBeenCalled()
    expect(queued()).toHaveLength(1)
  })
  it('flushes under the lock when it is free', async () => {
    const request = vi.fn(async (_n: string, _o: unknown, cb: (lock: unknown) => Promise<void>) => cb({ name: 'switched-off:flush' }))
    vi.stubGlobal('navigator', { onLine: true, locks: { request } })
    enqueue(report('A', 1))
    await flush()
    expect(request).toHaveBeenCalledWith('switched-off:flush', { ifAvailable: true }, expect.any(Function))
    expect(fileReport).toHaveBeenCalledTimes(1)
  })
})
