// The numbers the docs state must be the numbers the register holds. public/snapshot.json is the
// archive as Arkiv returned it (scripts/snapshot.ts), so the README, the Why page and the friction
// report are checked against it and against themselves: a stale count fails CI instead of a judge.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

const snap = JSON.parse(fs.readFileSync('public/snapshot.json', 'utf8')) as { records: { state: string }[] }
const orders = snap.records.length
const states = new Set(snap.records.map((r) => r.state)).size
const readme = fs.readFileSync('README.md', 'utf8')
const friction = fs.readFileSync('arkiv/friction.md', 'utf8')
const why = fs.readFileSync('src/pages/Why.tsx', 'utf8')
const all = (re: RegExp, text: string) => [...text.matchAll(re)].map((m) => Number(m[1]))

describe('the docs say what the register holds', () => {
  it('every "N sourced orders" in the README is the snapshot count', () => {
    const said = all(/(\d+) sourced orders/g, readme)
    expect(said.length).toBeGreaterThan(0)
    for (const n of said) expect(n).toBe(orders)
  })
  it('the README names the number of states and territories on file', () => {
    expect(all(/across (\d+) states and territories/g, readme)).toEqual([states])
  })
  it('the Why page counts the orders on file', () => {
    expect(all(/(\d+) orders are on file/g, why)).toEqual([orders])
  })
  it('the README counts the friction items friction.md has', () => {
    const items = friction.match(/^## \d+a?\. /gm)?.length ?? 0
    expect(all(/(\d+) items ranked by cost/g, readme)).toEqual([items])
  })
  it('every friction item is in the ranked summary table', () => {
    const items = [...friction.matchAll(/^## (\d+a?)\. /gm)].map((m) => m[1])
    for (const id of items) expect(friction.includes(`
| [${id}](#`), `item ${id} in the summary table`).toBe(true)
  })
})
