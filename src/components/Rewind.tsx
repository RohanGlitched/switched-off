// Days of suspended internet per state per year, from the archive records.
import { useMemo, useState } from 'react'
import type { Record_ } from '../lib/arkiv'
import { Link } from '../lib/router'

export function Rewind({ records }: { records: Record_[] }) {
  const { years, states, cell, max } = useMemo(() => {
    const cell = new Map<string, number>()
    const ys = new Set<number>()
    const st = new Map<string, number>()
    for (const r of records) {
      // split each order's days across the years it ran in
      let a = r.starts * 1000
      const b = r.ends * 1000
      while (a < b) {
        const y = new Date(a).getUTCFullYear()
        const yEnd = Date.UTC(y + 1, 0, 1)
        const d = Math.max(0, (Math.min(b, yEnd) - a) / 86_400_000)
        const k = `${r.stateName}|${y}`
        cell.set(k, (cell.get(k) ?? 0) + d)
        st.set(r.stateName, (st.get(r.stateName) ?? 0) + d)
        ys.add(y)
        a = yEnd
      }
    }
    const years = [...ys].sort()
    const states = [...st.entries()].sort((x, y) => y[1] - x[1]).map(([s]) => s)
    return { years, states, cell, max: Math.max(1, ...cell.values()) }
  }, [records])
  const [hover, setHover] = useState<string | null>(null)
  if (!records.length) return <div className="skel" style={{ height: 260 }} />
  return (
    <div className="panel" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 4, minWidth: 520, width: '100%' }}>
        <caption className="sr">Days of internet suspended, by state and year</caption>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontWeight: 500, color: 'var(--mute)', fontSize: 13 }}>State</th>
            {years.map((y) => <th key={y} className="num" style={{ fontWeight: 500, color: 'var(--mute)', fontSize: 13 }}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {states.map((s) => (
            <tr key={s}>
              <td style={{ fontSize: 14, whiteSpace: 'nowrap', paddingRight: 8 }}><Link to={`/register?q=${encodeURIComponent(s)}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{s}</Link></td>
              {years.map((y) => {
                const v = cell.get(`${s}|${y}`) ?? 0
                const k = `${s}|${y}`
                const a = v ? 0.18 + 0.82 * Math.sqrt(v / max) : 0
                return (
                  <td key={y} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} title={`${s}, ${y}: ${Math.round(v)} days`}
                    style={{ height: 34, minWidth: 44, borderRadius: 6, textAlign: 'center', fontSize: 12, background: v ? `rgba(255, 181, 71, ${a})` : 'var(--night)', color: a > 0.55 ? 'var(--ink)' : 'var(--mute)', outline: hover === k ? '1px solid var(--sodium)' : undefined }}
                    className="num">
                    {v ? Math.round(v) : ''}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ margin: '10px 0 0' }}>Days counted from each order’s stated start and end; renewals add up. Brighter is longer.</p>
    </div>
  )
}
