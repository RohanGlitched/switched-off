import fs from 'node:fs'
import { districtIndexes, type Geo } from '../src/lib/geo'
const g = JSON.parse(fs.readFileSync('public/geo/india-dots.json', 'utf8')) as Geo
const orders = JSON.parse(fs.readFileSync(process.argv[2] ?? '../research/orders.json', 'utf8')) as { id: string; stateCode: string; districts: string[] }[]
let miss = 0
for (const o of orders) {
  const code = o.stateCode.split('-')[1]
  for (const d of o.districts) {
    const hit = districtIndexes(g, code, [d])
    if (!hit.length) { miss++; console.log('MISS', o.id, code, d) }
  }
}
console.log('orders', orders.length, 'misses', miss)
