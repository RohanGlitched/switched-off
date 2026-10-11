// A throwaway wallet that lives in this browser. Reports are signed by it, so they are owned by
// the person who filed them, and nobody else (not even this site) can edit or delete them.
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { formatEther, parseEther, type Hex } from 'viem'
import { pub, walletFor } from './arkiv'

const KEY = 'switched-off:key'

function load(): Hex {
  try {
    const k = localStorage.getItem(KEY) as Hex | null
    if (k && /^0x[0-9a-f]{64}$/i.test(k)) return k
    const n = generatePrivateKey()
    localStorage.setItem(KEY, n)
    return n
  } catch {
    // private window or storage blocked: a key for this tab only
    return ((globalThis as { __soKey?: Hex }).__soKey ??= generatePrivateKey())
  }
}

export const account = privateKeyToAccount(load())
export const wallet = walletFor(account)

/** A short, stable name for an address: what a person sees instead of 0x… */
export function witnessName(addr: string): string {
  return `Witness ${addr.slice(2, 6).toUpperCase()}`
}

export async function balance(): Promise<bigint> {
  try {
    return await pub.getBalance({ address: account.address })
  } catch {
    return 0n
  }
}

/** Make sure this browser's wallet can pay for a write: asks the site's gas tap if it can't. */
export async function ensureGas(): Promise<void> {
  if ((await balance()) >= parseEther('0.0003')) return
  const r = await fetch('/api/drip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: account.address }) })
  const j = (await r.json().catch(() => ({}))) as { error?: string }
  if (!r.ok) throw new Error(j.error ?? 'Could not get testnet gas for this browser.')
}

/**
 * Forget this browser's key (and any reports waiting offline). A phone checked at a checkpoint then
 * holds nothing that links it to reports already filed; the reports themselves stay on Arkiv.
 */
export function forgetKey() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('switched-off:queue')
  } catch {
    /* nothing stored */
  }
  location.reload()
}

export const fmtGlm = (v: bigint) => `${Number(formatEther(v)).toFixed(4)} GLM`
