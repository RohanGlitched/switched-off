// Pins evidence that survives expiry: files a drill order that lapses in about a minute, waits,
// then shows it is gone at the head but present at its creation block. Writes scripts/evidence.json.
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import { and, eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } }
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const w = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(env.REGISTRAR_KEY as Hex) })
const now = Math.floor(Date.now() / 1000)
const id = 'drill-evidence-lapse'
const r = await w.createEntity({
  payload: jsonToPayload({ authority: 'Home Department (drill)', reason: 'Drill: evidence that a lapsed order is still provable at its block.', districts: ['Imphal West'], sources: [], stateName: 'Manipur', published: true, notes: 'Pinned evidence for the expiry gate.', basis: '', endStated: true }),
  contentType: 'application/json',
  attributes: { app: 'switched-off', type: 'order', net: 'drill', order_id: id, state: 'MN', district: 'Imphal West', scope: 'mobile-data', issued: u64(BigInt(now)), starts: u64(BigInt(now)), ends: u64(BigInt(now + 60)), emergency: false, basis: 'tsr-2024', renews: '', seq: i32(1) },
  expires: ExpirationTime.fromBlocks(30),
  flags: { readonly: true },
})
const rc = await pub.getTransactionReceipt({ hash: r.txHash })
const q = and([eq('app', 'switched-off'), eq('order_id', id)])
await new Promise((s) => setTimeout(s, 75_000))
const head = await pub.getBlockNumber()
const nowCount = (await pub.select({ key: true }).where(q).fetch()).entities.filter((e) => (e as { key: Hex }).key === r.entityKey).length
const thenCount = (await pub.select({ key: true }).where(q).atBlock(rc.blockNumber).fetch()).entities.filter((e) => (e as { key: Hex }).key === r.entityKey).length
const out = {
  entityKey: r.entityKey,
  txHash: r.txHash,
  createdAtBlock: rc.blockNumber.toString(),
  lifetimeBlocks: 30,
  checkedAtHead: head.toString(),
  aliveAtHead: nowCount,
  aliveAtCreationBlock: thenCount,
  query: "app = str('switched-off') AND order_id = str('drill-evidence-lapse')",
  atBlockHex: '0x' + rc.blockNumber.toString(16),
}
fs.writeFileSync('scripts/evidence.json', JSON.stringify(out, null, 1))
console.log(out)
