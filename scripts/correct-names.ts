// Files registrar corrections for records whose notes quoted people's names (judges, petitioners,
// a person named in a police operation). Each correction copies the original's attributes and
// payload, swaps in the name-free text from research/orders-all.json, names the original in
// `corrects`, and is sealed in the same transaction (keys predicted from the entity nonce).
// The originals are readonly and sealed, so they stay readable until they expire; readers show
// the correction instead. Usage: npx tsx scripts/correct-names.ts [--dry] id id ...
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import { and, eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const SEALED = '0x000000000000000000000000000000000000dEaD' as Hex
const DEFAULT_IDS = ['jk-2021-09-01', 'pb-statewide-2023-03-20', 'as-caa-2019-12-11']
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const ids = args.filter((a) => !a.startsWith('--'))
const todo = ids.length ? ids : DEFAULT_IDS

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } }
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const account = privateKeyToAccount(env.REGISTRAR_KEY as Hex)
const w = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account })

type Src = { id: string; reasonStated: string; notes?: string; sources: { title: string; url: string }[] }
const research = new Map((JSON.parse(fs.readFileSync('research/orders-all.json', 'utf8')) as Src[]).map((o) => [o.id, o]))
const un = (v: unknown) => (v && typeof v === 'object' && 'value' in (v as object) ? (v as { value: unknown }).value : v)

const creates = [] as { payload: Uint8Array; contentType: 'application/json'; attributes: Record<string, unknown>; expires: ExpirationTime; flags: { readonly: boolean; permissionlessExtension: boolean } }[]
const originals: Hex[] = []
for (const id of todo) {
  const src = research.get(id)
  if (!src) throw new Error(`no research entry for ${id}`)
  const found = (await pub.select('*').where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('net', 'live'), eq('order_id', id)])).fetch()).entities as unknown as { key: Hex; attributes: Record<string, unknown>; toJson: () => Record<string, unknown> }[]
  // the record readers show today: the one no other record corrects (an earlier correction included)
  const correctedKeys = new Set(found.map((e) => String(un(e.attributes.corrects) ?? '').toLowerCase()).filter(Boolean))
  const current = found.filter((e) => !correctedKeys.has(e.key.toLowerCase()))
  if (current.length !== 1) throw new Error(`${id}: expected one current record, found ${current.length}`)
  const e = current[0]
  const a = e.attributes
  const p = e.toJson()
  const payload = { ...p, reason: src.reasonStated, notes: `Correction: this record's notes or sources named a person (in the text, or in a link's slug). They are rewritten without names; the archive cites courts, dates and outlets instead. ${src.notes ?? ''}`.trim(), sources: src.sources }
  const str = (k: string) => String(un(a[k]) ?? '')
  const num = (k: string) => BigInt(String(un(a[k]) ?? 0))
  const attributes = {
    app: 'switched-off', type: 'record', net: 'live', order_id: id, state: str('state'), district: str('district'), scope: str('scope'),
    issued: u64(num('issued')), starts: u64(num('starts')), ends: u64(num('ends')), emergency: un(a.emergency) === true || un(a.emergency) === 'true',
    basis: str('basis'), renews: str('renews'), seq: i32(Number(un(a.seq) ?? 1)), corrects: e.key,
  }
  console.log(id, 'corrects', e.key)
  console.log('  notes:', payload.notes.slice(0, 160) + '…')
  originals.push(e.key)
  creates.push({ payload: jsonToPayload(payload), contentType: 'application/json', attributes, expires: ExpirationTime.fromYears(2), flags: { readonly: true, permissionlessExtension: true } })
}
if (dry) {
  console.log(`dry run: ${creates.length} corrections ready`)
  process.exit(0)
}
// a predicted key only comes out as predicted if the create carries the salt it was predicted with
const predicted = (await pub.predictEntityKeys({ owner: account.address, count: creates.length })) as unknown as { key: Hex; salt: bigint }[]
creates.forEach((c, i) => ((c as { salt?: bigint }).salt = predicted[i].salt))
const r = await w.executeBatch({ creates, ownershipChanges: predicted.map((p) => ({ entityKey: p.key, newOwner: SEALED })) })
console.log('tx', r.txHash)
r.createdEntities.forEach((k, i) => console.log(`  ${todo[i]}: ${k} corrects ${originals[i]} ${k.toLowerCase() === predicted[i].key.toLowerCase() ? '(sealed in the same transaction)' : '(key differed from prediction: check the seal)'}`))
const prev = fs.existsSync('scripts/corrections.json') ? (JSON.parse(fs.readFileSync('scripts/corrections.json', 'utf8')) as { batches?: unknown[]; tx?: string; at?: string; corrections?: unknown[] }) : {}
const batches = prev.batches ?? (prev.tx ? [{ at: prev.at, tx: prev.tx, corrections: prev.corrections }] : [])
batches.push({ at: new Date().toISOString(), tx: r.txHash, corrections: r.createdEntities.map((k, i) => ({ id: todo[i], key: k, corrects: originals[i] })) })
fs.writeFileSync('scripts/corrections.json', JSON.stringify({ batches }, null, 2))
