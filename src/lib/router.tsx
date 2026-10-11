import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const subs = new Set<() => void>()
window.addEventListener('popstate', () => subs.forEach((f) => f()))
export function go(to: string) {
  if (to === location.pathname + location.search) return
  history.pushState(null, '', to)
  window.scrollTo({ top: 0 })
  subs.forEach((f) => f())
}
export function usePath() {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => location.pathname + location.search,
  )
}
export function Link({ to, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const path = usePath().split('?')[0]
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    go(to)
  }
  return <a href={to} onClick={onClick} aria-current={path === to ? 'page' : undefined} {...rest} />
}
export const param = (k: string) => new URLSearchParams(location.search).get(k)
