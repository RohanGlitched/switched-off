// Districts that any order on file has ever switched off (for the cover and title cards).
import fs from 'node:fs'
import { districtIndexes, type Geo } from '../src/lib/geo'
const g = JSON.parse(fs.readFileSync('public/geo/india-dots.json', 'utf8')) as Geo
const orders = JSON.parse(fs.readFileSync('research/orders-all.json', 'utf8')) as { stateCode: string; districts: string[] }[]
const ever = new Set<number>()
for (const o of orders) for (const i of districtIndexes(g, o.stateCode.split('-')[1], o.districts)) ever.add(i)
fs.writeFileSync('../video/ever.json', JSON.stringify([...ever]))
console.log('districts ever dark:', ever.size)
