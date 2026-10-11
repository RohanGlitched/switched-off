// Reproduces each item in arkiv/friction.md against Tiramisu. Run: npx tsx scripts/friction-repro.ts
// Needs REGISTRAR_KEY (a funded key) in .env.local. Spends a few thousandths of a testnet GLM.
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } } : {}
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const w = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(env.REGISTRAR_KEY as Hex) })
const base = { payload: jsonToPayload({ note: 'friction repro' }), contentType: 'application/json' }
const run = async (name: string, f: () => Promise<unknown>) => {
  try {
    const r = await f()
    console.log(`\n[${name}] OK:`, typeof r === 'string' ? r : JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 300))
  } catch (e) {
    console.log(`\n[${name}] ${(e as Error).name}: ${String((e as Error).message).split('\n')[0].slice(0, 400)}`)
  }
}

await run('1 camelCase attribute name (SDK accepts, node rejects)', () =>
  w.createEntity({ ...base, attributes: { app: 'switched-off-repro', orderId: 'x' }, expires: ExpirationTime.fromBlocks(30) }))
await run('2 lifetime that is not a whole block', () =>
  w.createEntity({ ...base, attributes: { app: 'switched-off-repro' }, expires: ExpirationTime.fromSeconds(299) }))
await run('3 query without a filter in the SDK', () => pub.select({ key: true }).limit(1).fetch().then((r) => r.entities.length))
await run('3b the same through raw RPC with *', () =>
  fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.ARKIV_KEY ? { 'x-api-key': env.ARKIV_KEY } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: ['*', { select: { key: true }, limit: '0x1' }] }) }).then((r) => r.json()))
await run('4 raw RPC with a JSON-style string literal', () =>
  fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.ARKIV_KEY ? { 'x-api-key': env.ARKIV_KEY } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: ['app = "switched-off"', { select: { key: true } }] }) }).then((r) => r.json()))
await run('5 str attribute over 128 bytes', () =>
  w.createEntity({ ...base, attributes: { app: 'switched-off-repro', basis: 'x'.repeat(139) }, expires: ExpirationTime.fromBlocks(30) }))
await run('6 lifetime is not priced (1 day vs 365 days)', async () => {
  const out: string[] = []
  for (const days of [1, 365]) {
    const r = await w.createEntity({ ...base, attributes: { app: 'switched-off-repro', days }, expires: ExpirationTime.fromDays(days) })
    const rc = await pub.getTransactionReceipt({ hash: r.txHash })
    out.push(`${days}d: gasUsed ${rc.gasUsed}`)
    await w.deleteEntity({ entityKey: r.entityKey })
  }
  return out.join(', ')
})
await run('7 attributes read back tagged', async () => {
  const r = await pub.select({ attributes: true }).where(eq('app', 'switched-off')).limit(1).fetch()
  return (r.entities[0] as unknown as { attributes: unknown }).attributes
})
await run('8 an expired entity: gone now, still there at an earlier block', async () => {
  const r = await w.createEntity({ ...base, attributes: { app: 'switched-off-repro', probe: 'expiry' }, expires: ExpirationTime.fromBlocks(10) })
  const rc = await pub.getTransactionReceipt({ hash: r.txHash })
  await new Promise((s) => setTimeout(s, 40_000))
  const now = (await pub.select({ key: true }).where(eq('probe', 'expiry')).fetch()).entities.length
  const then = (await pub.select({ key: true }).where(eq('probe', 'expiry')).atBlock(rc.blockNumber).fetch()).entities.length
  let get = 'found'
  try { await pub.getEntity(r.entityKey) } catch (e) { get = String((e as Error).message).slice(0, 160) }
  return { aliveNow: now, aliveAtCreationBlock: then, getEntity: get }
})
