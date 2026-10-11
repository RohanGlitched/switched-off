// Gives a visitor's in-browser wallet enough testnet GLM to file reports and confirm others.
// Zero setup for the visitor: no extension, no sign-up, no faucet queue.
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { http, isAddress, parseEther, formatEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const DRIP = parseEther('0.005') // about fifty writes
const ENOUGH = parseEther('0.002')
const seen = new Map<string, number>()

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Send a POST with { address }.' })
  const body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as { address?: string }
  const address = body.address
  if (!address || !isAddress(address)) return res.status(400).json({ error: 'That is not a wallet address.' })
  const key = process.env.FAUCET_KEY as Hex | undefined
  if (!key) return res.status(503).json({ error: 'The gas tap is not configured.' })

  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const now = Date.now()
  for (const id of [ip, address.toLowerCase()]) {
    if ((seen.get(id) ?? 0) > now - 60_000) return res.status(429).json({ error: 'One top-up a minute. Try again shortly.' })
  }

  const opts = process.env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': process.env.ARKIV_KEY } } } : {}
  const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
  const have = await pub.getBalance({ address })
  if (have >= ENOUGH) return res.status(200).json({ ok: true, funded: false, balance: formatEther(have) })

  const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(key) })
  try {
    const hash = await wallet.sendTransaction({ to: address, value: DRIP, chain: tiramisu, account: wallet.account! } as Parameters<typeof wallet.sendTransaction>[0])
    await pub.waitForTransactionReceipt({ hash, timeout: 30_000 })
    seen.set(ip, now)
    seen.set(address.toLowerCase(), now)
    return res.status(200).json({ ok: true, funded: true, txHash: hash, balance: formatEther(have + DRIP) })
  } catch (e) {
    return res.status(502).json({ error: 'The testnet did not take the top-up. Try again in a moment.', detail: String((e as Error).message).slice(0, 160) })
  }
}
