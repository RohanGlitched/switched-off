// Files newly researched orders (research/orders-new.json) as registrar records, created and sealed to
// 0x…dEaD in the same transaction (keys predicted with their salts), exactly as the archive was. Every
// text field and link goes through the personal-data guard first, and an order_id already on the register
// is skipped, so running it twice files nothing twice. An order still in force also gets an `order`
// entity that dies on its lapse block. Afterwards the new orders are appended to research/orders-all.json.
// Usage: npx tsx scripts/add-orders.ts [--dry]
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import { and, eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { linkProblem, personalData } from '../src/lib/pii'

type Src = {
  id: string; state: string; stateCode: string; districts: string[]; scope: string
  issuedAt: string | null; startsAt: string | null; endsAt: string | null
  issuingAuthority: string | null; legalBasis: string | null; reasonStated: string | null
  renewalOf: string | null; published: boolean | null; sources: { title: string; url: string }[]; notes?: string
}
const SEALED = '0x000000000000000000000000000000000000dEaD' as Hex
const DRY = process.argv.includes('--dry')
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } } : {}
const account = privateKeyToAccount(env.REGISTRAR_KEY as Hex)
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, { ...opts, retryCount: 0, timeout: 20_000 }) })
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, { ...opts, retryCount: 0, timeout: 60_000 }), account })

const old = JSON.parse(fs.readFileSync('research/orders-all.json', 'utf8')) as Src[]
const fresh = JSON.parse(fs.readFileSync('research/orders-new.json', 'utf8')) as Src[]

// ids already in the research file were filed by an earlier run: leave them out
const ids = new Set(old.map((o) => o.id))
const known = fresh.filter((o) => ids.has(o.id)).map((o) => o.id)
if (known.length) console.log(`already in research/orders-all.json, left out: ${known.join(', ')}`)
fresh.splice(0, fresh.length, ...fresh.filter((o) => !ids.has(o.id)))
// the guard the site runs before every write, on everything that will be public
const problems: string[] = []
for (const o of fresh) {
  const texts = [o.id, o.state, ...o.districts, o.issuingAuthority, o.legalBasis, o.reasonStated, o.notes, ...o.sources.map((s) => s.title)]
  for (const x of texts) {
    const why = x ? personalData(x) : null
    if (why) problems.push(`${o.id}: ${why} in "${x}"`)
  }
  for (const s of o.sources) {
    const why = linkProblem(s.url)
    if (why) problems.push(`${o.id}: ${why}: ${s.url}`)
  }
  if (!o.sources.length) problems.push(`${o.id}: no source`)
  if (!/^IN-[A-Z]{2}$/.test(o.stateCode)) problems.push(`${o.id}: bad state code ${o.stateCode}`)
}
if (problems.length) {
  console.log('refused:\n  ' + problems.join('\n  '))
  process.exit(1)
}

const byId = new Map([...old, ...fresh].map((o) => [o.id, o]))
const seq = (o: Src): number => {
  let n = 1
  const seen = new Set<string>()
  for (let cur = o; cur.renewalOf && byId.has(cur.renewalOf) && !seen.has(cur.id); cur = byId.get(cur.renewalOf)!, n++) seen.add(cur.id)
  return n
}
const t = (s: string | null) => (s ? Math.floor(new Date(/T|\d:\d/.test(s) ? s.replace(' ', 'T') + (/[zZ+]/.test(s.slice(10)) ? '' : '+05:30') : `${s}T00:00:00+05:30`).getTime() / 1000) : 0)
const clip = (s: string, n = 120) => (new TextEncoder().encode(s).length <= n ? s : s.slice(0, n - 1))
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
function entityFor(o: Src, type: 'record' | 'order') {
  const starts = t(o.startsAt) || t(o.issuedAt)
  return {
    payload: jsonToPayload({ authority: o.issuingAuthority ?? '', reason: o.reasonStated ?? '', districts: o.districts, sources: o.sources, stateName: o.state, published: o.published, notes: o.notes ?? '', basis: o.legalBasis ?? '', endStated: !!o.endsAt }),
    contentType: 'application/json' as const,
    attributes: {
      app: 'switched-off', type, net: 'live', order_id: o.id, state: o.stateCode.replace(/^IN-/, ''),
      district: clip(o.districts.length === 1 ? o.districts[0] : 'multiple'), scope: o.scope,
      issued: u64(BigInt(t(o.issuedAt) || starts)), starts: u64(BigInt(starts)), ends: u64(BigInt(t(o.endsAt))),
      emergency: false, basis: basisCode(o.legalBasis), renews: o.renewalOf ?? '', seq: i32(seq(o)),
    },
  }
}

// skip anything already filed (a rerun after a partial failure)
const todo: Src[] = []
for (const o of fresh) {
  const n = (await pub.select({ key: true }).where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('net', 'live'), eq('order_id', o.id)])).fetch()).entities.length
  if (n) console.log(`${o.id}: already on the register, skipped`)
  else todo.push(o)
}
const now = Math.floor(Date.now() / 1000)
const inForce = todo.filter((o) => t(o.endsAt) > now + 60)
console.log(`registrar ${account.address}; ${todo.length} records to file and seal, ${inForce.length} still in force${DRY ? ' (dry run)' : ''}`)
for (const o of todo) console.log(`  ${o.id}  ${o.state}: ${o.districts.join(', ')}  ${o.startsAt ?? o.issuedAt ?? '?'} → ${o.endsAt ?? 'end not stated'}`)
if (DRY || !todo.length) process.exit(0)

const added: { id: string; key: Hex; tx: Hex }[] = []
for (let i = 0; i < todo.length; i += 10) {
  const part = todo.slice(i, i + 10)
  const creates = part.map((o) => ({ ...entityFor(o, 'record'), expires: ExpirationTime.fromYears(2), flags: { readonly: true, permissionlessExtension: true } }))
  // a predicted key only comes out as predicted if the create carries the salt it was predicted with
  const predicted = (await pub.predictEntityKeys({ owner: account.address, count: creates.length })) as unknown as { key: Hex; salt: bigint }[]
  creates.forEach((c, j) => ((c as { salt?: bigint }).salt = predicted[j].salt))
  const r = await wallet.executeBatch({ creates, ownershipChanges: predicted.map((p) => ({ entityKey: p.key, newOwner: SEALED })) })
  console.log(`tx ${r.txHash}: ${r.createdEntities.length} records created and sealed`)
  r.createdEntities.forEach((k, j) => {
    if (k.toLowerCase() !== predicted[j].key.toLowerCase()) console.log(`  ${part[j].id}: key differed from prediction, check its seal`)
    added.push({ id: part[j].id, key: k, tx: r.txHash })
  })
}
// orders in force: an `order` entity that only its filer can extend, gone on its lapse block
for (const o of inForce) {
  const r = await wallet.createEntity({ ...entityFor(o, 'order'), expires: ExpirationTime.fromBlocks(Math.ceil((t(o.endsAt) - now) / 2)), flags: { readonly: true } } as never)
  console.log(`order in force ${o.id}: ${r.entityKey}`)
}
fs.writeFileSync('research/orders-all.json', JSON.stringify([...old, ...todo], null, 1) + '\n')
const log = fs.existsSync('scripts/added.json') ? (JSON.parse(fs.readFileSync('scripts/added.json', 'utf8')) as { batches: unknown[] }) : { batches: [] }
log.batches.push({ at: new Date().toISOString(), added })
fs.writeFileSync('scripts/added.json', JSON.stringify(log, null, 1) + '\n')
console.log(`done: ${added.length} records; research/orders-all.json and scripts/added.json updated`)
