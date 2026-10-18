// Files registrar corrections for orders whose research improved after they were sealed: an order PDF
// found, exact times, a wrong state code, a renewal link. A sealed record can't be edited, so each fix is a
// new record that names the one it corrects in `corrects`, created and sealed to 0x…dEaD in the same
// transaction; every reader then shows the correction (the original stays readable, as on 11 Oct).
// The update files hold whole records in the research schema; when two files touch one id, the later wins.
// Every text and link passes the personal-data guard first. Afterwards research/orders-all.json takes the
// corrected versions. Usage: npx tsx scripts/correct-orders.ts research/orders-updates-2.json … [--dry]
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
const files = process.argv.slice(2).filter((a) => a.endsWith('.json'))
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } } : {}
const account = privateKeyToAccount(env.REGISTRAR_KEY as Hex)
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, { ...opts, retryCount: 0, timeout: 30_000 }) })
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, { ...opts, retryCount: 0, timeout: 60_000 }), account })

const all = JSON.parse(fs.readFileSync('research/orders-all.json', 'utf8')) as Src[]
const updates = new Map<string, Src>()
for (const f of files) for (const o of JSON.parse(fs.readFileSync(f, 'utf8')) as Src[]) updates.set(o.id, o)

const problems: string[] = []
for (const o of updates.values()) {
  if (!all.some((x) => x.id === o.id)) problems.push(`${o.id}: not in research/orders-all.json, so there is nothing to correct`)
  for (const x of [o.state, ...o.districts, o.issuingAuthority, o.legalBasis, o.reasonStated, o.notes, ...o.sources.map((s) => s.title)]) {
    const why = x ? personalData(x) : null
    if (why) problems.push(`${o.id}: ${why} in "${x}"`)
  }
  for (const s of o.sources) {
    const why = linkProblem(s.url)
    if (why) problems.push(`${o.id}: ${why}: ${s.url}`)
  }
  if (!/^IN-[A-Z]{2}$/.test(o.stateCode)) problems.push(`${o.id}: bad state code ${o.stateCode}`)
}
if (problems.length) {
  console.log('refused:\n  ' + problems.join('\n  '))
  process.exit(1)
}

const merged = all.map((o) => updates.get(o.id) ?? o)
const byId = new Map(merged.map((o) => [o.id, o]))
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
const un = (v: unknown) => (v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v)

type Create = { payload: Uint8Array; contentType: 'application/json'; attributes: Record<string, unknown>; expires: ExpirationTime; flags: { readonly: boolean; permissionlessExtension: boolean }; salt?: bigint }
const creates: Create[] = []
const ids: string[] = []
const originals: Hex[] = []
for (const o of updates.values()) {
  // the record readers show today: the one no other record corrects
  const found = (await pub.select({ key: true, attributes: true }).where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('net', 'live'), eq('order_id', o.id)])).createdBy(account.address).fetch()).entities as unknown as { key: Hex; attributes: Record<string, unknown> }[]
  const correctedKeys = new Set(found.map((e) => String(un(e.attributes.corrects) ?? '').toLowerCase()).filter(Boolean))
  const current = found.filter((e) => !correctedKeys.has(e.key.toLowerCase()))
  if (current.length !== 1) throw new Error(`${o.id}: expected one current record, found ${current.length}`)
  const starts = t(o.startsAt) || t(o.issuedAt)
  const notes = `Correction (18 Oct 2026): times, sources or links improved from the order text or better reporting; the earlier record stays on Arkiv unchanged. ${o.notes ?? ''}`.trim()
  creates.push({
    payload: jsonToPayload({ authority: o.issuingAuthority ?? '', reason: o.reasonStated ?? '', districts: o.districts, sources: o.sources, stateName: o.state, published: o.published, notes, basis: o.legalBasis ?? '', endStated: !!o.endsAt }),
    contentType: 'application/json',
    attributes: {
      app: 'switched-off', type: 'record', net: 'live', order_id: o.id, state: o.stateCode.replace(/^IN-/, ''),
      district: clip(o.districts.length === 1 ? o.districts[0] : 'multiple'), scope: o.scope,
      issued: u64(BigInt(t(o.issuedAt) || starts)), starts: u64(BigInt(starts)), ends: u64(BigInt(t(o.endsAt))),
      emergency: false, basis: basisCode(o.legalBasis), renews: o.renewalOf ?? '', seq: i32(seq(o)), corrects: current[0].key,
    },
    expires: ExpirationTime.fromYears(2),
    flags: { readonly: true, permissionlessExtension: true },
  })
  ids.push(o.id)
  originals.push(current[0].key)
  console.log(`${o.id}: corrects ${current[0].key}`)
}
console.log(`${creates.length} corrections ready${DRY ? ' (dry run)' : ''}`)
if (DRY || !creates.length) process.exit(0)

const batches: { at: string; tx: Hex; corrections: { id: string; key: Hex; corrects: Hex }[] }[] = []
for (let i = 0; i < creates.length; i += 10) {
  const part = creates.slice(i, i + 10)
  const predicted = (await pub.predictEntityKeys({ owner: account.address, count: part.length })) as unknown as { key: Hex; salt: bigint }[]
  part.forEach((c, j) => (c.salt = predicted[j].salt))
  const r = await wallet.executeBatch({ creates: part as never, ownershipChanges: predicted.map((p) => ({ entityKey: p.key, newOwner: SEALED })) })
  console.log(`tx ${r.txHash}: ${r.createdEntities.length} corrections created and sealed`)
  batches.push({ at: new Date().toISOString(), tx: r.txHash, corrections: r.createdEntities.map((k, j) => ({ id: ids[i + j], key: k, corrects: originals[i + j] })) })
}
fs.writeFileSync('research/orders-all.json', JSON.stringify(merged, null, 1) + '\n')
// kept apart from scripts/corrections.json, which holds the 11 Oct personal-data corrections
const prev = fs.existsSync('scripts/data-corrections.json') ? (JSON.parse(fs.readFileSync('scripts/data-corrections.json', 'utf8')) as { batches: unknown[] }) : { batches: [] }
prev.batches.push(...batches)
fs.writeFileSync('scripts/data-corrections.json', JSON.stringify(prev, null, 2))
console.log('done; research/orders-all.json and scripts/data-corrections.json updated')
