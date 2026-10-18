// Who readers trust. Anyone may write an entity tagged like ours, so the rules that decide what a
// reader is shown are the security model: a stranger's "correction" must not hide a registrar's
// record, and a stranger's order dated years ahead must not darken the map.
import { describe, expect, it } from 'vitest'
import type { Hex } from 'viem'
import { BLOCK_SECONDS, LAW_CAP_BLOCKS, LAW_CAP_DAYS, applyCorrections, sameDesk, toOrder, toRecord, trustedCorrection, withinLawCap, type Record_ } from '../src/lib/arkiv'
import { ALICE, MALLORY, REGISTRAR, key, raw, s } from './helpers'

const record = (creator: Hex, corrects?: Hex, k: Hex = key()): Record_ =>
  toRecord(raw({ key: k, creator, owner: creator, attributes: { app: s('switched-off'), type: s('record'), net: s('live'), ...(corrects ? { corrects: s(corrects) } : {}) } }))
const keys = (rs: Record_[]) => rs.map((r) => r.key)
const index = (rs: Record_[]) => new Map(rs.map((r) => [r.key.toLowerCase(), r]))

describe('official is decided by $creator, never by the payload', () => {
  it('the registrar address, in any case, is official', () => {
    expect(record(REGISTRAR).official).toBe(true)
    expect(record(REGISTRAR.toLowerCase() as Hex).official).toBe(true)
  })
  it('anyone else is a community transcription, whatever they claim', () => {
    const r = toRecord(raw({ creator: MALLORY, owner: REGISTRAR, attributes: { official: s('true'), creator: s(REGISTRAR) }, payload: { official: true, authority: 'Switched Off registrar' } }))
    expect(r.official).toBe(false)
  })
})

describe('trustedCorrection', () => {
  const original = record(REGISTRAR)
  const communityOriginal = record(ALICE)

  it('a record that corrects nothing is not a correction', () => expect(trustedCorrection(record(REGISTRAR), index([original]))).toBe(false))
  it("the registrar's correction is trusted", () => {
    const c = record(REGISTRAR, original.key)
    expect(trustedCorrection(c, index([original, c]))).toBe(true)
  })
  it("the original filer's correction is trusted", () => {
    const c = record(ALICE, communityOriginal.key)
    expect(trustedCorrection(c, index([communityOriginal, c]))).toBe(true)
  })
  it('the filer is matched without regard to letter case', () => {
    const c = record(ALICE.toUpperCase().replace('0X', '0x') as Hex, communityOriginal.key)
    expect(trustedCorrection(c, index([communityOriginal, c]))).toBe(true)
  })
  it("a stranger's correction of a registrar record is not trusted", () => {
    const c = record(MALLORY, original.key)
    expect(trustedCorrection(c, index([original, c]))).toBe(false)
  })
  it("a stranger's correction of someone else's community record is not trusted", () => {
    const c = record(MALLORY, communityOriginal.key)
    expect(trustedCorrection(c, index([communityOriginal, c]))).toBe(false)
  })
  it('a stranger correcting a record nobody can see is not trusted', () => expect(trustedCorrection(record(MALLORY, key()), new Map())).toBe(false))
})

describe('applyCorrections', () => {
  it("the registrar's correction replaces its record", () => {
    const o = record(REGISTRAR)
    const c = record(REGISTRAR, o.key)
    expect(keys(applyCorrections([o, c]))).toEqual([c.key])
  })
  it("the original filer's correction replaces their record", () => {
    const o = record(ALICE)
    const c = record(ALICE, o.key)
    expect(keys(applyCorrections([o, c]))).toEqual([c.key])
  })
  it("a stranger's correction can't hide a registrar record: both stay, so readers see the dispute", () => {
    const o = record(REGISTRAR)
    const c = record(MALLORY, o.key)
    expect(keys(applyCorrections([o, c]))).toEqual([o.key, c.key])
  })
  it('a flood of hostile corrections hides nothing', () => {
    const o = record(REGISTRAR)
    const flood = Array.from({ length: 50 }, () => record(MALLORY, o.key))
    const out = applyCorrections([o, ...flood])
    expect(out).toHaveLength(51)
    expect(out[0].key).toBe(o.key)
  })
  it('the key named in corrects is matched without regard to letter case', () => {
    const o = record(REGISTRAR, undefined, `0x${'ab'.repeat(32)}` as Hex)
    const c = record(REGISTRAR, `0x${'AB'.repeat(32)}` as Hex)
    expect(keys(applyCorrections([o, c]))).toEqual([c.key])
  })
  it('a chain of corrections leaves only the latest', () => {
    const a = record(REGISTRAR)
    const b = record(REGISTRAR, a.key)
    const c = record(REGISTRAR, b.key)
    expect(keys(applyCorrections([a, b, c]))).toEqual([c.key])
  })
  it('order is kept and nothing is invented', () => {
    const rs = [record(REGISTRAR), record(ALICE), record(MALLORY)]
    expect(keys(applyCorrections(rs))).toEqual(keys(rs))
    expect(applyCorrections([])).toEqual([])
  })
})

describe('sameDesk, who may stand in one renewal chain', () => {
  it('two registrar records', () => expect(sameDesk(record(REGISTRAR), record(REGISTRAR))).toBe(true))
  it('two records by the same filer', () => expect(sameDesk(record(ALICE), record(ALICE.toUpperCase().replace('0X', '0x') as Hex))).toBe(true))
  it("a stranger's renewal never joins a registrar chain", () => {
    expect(sameDesk(record(REGISTRAR), record(MALLORY))).toBe(false)
    expect(sameDesk(record(MALLORY), record(REGISTRAR))).toBe(false)
  })
  it('two different community filers are different desks', () => expect(sameDesk(record(ALICE), record(MALLORY))).toBe(false))
})

describe('the law cap on community orders', () => {
  const order = (creator: Hex, lifeBlocks: bigint) => toOrder(raw({ creator, createdAt: 5_000_000n, expiresAt: 5_000_000n + lifeBlocks, attributes: { type: s('order'), net: s('live') } }))

  it('is fifteen days in law plus one day of slack, in 2-second blocks', () => {
    expect(LAW_CAP_DAYS).toBe(16)
    expect(BLOCK_SECONDS).toBe(2)
    expect(LAW_CAP_BLOCKS).toBe(691_200n)
  })
  it('a community order inside the cap darkens the map', () => {
    expect(withinLawCap(order(ALICE, 1n))).toBe(true)
    expect(withinLawCap(order(ALICE, BigInt((15 * 86_400) / 2)))).toBe(true)
    expect(withinLawCap(order(ALICE, LAW_CAP_BLOCKS))).toBe(true)
  })
  it('a community order one block past the cap does not', () => expect(withinLawCap(order(MALLORY, LAW_CAP_BLOCKS + 1n))).toBe(false))
  it('a hostile order dated years ahead does not', () => expect(withinLawCap(order(MALLORY, BigInt((10 * 365 * 86_400) / 2)))).toBe(false))
  it("the registrar's order is shown whatever its lifetime", () => expect(withinLawCap(order(REGISTRAR, LAW_CAP_BLOCKS * 10n))).toBe(true))
})
