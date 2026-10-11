// India at night: every district a cluster of sodium lights. A suspension order in force switches
// its districts off; a citizen report with no published order behind it burns red.
import { useEffect, useMemo, useRef, useState } from 'react'
import { districtIndexes, loadGeo, type Geo } from '../lib/geo'
import type { Order, Report } from '../lib/arkiv'

export type MapState = { off: Map<number, Order>; flagged: Map<number, Report[]>; restored: Set<number> }

export function useMapState(geo: Geo | null, orders: Order[], reports: Report[]): MapState {
  return useMemo(() => {
    const off = new Map<number, Order>()
    const flagged = new Map<number, Report[]>()
    const restored = new Set<number>()
    if (!geo) return { off, flagged, restored }
    for (const o of orders) for (const i of districtIndexes(geo, o.state, o.districts)) off.set(i, o)
    for (const r of reports) {
      const [i] = districtIndexes(geo, r.state, [r.district])
      if (i === undefined) continue
      if (r.status === 'back') restored.add(i)
      else if (!off.has(i)) flagged.set(i, [...(flagged.get(i) ?? []), r])
    }
    return { off, flagged, restored }
  }, [geo, orders, reports])
}

type Props = {
  state: MapState
  focus?: string | null
  onPick?: (districtIndex: number) => void
  label?: string
}

export function NightMap({ state, focus, onPick, label }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const lightRef = useRef<Float32Array | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const focusRef = useRef(focus)
  focusRef.current = focus

  useEffect(() => {
    void loadGeo().then(setGeo)
  }, [])

  // project once; brightness eases toward its target every frame so districts power down, not blink
  useEffect(() => {
    if (!geo || !ref.current || !wrap.current) return
    const c = ref.current
    const g = c.getContext('2d')!
    const [minx, miny, maxx, maxy] = geo.bounds
    const n = geo.dots.length
    const light = (lightRef.current = lightRef.current && lightRef.current.length === n ? lightRef.current : new Float32Array(n).fill(0))
    const seed = new Float32Array(n).map((_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1)
    let w = 0, h = 0, s = 0, ox = 0, oy = 0, dpr = 1
    const resize = () => {
      const r = wrap.current!.getBoundingClientRect()
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = r.width
      h = r.height
      c.width = Math.round(w * dpr)
      c.height = Math.round(h * dpr)
      const sx = w / (maxx - minx)
      const sy = h / ((maxy - miny) * 1.07)
      s = Math.min(sx, sy) * 0.98
      ox = (w - (maxx - minx) * s) / 2
      oy = (h - (maxy - miny) * 1.07 * s) / 2
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap.current)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let t0 = performance.now()
    const draw = (t: number) => {
      const dt = Math.min(0.1, (t - t0) / 1000)
      t0 = t
      const st = stateRef.current
      const f = focusRef.current
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, w, h)
      const r = Math.max(1.1, s * 0.085)
      for (let i = 0; i < n; i++) {
        const [lon, lat, d] = geo.dots[i]
        const x = ox + (lon - minx) * s
        const y = oy + (maxy - lat) * 1.07 * s
        const isOff = d >= 0 && st.off.has(d)
        const isFlag = d >= 0 && st.flagged.has(d)
        const target = d < 0 ? 0.35 : isOff ? 0.06 : 1
        // a district switching off dies with a short flicker, like a grid going down
        const k = reduce ? 1 : Math.min(1, dt * (isOff ? 2.2 + seed[i] * 2 : 1.4 + seed[i]))
        light[i] += (target - light[i]) * k
        const flick = !reduce && isOff && light[i] > 0.12 && Math.random() < 0.08 ? 0.4 : 0
        const v = Math.max(0, light[i] - flick)
        const dim = f && d >= 0 && geo.districts[d].code !== f ? 0.35 : 1
        if (isFlag) {
          const p = reduce ? 1 : 0.65 + 0.35 * Math.sin(t / 380 + seed[i] * 6)
          g.fillStyle = `rgba(255, 98, 80, ${0.9 * p * dim})`
        } else if (v < 0.2) {
          g.fillStyle = `rgba(52, 57, 92, ${0.9 * dim})`
        } else {
          const tw = reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 900 + seed[i] * 40)
          g.fillStyle = `rgba(255, ${170 + Math.round(seed[i] * 40)}, ${60 + Math.round(seed[i] * 50)}, ${v * tw * dim})`
        }
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const pick = (ev: PointerEvent) => {
      const b = c.getBoundingClientRect()
      const px = ev.clientX - b.left
      const py = ev.clientY - b.top
      let best = -1, bd = 1e9
      for (let i = 0; i < n; i++) {
        const [lon, lat, d] = geo.dots[i]
        if (d < 0) continue
        const x = ox + (lon - minx) * s
        const y = oy + (maxy - lat) * 1.07 * s
        const dd = (x - px) ** 2 + (y - py) ** 2
        if (dd < bd) { bd = dd; best = i }
      }
      if (best < 0 || bd > (s * 0.6) ** 2) return { di: -1, px, py }
      return { di: geo.dots[best][2], px, py }
    }
    const move = (ev: PointerEvent) => {
      const { di, px, py } = pick(ev)
      if (di < 0) return setTip(null)
      const d = geo.districts[di]
      const st = stateRef.current
      const o = st.off.get(di)
      const fl = st.flagged.get(di)
      const text = o
        ? `${d.name}, ${d.state}: switched off by order${o.emergency && !o.confirmed ? ' (emergency, unconfirmed)' : ''}`
        : fl
          ? `${d.name}, ${d.state}: ${fl.length} report${fl.length > 1 ? 's' : ''} of no internet, and no published order`
          : `${d.name}, ${d.state}: lights on`
      setTip({ x: px, y: py, text })
    }
    const click = (ev: PointerEvent) => {
      const { di } = pick(ev)
      if (di >= 0) onPick?.(di)
    }
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerleave', () => setTip(null))
    c.addEventListener('pointerup', click)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', click)
    }
  }, [geo, onPick])

  const offCount = state.off.size
  const flagCount = state.flagged.size
  return (
    <figure style={{ margin: 0 }}>
      <div className="map-wrap" ref={wrap}>
        {!geo && <div className="skel" style={{ position: 'absolute', inset: '8%' }} aria-hidden="true" />}
        <canvas ref={ref} role="img" aria-label={label ?? `Map of India's districts at night. ${offCount} districts switched off by an order in force; ${flagCount} districts with reports of no internet but no published order.`} />
        {tip && <div className="map-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      </div>
      <figcaption className="legend">
        <span><i style={{ background: 'var(--sodium)' }} />Lights on</span>
        <span><i style={{ background: '#34395c' }} />Switched off by an order in force</span>
        <span><i style={{ background: 'var(--vermilion)' }} />Reported dark, no published order</span>
      </figcaption>
    </figure>
  )
}
