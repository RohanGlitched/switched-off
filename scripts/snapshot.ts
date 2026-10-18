// Writes public/snapshot.json: the sealed archive as read from Arkiv at one block, so the first
// screen paints in a moment instead of waiting on a 350 KB query. The page then reads Arkiv live and
// replaces it; the snapshot is only ever shown labelled with its block. Run: npx tsx scripts/snapshot.ts
// Sealed records never change (readonly, owned by 0x…dEaD), so a snapshot of them can only be missing
// newer filings, which the live read adds.
import fs from 'node:fs'
import { currentBlock, records, syncClock } from '../src/lib/arkiv'

// keyless reads share a small per-network budget: with ARKIV_KEY in .env.local, this script's reads use the key
const key = fs.existsSync('.env.local') ? /^ARKIV_KEY=(.*)$/m.exec(fs.readFileSync('.env.local', 'utf8'))?.[1]?.trim() : undefined
if (key) {
  const plain = globalThis.fetch
  globalThis.fetch = (input, init) => (String(input).includes('arkiv.network') ? plain(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), 'x-api-key': key } }) : plain(input, init))
}

await syncClock()
const block = currentBlock()
const list = await records('live')
const out = {
  note: 'A copy of the Switched Off archive as Arkiv returned it at this block. The site paints from it, then reads Arkiv live and replaces it.',
  block: block.toString(),
  at: new Date().toISOString(),
  records: list,
}
fs.writeFileSync('public/snapshot.json', JSON.stringify(out, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)))
console.log(`snapshot: ${list.length} records at block ${block}`)
