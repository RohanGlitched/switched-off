// The law is the expiry. An order's entity lives until it lapses, an unconfirmed emergency order
// lapses a legal day after issue, a report fades in six hours. Arkiv counts lifetimes in whole
// 2-second blocks and refuses anything else, so every duration is rounded up to a block.
import { describe, expect, it } from 'vitest'
import { ExpirationTime } from '@arkiv-network/sdk/utils'
import { BLOCK_SECONDS } from '../src/lib/arkiv'
import { DAY_MS, DRILL_DAY_MS, REPORT_LIFE, dayMs, lapseOf, life } from '../src/lib/write'

const blocks = (seconds: number) => (life(seconds) as unknown as { minLifetime: bigint }).minLifetime

describe('whole blocks', () => {
  it('a block is two seconds', () => expect(BLOCK_SECONDS).toBe(2))
  it('the 15-day cap is 648,000 blocks', () => expect(blocks(15 * 86_400)).toBe(648_000n))
  it('a 24-hour emergency order is 43,200 blocks', () => expect(blocks(24 * 3600)).toBe(43_200n))
  it('a 6-hour report is 10,800 blocks, a drill report 180', () => {
    expect(REPORT_LIFE.live).toBe(6 * 3600)
    expect(blocks(REPORT_LIFE.live)).toBe(10_800n)
    expect(blocks(REPORT_LIFE.drill)).toBe(180n)
  })
  it('an odd number of seconds rounds up, never down', () => {
    expect(blocks(1)).toBe(1n)
    expect(blocks(3)).toBe(2n)
    expect(blocks(86_401)).toBe(43_201n)
  })
  it('a lifetime is never less than one block', () => {
    expect(blocks(0)).toBe(1n)
    expect(blocks(-50)).toBe(1n)
  })
  it('a fractional second still makes a valid lifetime', () => expect(blocks(0.4)).toBe(1n))
  it('which is why it is rounded: the SDK refuses a duration that is not a whole number of blocks', () => {
    expect(() => ExpirationTime.fromSeconds(3)).toThrow(/multiple of the 2s block time/)
    expect(() => life(3)).not.toThrow()
  })
})

describe('when an order lapses in law', () => {
  const issued = Date.UTC(2026, 9, 1, 6)
  it('a legal day is a day, or a minute in the drill', () => {
    expect(dayMs('live')).toBe(DAY_MS)
    expect(dayMs('drill')).toBe(DRILL_DAY_MS)
    expect(DRILL_DAY_MS).toBe(60_000)
  })
  it('an ordinary order lapses at its stated end', () => {
    const ends = issued + 5 * DAY_MS
    expect(lapseOf({ net: 'live', emergency: false, issued, ends })).toBe(ends)
  })
  it('an emergency order lapses 24 hours after issue unless confirmed', () => {
    expect(lapseOf({ net: 'live', emergency: true, issued, ends: issued + 5 * DAY_MS })).toBe(issued + DAY_MS)
  })
  it('an emergency order that ends sooner lapses at its end', () => {
    expect(lapseOf({ net: 'live', emergency: true, issued, ends: issued + 3_600_000 })).toBe(issued + 3_600_000)
  })
  it('in the drill an emergency order lapses one minute after issue', () => {
    expect(lapseOf({ net: 'drill', emergency: true, issued, ends: issued + 10 * DRILL_DAY_MS })).toBe(issued + 60_000)
  })
})
