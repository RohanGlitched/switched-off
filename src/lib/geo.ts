// India as ~4,000 lights, each belonging to a 2011-census district (Datameet, CC BY 2.5 IN) inside
// the official outline (Datameet india-composite, CC-0). Orders name today's districts, so newer
// districts are mapped to the 2011 district they were carved out of.
export type District = { id: string; name: string; state: string; code: string; lon: number; lat: number }
export type Geo = { bounds: [number, number, number, number]; districts: District[]; dots: [number, number, number][] }

let geo: Promise<Geo> | null = null
export const loadGeo = () => (geo ??= fetch('/geo/india-dots.json').then((r) => r.json() as Promise<Geo>))

export const STATES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands', AP: 'Andhra Pradesh', AR: 'Arunachal Pradesh', AS: 'Assam', BR: 'Bihar', CH: 'Chandigarh', CT: 'Chhattisgarh',
  DH: 'Dadra and Nagar Haveli and Daman and Diu', DL: 'Delhi', GA: 'Goa', GJ: 'Gujarat', HP: 'Himachal Pradesh', HR: 'Haryana', JH: 'Jharkhand',
  JK: 'Jammu and Kashmir', KA: 'Karnataka', KL: 'Kerala', LA: 'Ladakh', LD: 'Lakshadweep', MH: 'Maharashtra', ML: 'Meghalaya', MN: 'Manipur',
  MP: 'Madhya Pradesh', MZ: 'Mizoram', NL: 'Nagaland', OD: 'Odisha', PB: 'Punjab', PY: 'Puducherry', RJ: 'Rajasthan', SK: 'Sikkim',
  TS: 'Telangana', TN: 'Tamil Nadu', TR: 'Tripura', UP: 'Uttar Pradesh', UK: 'Uttarakhand', WB: 'West Bengal',
}

/** Newer district → the 2011 district it came from (or the 2011 spelling). */
const ALIAS: Record<string, string> = {
  // Haryana
  nuh: 'mewat', 'charkhi dadri': 'bhiwani', gurugram: 'gurgaon', 'sirsa': 'sirsa',
  // Manipur (2016 reorganisation)
  kakching: 'thoubal', jiribam: 'imphal east', kangpokpi: 'senapati', tengnoupal: 'chandel', kamjong: 'ukhrul', noney: 'tamenglong', pherzawl: 'churachandpur',
  // Jammu and Kashmir / Ladakh
  'leh ladakh': 'leh', 'leh-ladakh': 'leh', baramulla: 'baramula', budgam: 'badgam', shopian: 'shupiyan', bandipora: 'bandipore', poonch: 'punch',
  // West Bengal, Bihar, Assam, Arunachal (spellings and post-2011 districts)
  'cooch behar': 'koch bihar', darjeeling: 'darjiling', howrah: 'haora', hooghly: 'hugli', 'west champaran': 'pashchim champaran', 'east champaran': 'purba champaran',
  charaideo: 'sivasagar', 'itanagar capital region': 'papum pare', itanagar: 'papum pare', ferozepur: 'firozpur',
  // Delhi orders name protest sites, not districts (2011 district they fall in)
  bawana: 'north west', jaffarabad: 'north east', mustafabad: 'north east', seelampur: 'north east', 'jamia nagar': 'south', 'shaheen bagh': 'south', 'mandi house': 'new delhi',
  'walled city areas of north and central districts': 'central',
  // Meghalaya, Telangana, Uttar Pradesh, Maharashtra: districts carved out after 2011
  'east jaintia hills': 'jaintia hills', 'west jaintia hills': 'jaintia hills', 'eastern west khasi hills': 'west khasi hills', 'south west khasi hills': 'west khasi hills',
  'north garo hills': 'east garo hills', 'south west garo hills': 'west garo hills', 'ri-bhoi': 'ri bhoi',
  'kumuram bheem asifabad': 'adilabad', mancherial: 'adilabad', nirmal: 'adilabad',
  amroha: 'jyotiba phule nagar', hapur: 'ghaziabad', sambhal: 'moradabad', shamli: 'muzaffarnagar', beed: 'bid',
  singhu: 'north west', 'singhu border': 'north west', tikri: 'west', 'tikri border': 'west', 'mukarba chowk': 'north west', nangloi: 'west', ghazipur: 'east', janpath: 'new delhi',
  // Rajasthan, Punjab, others
  sriganganagar: 'ganganagar', 'sri ganganagar': 'ganganagar', 'sas nagar': 'sahibzada ajit singh nagar', 'sahibzada ajit singh nagar': 'sahibzada ajit singh nagar', mohali: 'sahibzada ajit singh nagar', 'tarn taran': 'tarn taran',
  bengaluru: 'bangalore', 'bengaluru urban': 'bangalore', mysuru: 'mysore', belagavi: 'belgaum', kalaburagi: 'gulbarga', 'kamrup metropolitan': 'kamrup metropolitan',
  'east khasi hills': 'east khasi hills', prayagraj: 'allahabad', ayodhya: 'faizabad',
}
const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/district/g, '').replace(/[^a-z -]/g, '').replace(/\s+/g, ' ').trim()

/** Which map districts does an order's list of names cover? "Statewide" covers every district of the state. */
export function districtIndexes(g: Geo, stateCode: string, names: string[]): number[] {
  const inState = g.districts.map((d, i) => [d, i] as const).filter(([d]) => d.code === stateCode)
  if (!names.length || names.some((n) => /statewide|entire|all districts|whole state/i.test(n))) return inState.map(([, i]) => i)
  const out = new Set<number>()
  for (const raw of names) {
    const n = norm(raw)
    const want = ALIAS[n] ?? n
    let hit = inState.find(([d]) => norm(d.name) === want)
    hit ??= inState.find(([d]) => norm(d.name).startsWith(want) || want.startsWith(norm(d.name)))
    hit ??= g.districts.map((d, i) => [d, i] as const).find(([d]) => norm(d.name) === want)
    if (hit) out.add(hit[1])
  }
  return [...out]
}

export function districtsOf(g: Geo, stateCode: string): District[] {
  return g.districts.filter((d) => d.code === stateCode).sort((a, b) => a.name.localeCompare(b.name))
}
