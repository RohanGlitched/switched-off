// Records are readonly and sealed, so a mistake is fixed by filing a correction: a new record that
// names the entity it corrects (`corrects`), in the same order_id. Readers show the correction and
// link back to the original, so the history of the fix is public too.
import fs from 'node:fs'
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { i32, u64 } from '@arkiv-network/sdk/attr'
import { and, eq } from '@arkiv-network/sdk/query'
import { ExpirationTime, jsonToPayload } from '@arkiv-network/sdk/utils'
import { http, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
const SEALED = '0x000000000000000000000000000000000000dEaD' as Hex
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').trim().split(/\r?\n/).filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const opts = { fetchOptions: { headers: { 'x-api-key': env.ARKIV_KEY } } }
const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
const w = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(env.REGISTRAR_KEY as Hex) })
const ID = 'rj-udaipur-2024-08-16'
const orig = (await pub.select({ key: true }).where(and([eq('app', 'switched-off'), eq('type', 'record'), eq('order_id', ID)])).fetch()).entities as unknown as { key: Hex }[]
console.log('original(s):', orig.map((e) => e.key))
const t = (s: string) => BigInt(Math.floor(new Date(`${s}T00:00:00+05:30`).getTime() / 1000))
const r = await w.createEntity({
  payload: jsonToPayload({
    authority: 'District administration, Udaipur',
    reason: 'Law and order after violence that followed a student allegedly stabbing a classmate at a government school.',
    districts: ['Udaipur'],
    sources: [{ title: 'Outlook India: Udaipur admin suspends internet after violence over student stabbing', url: 'https://www.outlookindia.com/amp/story/national/udaipur-rajasthan-admn-suspends-internet-after-violence-over-student-stabbing' }],
    stateName: 'Rajasthan',
    published: null,
    notes: 'Correction: the first record had no start date. The source reports a 24-hour suspension in Udaipur city after the violence of 16 Aug 2024 (reported 17 Aug); the start time was not given, so the day is used.',
    basis: '',
    endStated: true,
  }),
  contentType: 'application/json',
  attributes: { app: 'switched-off', type: 'record', net: 'live', order_id: ID, state: 'RJ', district: 'Udaipur', scope: 'unknown', issued: u64(t('2024-08-16')), starts: u64(t('2024-08-16')), ends: u64(t('2024-08-17')), emergency: false, basis: 'not-stated', renews: '', seq: i32(1), corrects: orig[0].key },
  expires: ExpirationTime.fromYears(2),
  flags: { readonly: true, permissionlessExtension: true },
})
console.log('correction', r.entityKey, r.txHash)
const s = await w.changeOwnership({ entityKey: r.entityKey, newOwner: SEALED })
console.log('sealed', s.txHash)
