import { useEffect, useState } from 'react'

let push: ((m: string) => void) | null = null
export const toast = (m: string) => push?.(m)

/** The live region stays mounted (empty when quiet), so screen readers hear each message. */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: number | undefined
    push = (m) => {
      setMsg(m)
      clearTimeout(t)
      t = window.setTimeout(() => setMsg(null), Math.max(6000, m.length * 70))
    }
    return () => { push = null }
  }, [])
  return <div className={msg ? 'toast' : 'sr'} role="status" aria-live="polite">{msg ?? ''}</div>
}
