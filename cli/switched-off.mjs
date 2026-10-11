#!/usr/bin/env node
// Read India's shutdown register straight from Arkiv. No dependencies, no Switched Off server.
//   node cli/switched-off.mjs active            orders in force now
//   node cli/switched-off.mjs state MN          every order on file for a state
//   node cli/switched-off.mjs reports [MN]      live citizen reports
//   node cli/switched-off.mjs at <block> [drill] orders in force at a past block
// Set ARKIV_KEY to use your own Arkiv access key (otherwise the anonymous budget applies).
// any Arkiv endpoint works: ARKIV_RPC=https://your-node.example node cli/switched-off.mjs active
const RPC = process.env.ARKIV_RPC || 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const [cmd = 'active', arg] = process.argv.slice(2)

async function query(q, extra = {}) {
  const out = []
  let cursor
  do {
    const r = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.ARKIV_KEY ? { 'x-api-key': process.env.ARKIV_KEY } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'arkiv_query', params: [q, { select: { key: true, attributes: true, payload: true, expiresAt: true }, limit: '0xc8', ...extra, ...(cursor ? { cursor } : {}) }] }),
    })
    const j = await r.json()
    if (j.error || !j.result) throw new Error(j.error?.message ?? j.message ?? 'Arkiv returned no result')
    out.push(...j.result.data)
    cursor = j.result.cursor
  } while (cursor)
  return out
}
const attrs = (e) => Object.fromEntries(e.attributes.map((a) => [a.name, a.value]))
const payload = (e) => { try { return JSON.parse(Buffer.from(e.payload.slice(2), 'hex').toString('utf8')) } catch { return {} } }
const day = (s) => (Number(s) ? new Date(Number(s) * 1000).toISOString().slice(0, 10) : 'not stated')
const base = (type) => `app = str('switched-off') AND type = str('${type}') AND net = str('live')`

function printOrders(list) {
  list.sort((a, b) => Number(attrs(b).starts) - Number(attrs(a).starts))
  for (const e of list) {
    const a = attrs(e), p = payload(e)
    console.log(`${day(a.starts)} → ${day(a.ends)}  ${String(p.stateName ?? a.state).padEnd(18)} ${String(a.scope).padEnd(13)} ${(p.districts ?? []).join(', ')}`)
  }
  console.log(`\n${list.length} order${list.length === 1 ? '' : 's'}`)
}

try {
  if (cmd === 'active') printOrders(await query(base('order')))
  else if (cmd === 'state') printOrders(await query(`${base('record')} AND state = str('${String(arg ?? '').toUpperCase()}')`))
  else if (cmd === 'at') printOrders(await query(base('order').replace("str('live')", `str('${process.argv[4] === 'drill' ? 'drill' : 'live'}')`), { atBlock: '0x' + BigInt(arg).toString(16) }))
  else if (cmd === 'reports') {
    const list = await query(base('report') + (arg ? ` AND state = str('${arg.toUpperCase()}')` : ''))
    for (const e of list) { const a = attrs(e); console.log(`${a.status.padEnd(5)} ${String(a.district).padEnd(22)} ${a.state}  ${a.carrier}`) }
    console.log(`\n${list.length} live report${list.length === 1 ? '' : 's'}`)
  } else console.log('Commands: active | state <CODE> | reports [CODE] | at <block>')
} catch (e) {
  console.error('Arkiv said:', e.message)
  process.exit(1)
}
