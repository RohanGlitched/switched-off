import { createPublicClient, createWalletClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk/utils"
import { http, formatEther } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('../.env.local','utf8').trim().split('\n').map(l=>l.split('=')))
const account = privateKeyToAccount(env.REGISTRAR_KEY)
const pub = createPublicClient({ chain: tiramisu, transport: http() })
const w = createWalletClient({ chain: tiramisu, transport: http(), account })
const bal = async () => await pub.getBalance({ address: account.address })
const payload = jsonToPayload({ name: 'Switched Off registrar', role: 'Transcribes published Indian telecom suspension orders', site: 'switched-off' })
for (const [label, exp] of [['1 day', ExpirationTime.fromDays(1)], ['30 days', ExpirationTime.fromDays(30)], ['365 days', ExpirationTime.fromDays(365)]]) {
  const b0 = await bal()
  const t = Date.now()
  const r = await w.createEntity({ payload, contentType: 'application/json', attributes: { app: 'switched-off', type: 'registrar', label }, expires: exp, flags: { readonly: true } })
  const b1 = await bal()
  const rc = await pub.getTransactionReceipt({ hash: r.txHash })
  console.log(label, 'cost', formatEther(b0 - b1), 'GLM gasUsed', rc.gasUsed, 'gasPrice', rc.effectiveGasPrice, 'ms', Date.now() - t, r.entityKey)
}
console.log('balance', formatEther(await bal()))
