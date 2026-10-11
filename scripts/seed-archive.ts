// Writes the researched archive of Indian suspension orders to Arkiv as readonly `record`
// entities that anyone may extend. Any order still in force also gets a short-lived `order`
// entity that expires when the order lapses. Run: npx tsx scripts/seed-archive.ts [--dry]
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

type Src = {
  id: string; state: string; stateCode: string; districts: string[]; scope: string
  issuedAt: string | null; startsAt: string | null; endsAt: string | null
  issuingAuthority: string | null; legalBasis: string | null; reasonStated: string | null
  renewalOf: string | null; published: boolean | null; sources: { title: string; url: string }[]; notes?: string
}

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } } : {}
const account = privateKeyToAccount(env.REGISTRAR_KEY as Hex)
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account })
const DRY = process.argv.includes('--dry')
/** A short, queryable code for the legal basis; the full citation lives in the payload. */
function basisCode(b: string | null | undefined): string {
  const s = (b ?? '').toLowerCase()
  if (!s) return 'not-stated'
  if (/2024|telecommunications act|temporary suspension of services\) rules/.test(s)) return 'tsr-2024'
  if (/2017|temporary suspension of telecom services/.test(s)) return 'tsr-2017'
  if (/163/.test(s) && /bnss|nagarik/.test(s)) return 'bnss-163'
  if (/144/.test(s)) return 'crpc-144'
  if (/5\(2\)|telegraph/.test(s)) return 'telegraph-5-2'
  return 'other'
}
const BASIS_LABEL: Record<string, string> = {
  'tsr-2024': 'Telecommunications (Temporary Suspension of Services) Rules, 2024',
  'tsr-2017': 'Temporary Suspension of Telecom Services Rules, 2017',
  'telegraph-5-2': 'Section 5(2), Indian Telegraph Act, 1885',
  'crpc-144': 'Section 144, Code of Criminal Procedure',
  'bnss-163': 'Section 163, Bharatiya Nagarik Suraksha Sanhita',
  'not-stated': 'Legal basis not stated',
  other: 'Other legal basis',
}
const clip = (s: string, n = 120) => (new TextEncoder().encode(s).length <= n ? s : s.slice(0, n - 1))

const WEAK = new Set(['mh-beed-2023-10-30', 'or-cuttack-2025-10-05', 'mn-2026-04-25'])

// IST midnight when only a date is known
const t = (s: string | null) => (s ? Math.floor(new Date(/T|\d:\d/.test(s) ? s.replace(' ', 'T') + (/[zZ+]/.test(s.slice(10)) ? '' : '+05:30') : `${s}T00:00:00+05:30`).getTime() / 1000) : 0)

const all = (JSON.parse(fs.readFileSync(fs.existsSync('research/orders-all.json') ? 'research/orders-all.json' : '../research/orders-all.json', 'utf8')) as Src[]).filter((o) => !WEAK.has(o.id))
for (const o of all) {
  o.districts = o.districts.flatMap((d) => (/walled city areas of north and central/i.test(d) ? ['Central', 'North'] : [d]))
}
// renewal number: walk each chain back to its first order
const byId = new Map(all.map((o) => [o.id, o]))
const seq = (o: Src): number => {
  let n = 1
  let cur = o
  const seen = new Set<string>()
  while (cur.renewalOf && byId.has(cur.renewalOf) && !seen.has(cur.id)) {
    seen.add(cur.id)
    cur = byId.get(cur.renewalOf)!
    n++
  }
  return n
}

function entityFor(o: Src, type: 'record' | 'order') {
  const starts = t(o.startsAt) || t(o.issuedAt)
  const issued = t(o.issuedAt) || starts
  const ends = t(o.endsAt)
  const code = o.stateCode.replace(/^IN-/, '')
  return {
    payload: jsonToPayload({
      authority: o.issuingAuthority ?? '',
      reason: o.reasonStated ?? '',
      districts: o.districts,
      sources: o.sources,
      stateName: o.state,
      published: o.published,
      notes: o.notes ?? '',
      basis: o.legalBasis ?? '',
      endStated: !!o.endsAt,
    }),
    contentType: 'application/json',
    attributes: {
      app: 'switched-off',
      type,
      net: 'live',
      order_id: o.id,
      state: code,
      district: clip(o.districts.length === 1 ? o.districts[0] : 'multiple'),
      scope: o.scope,
      issued: u64(BigInt(issued)),
      starts: u64(BigInt(starts)),
      ends: u64(BigInt(ends)),
      emergency: false,
      basis: basisCode(o.legalBasis),
      renews: o.renewalOf ?? '',
      seq: i32(seq(o)),
    },
  }
}

async function main() {
  const head = await pub.getBlockNumber()
  console.log('registrar', account.address, 'balance', await pub.getBalance({ address: account.address }), 'head', head, DRY ? '(dry run)' : '')
  const now = Math.floor(Date.now() / 1000)
  const creates = all.map((o) => ({ ...entityFor(o, 'record'), expires: ExpirationTime.fromYears(2), flags: { readonly: true, permissionlessExtension: true } }))
  // orders still in force today also live as an `order` that dies on its lapse block
  for (const o of all) {
    const ends = t(o.endsAt)
    if (ends > now + 60) creates.push({ ...entityFor(o, 'order'), expires: ExpirationTime.fromBlocks(Math.ceil((ends - now) / 2)), flags: { readonly: true } } as never)
  }
  console.log('records', all.length, 'entities to write', creates.length)
  if (DRY) {
    console.log(JSON.stringify(creates[0].attributes, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1))
    return
  }
  const keys: Record<string, Hex> = {}
  for (let i = 0; i < creates.length; i += 10) {
    const batch = creates.slice(i, i + 10)
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await wallet.executeBatch({ creates: batch })
        batch.forEach((c, j) => (keys[(c.attributes as { order_id: string }).order_id + ':' + (c.attributes as { type: string }).type] = r.createdEntities[j]))
        console.log(`batch ${i / 10 + 1}: ${batch.length} entities, tx ${r.txHash}`)
        break
      } catch (e) {
        console.log(`batch ${i / 10 + 1} attempt ${attempt} failed: ${String((e as Error).message).slice(0, 200)}`)
        if (attempt >= 4) throw e
        await new Promise((res) => setTimeout(res, 4000 * attempt))
      }
    }
  }
  fs.writeFileSync('scripts/seeded.json', JSON.stringify({ at: new Date().toISOString(), registrar: account.address, keys }, null, 1))
  console.log('done; keys in scripts/seeded.json')
}
void main()
