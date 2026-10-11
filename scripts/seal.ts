// Seals archive records: hands ownership to an address nobody holds a key for. A sealed record
// is readonly (nobody can edit it), unowned (nobody can delete it, not even the registrar), and
// still permissionless-extendable (anyone can keep it alive).
//   npx tsx scripts/seal.ts --test          seal one drill record and prove the three properties
//   npx tsx scripts/seal.ts                 seal every live record still owned by the registrar
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { and, eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export const SEALED = '0x000000000000000000000000000000000000dEaD' as Hex
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } }
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const registrar = privateKeyToAccount(env.REGISTRAR_KEY as Hex)
const w = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: registrar })

if (process.argv.includes('--test')) {
  const r = await w.createEntity({ payload: jsonToPayload({ note: 'Drill: seal test' }), contentType: 'application/json', attributes: { app: 'switched-off', type: 'record', net: 'drill', order_id: 'drill-seal-test' }, expires: ExpirationTime.fromDays(1), flags: { readonly: true, permissionlessExtension: true } })
  console.log('created', r.entityKey)
  const t = await w.changeOwnership({ entityKey: r.entityKey, newOwner: SEALED })
  console.log('sealed in', t.txHash)
  const e = await pub.getEntity(r.entityKey)
  console.log('owner now', (e as unknown as { owner: Hex }).owner, 'creator', (e as unknown as { creator: Hex }).creator)
  try {
    await w.deleteEntity({ entityKey: r.entityKey })
    console.log('DELETE BY FORMER OWNER: succeeded (bad)')
  } catch (err) {
    console.log('delete by former owner refused:', String((err as Error).message).split('\n')[0].slice(0, 200))
  }
  // a stranger with gas extends it
  const stranger = privateKeyToAccount(generatePrivateKey())
  await w.sendTransaction({ to: stranger.address, value: 300000000000000n, chain: tiramisu, account: registrar } as never)
  await new Promise((s) => setTimeout(s, 4000))
  const sw = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: stranger })
  const x = await sw.extendEntity({ entityKey: r.entityKey, expires: ExpirationTime.fromDays(2) })
  console.log('stranger', stranger.address, 'extended it in', x.txHash)
} else {
  const res = await pub.select({ key: true, owner: true }).where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('net', 'live')])).ownedBy(registrar.address).limit(200).fetch()
  const keys = (res.entities as unknown as { key: Hex }[]).map((e) => e.key)
  console.log('records still owned by the registrar:', keys.length)
  for (let i = 0; i < keys.length; i += 25) {
    const batch = keys.slice(i, i + 25)
    const r = await w.executeBatch({ ownershipChanges: batch.map((k) => ({ entityKey: k, newOwner: SEALED })) })
    console.log(`sealed ${batch.length} in ${r.txHash}`)
  }
}
