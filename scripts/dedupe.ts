// The first import attempt wrote one batch before failing; the rerun wrote it again.
// Delete the older copy of each duplicated record (owner-only, so only the registrar can).
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { and, eq } from '@arkiv-network/sdk/query'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const opts = { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } }
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(env.REGISTRAR_KEY as Hex) })
const res = await pub.select({ key: true, attributes: true, createdAt: true }).where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('net', 'live')])).limit(200).fetch()
const by = new Map<string, { key: Hex; createdAt: bigint }[]>()
for (const e of res.entities as unknown as { key: Hex; createdAt: bigint; attributes: Record<string, { value: unknown }> }[]) {
  const id = String(e.attributes.order_id?.value ?? e.attributes.order_id)
  by.set(id, [...(by.get(id) ?? []), { key: e.key, createdAt: e.createdAt }])
}
const deletes = [...by.values()].filter((v) => v.length > 1).flatMap((v) => v.sort((a, b) => Number(a.createdAt - b.createdAt)).slice(0, -1).map((x) => ({ entityKey: x.key })))
console.log('records', res.entities.length, 'duplicates to delete', deletes.length)
if (deletes.length && !process.argv.includes('--dry')) {
  const r = await wallet.executeBatch({ deletes })
  console.log('deleted in', r.txHash)
}
