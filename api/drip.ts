// Gives a visitor's in-browser wallet enough testnet GLM to file reports and confirm others.
// Zero setup for the visitor: no extension, no sign-up, no faucet queue.
import { createPublicClient, createWalletClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { http, isAddress, parseEther, formatEther, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const RPC = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const DRIP = parseEther('0.002') // about twenty writes
const ENOUGH = parseEther('0.001')
const HOURLY = 80 // top-ups an hour per server instance, whoever asks
const seen = new Map<string, number>()
const byIp = new Map<string, number[]>()
let hour: number[] = []

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
type Res = { status: (n: number) => Res; json: (b: unknown) => void; setHeader: (k: string, v: string) => void }

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Send a POST with { address }.' })
  let body: { address?: string }
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}) as { address?: string }
  } catch {
    return res.status(400).json({ error: 'Send JSON: { address }.' })
  }
  const address = body.address
  if (!address || !isAddress(address)) return res.status(400).json({ error: 'That is not a wallet address.' })
  const key = process.env.FAUCET_KEY as Hex | undefined
  if (!key) return res.status(503).json({ error: 'The gas tap is not configured.' })

  // one top-up a minute per wallet; a shared office or campus IP gets six per ten minutes
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const now = Date.now()
  if ((seen.get(address.toLowerCase()) ?? 0) > now - 60_000) return res.status(429).json({ error: 'This browser was topped up a moment ago. Try again in a minute.' })
  const recent = (byIp.get(ip) ?? []).filter((t) => t > now - 600_000)
  if (recent.length >= 6) return res.status(429).json({ error: 'Many top-ups from this network just now. Try again in a few minutes.' })
  hour = hour.filter((t) => t > now - 3_600_000)
  if (hour.length >= HOURLY) return res.status(429).json({ error: 'The gas tap is busy this hour. Reading the register still works; try reporting again later.' })
  // take the slots before the slow part, so a burst of parallel requests can't all pass the checks
  seen.set(address.toLowerCase(), now)
  byIp.set(ip, [...recent, now])
  hour.push(now)
  const release = () => {
    seen.delete(address.toLowerCase())
    byIp.set(ip, (byIp.get(ip) ?? []).filter((t) => t !== now))
    hour = hour.filter((t) => t !== now)
  }

  const opts = process.env.ARKIV_KEY ? { fetchOptions: { headers: { 'x-api-key': process.env.ARKIV_KEY } } } : {}
  const pub = createPublicClient({ chain: tiramisu, transport: http(RPC, opts) })
  const wallet = createWalletClient({ chain: tiramisu, transport: http(RPC, opts), account: privateKeyToAccount(key) })
  let have: bigint
  try {
    const [h, tap] = await Promise.all([pub.getBalance({ address }), pub.getBalance({ address: wallet.account!.address })])
    have = h
    if (have >= ENOUGH) {
      release()
      return res.status(200).json({ ok: true, funded: false, balance: formatEther(have) })
    }
    if (tap < DRIP * 3n) {
      release()
      return res.status(503).json({ error: 'The gas tap is empty, so new reports are paused until it is refilled. Reading the register still works, and so does any Arkiv wallet of your own.' })
    }
  } catch {
    release()
    return res.status(502).json({ error: 'Arkiv did not answer. Try again in a moment.' })
  }
  try {
    const hash = await wallet.sendTransaction({ to: address, value: DRIP, chain: tiramisu, account: wallet.account! } as unknown as Parameters<typeof wallet.sendTransaction>[0])
    await pub.waitForTransactionReceipt({ hash, timeout: 30_000 })
    return res.status(200).json({ ok: true, funded: true, txHash: hash, balance: formatEther(have + DRIP) })
  } catch (e) {
    release()
    return res.status(502).json({ error: 'The testnet did not take the top-up. Try again in a moment.', detail: String((e as Error).message).slice(0, 160) })
  }
}
