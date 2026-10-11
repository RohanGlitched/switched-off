// India at night: every district a cluster of sodium lights. A suspension order in force switches
// its districts off; a citizen report with no published order behind it burns red.
import { useEffect, useMemo, useRef, useState } from 'react'
import { districtIndexes, loadGeo, type Geo } from '../lib/geo'
import type { Order, Report } from '../lib/arkiv'
import { useT } from '../lib/i18n'

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
  /** zoom the map onto the focused state */
  zoom?: boolean
  onPick?: (districtIndex: number) => void
  label?: string
}

export function NightMap({ state, focus, onPick, label, zoom }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null)
  const ref = useRef<HTMLCanvasElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const lightRef = useRef<Float32Array | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state
  const focusRef = useRef(focus)
  focusRef.current = focus
  const pickRef = useRef(onPick)
  pickRef.current = onPick
  // what part of India to frame: the whole country, or (zoomed) the focused state with a margin
  const bounds = useMemo((): [number, number, number, number] | null => {
    if (!geo) return null
    if (!zoom || !focus) return geo.bounds
    const pts = geo.dots.filter(([, , d]) => d >= 0 && geo.districts[d].code === focus)
    if (!pts.length) return geo.bounds
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
    const pad = 1.4
    return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]
  }, [geo, focus, zoom])
  const boundsRef = useRef(bounds)
  boundsRef.current = bounds
  const reframe = useRef<() => void>(() => {})
  useEffect(() => reframe.current(), [bounds])

  useEffect(() => {
    void loadGeo().then(setGeo)
  }, [])

  // project once; brightness eases toward its target every frame so districts power down, not blink
  useEffect(() => {
    if (!geo || !ref.current || !wrap.current) return
    const c = ref.current
    const g = c.getContext('2d')!
    let [minx, miny, maxx, maxy] = boundsRef.current ?? geo.bounds
    const n = geo.dots.length
    // start lit (the first frame is already right); only changes animate
    const light = (lightRef.current = lightRef.current && lightRef.current.length === n ? lightRef.current : Float32Array.from(geo.dots, (d) => (d[2] < 0 ? 0.35 : 1)))
    const seed = new Float32Array(n).map((_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1)
    let w = 0, h = 0, s = 0, ox = 0, oy = 0, dpr = 1
    const resize = () => {
      ;[minx, miny, maxx, maxy] = boundsRef.current ?? geo.bounds
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
    reframe.current = () => {
      resize()
      draw(performance.now())
    }
    // centre and radius of each district that is off or flagged, computed once per map state
    const centroidCache = new WeakMap<MapState, Map<number, { lon: number; lat: number; r: number }>>()
    const centroids = (st: MapState) => {
      let m = centroidCache.get(st)
      if (m) return m
      m = new Map()
      const acc = new Map<number, { lon: number; lat: number; k: number; pts: [number, number][] }>()
      for (const [lon, lat, d] of geo.dots) {
        if (d < 0 || !(st.off.has(d) || st.flagged.has(d))) continue
        const a = acc.get(d) ?? { lon: 0, lat: 0, k: 0, pts: [] }
        a.lon += lon
        a.lat += lat
        a.k++
        a.pts.push([lon, lat])
        acc.set(d, a)
      }
      for (const [d, a] of acc) {
        const lon = a.lon / a.k, lat = a.lat / a.k
        let r = 0
        for (const [x, y] of a.pts) r = Math.max(r, Math.hypot(x - lon, (y - lat) * 1.07))
        m.set(d, { lon, lat, r })
      }
      centroidCache.set(st, m)
      return m
    }
    // a resize clears the canvas: repaint at once, even if animation frames are paused (hidden tab)
    const ro = new ResizeObserver(() => {
      resize()
      draw(performance.now())
    })
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
      const r = Math.min(14, Math.max(1.1, s * 0.085))
      // a halo under each district that is off or flagged, so one dark or red cluster reads at a glance
      const halos = centroids(st)
      for (const [d, c] of halos) {
        const x = ox + (c.lon - minx) * s
        const y = oy + (maxy - c.lat) * 1.07 * s
        const flag = st.flagged.has(d)
        const comm = !flag && !st.off.get(d)?.official
        const dimH = f && geo.districts[d].code !== f ? 0.35 : 1
        const pulse = reduce ? 1 : 0.7 + 0.3 * Math.sin(t / 420 + d)
        g.beginPath()
        g.arc(x, y, Math.max(r * 4, c.r * s + r * 2), 0, Math.PI * 2)
        g.fillStyle = flag ? `rgba(255, 98, 80, ${0.16 * pulse * dimH})` : comm ? `rgba(190, 150, 80, ${0.1 * dimH})` : `rgba(120, 128, 200, ${0.1 * dimH})`
        g.fill()
        g.lineWidth = Math.max(1, r * 0.5)
        if (comm) g.setLineDash([r * 1.5, r * 1.2])
        g.strokeStyle = flag ? `rgba(255, 98, 80, ${0.75 * pulse * dimH})` : comm ? `rgba(190, 150, 80, ${0.7 * dimH})` : `rgba(120, 128, 200, ${0.6 * dimH})`
        g.stroke()
        g.setLineDash([])
      }
      for (let i = 0; i < n; i++) {
        const [lon, lat, d] = geo.dots[i]
        const x = ox + (lon - minx) * s
        const y = oy + (maxy - lat) * 1.07 * s
        const isOff = d >= 0 && st.off.has(d)
        const isFlag = d >= 0 && st.flagged.has(d)
        const community = isOff && !st.off.get(d)!.official
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
          g.fillStyle = community ? `rgba(150, 120, 70, ${0.95 * dim})` : `rgba(96, 104, 170, ${0.95 * dim})`
        } else {
          const tw = reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 900 + seed[i] * 40)
          g.fillStyle = `rgba(255, ${170 + Math.round(seed[i] * 40)}, ${60 + Math.round(seed[i] * 50)}, ${v * tw * dim})`
        }
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    draw(performance.now())

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
        ? `${d.name}, ${d.state}: switched off by ${o.official ? 'order' : 'a community-filed order (unverified)'}${o.emergency && !o.confirmed ? ' (emergency, unconfirmed)' : ''}`
        : fl
          ? `${d.name}, ${d.state}: ${fl.length} report${fl.length > 1 ? 's' : ''} of no internet, and no published order`
          : o === undefined && false
            ? ''
          : `${d.name}, ${d.state}: lights on`
      setTip({ x: px, y: py, text })
    }
    const click = (ev: PointerEvent) => {
      const { di } = pick(ev)
      if (di >= 0) pickRef.current?.(di)
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
  }, [geo])

  const t = useT()
  const offCount = state.off.size
  const flagCount = state.flagged.size
  return (
    <figure style={{ margin: 0 }}>
      <div className="map-wrap" ref={wrap}>
        {!geo && <div className="skel" style={{ position: 'absolute', inset: '8%' }} aria-hidden="true" />}
        <canvas ref={ref} role="img" aria-label={label ?? `Map of India's districts at night. ${offCount} district${offCount === 1 ? '' : 's'} switched off by an order in force; ${flagCount} district${flagCount === 1 ? '' : 's'} with reports of no internet but no published order.`} />
        {tip && <div className="map-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
      </div>
      <figcaption className="legend">
        <span><i style={{ background: 'var(--sodium)' }} />{t('Lights on')}</span>
        <span><i style={{ background: '#6068aa' }} />{t('Switched off by an order in force')}</span>
        <span><i style={{ background: '#967846', outline: '1px dashed #be9650' }} />{t('Community-filed order (unverified)')}</span>
        <span><i style={{ background: 'var(--vermilion)' }} />{t('Reported dark, no published order')}</span>
      </figcaption>
    </figure>
  )
}
