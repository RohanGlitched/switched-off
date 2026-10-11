import { useEffect, useState } from 'react'

let push: ((m: string) => void) | null = null
export const toast = (m: string) => push?.(m)

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    let t: number | undefined
    push = (m) => {
      setMsg(m)
      clearTimeout(t)
      t = window.setTimeout(() => setMsg(null), 5200)
    }
    return () => { push = null }
  }, [])
  return msg ? <div className="toast" role="status">{msg}</div> : null
}
