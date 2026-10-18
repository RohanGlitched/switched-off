// The documents the register hands its users: a citation, a curl, the register as CSV and JSON, and a
// Right to Information request. These pin their words, and that a hostile record can't turn a
// download into a spreadsheet formula.
import { describe, expect, it } from 'vitest'
import { RPC, SEALED, toRecord } from '../src/lib/arkiv'
import { CSV_COLUMNS, LEGAL, RTI_PORTALS, rtiPortal, citationText, csvCell, curlForKey, curlForQuery, exportHeader, homeDepartment, isOrderSource, orderOnFile, permalink, registerCsv, registerJson, rtiFileName, rtiLetter, type ExportMeta } from '../src/lib/cite'
import { MALLORY, REGISTRAR, key, raw, s, u } from './helpers'

const K = key(0xabc)
/** RFC 4180, one line: quoted cells may hold commas and doubled quotes. */
const parseRow = (line: string) => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map((m) => (m[1].startsWith('"') ? m[1].slice(1, -1).replace(/""/g, '"') : m[1]))
const record = (over: { payload?: Record<string, unknown>; creator?: `0x${string}`; owner?: `0x${string}`; attrs?: Record<string, unknown> } = {}) =>
  toRecord(
    raw({
      key: K,
      creator: over.creator ?? REGISTRAR,
      owner: over.owner ?? SEALED,
      createdAt: 444_932n,
      expiresAt: 31_980_932n,
      attributes: { app: s('switched-off'), type: s('record'), net: s('live'), order_id: s('Home-03(TSTS) of 2020'), state: s('JK'), scope: s('mobile-data'), issued: u(1_578_960_000n), starts: u(1_578_960_000n), ends: u(1_579_564_800n), basis: s('tsr-2017'), ...over.attrs },
      payload: {
        authority: 'Home Department, Government of Jammu and Kashmir',
        stateName: 'Jammu and Kashmir',
        districts: ['Srinagar', 'Budgam'],
        reason: 'Public safety',
        published: true,
        basis: 'Temporary Suspension of Telecom Services Rules, 2017',
        sources: [{ title: 'Govt Order No. Home-03(TSTS) of 2020 dated 14.01.2020', url: 'https://home.jk.gov.in/pdf/03(TSTS)%202020.pdf' }],
        ...over.payload,
      },
    }),
  )

describe('citation', () => {
  const c = citationText(record())
  it('names the place, authority, order, dates and basis', () => {
    expect(c).toContain('Internet suspension order: Jammu and Kashmir, Srinagar, Budgam.')
    expect(c).toContain('Issuing authority: Home Department, Government of Jammu and Kashmir.')
    expect(c).toContain('Order: Home-03(TSTS) of 2020.')
    expect(c).toContain('In force: 14 Jan 2020 to 21 Jan 2020; issued 14 Jan 2020.')
    expect(c).toContain('Legal basis: Temporary Suspension of Telecom Services Rules, 2017.')
    expect(c).toContain('Order text: published.')
  })
  it('says where it lives on Arkiv, and links it', () => {
    expect(c).toContain(`Switched Off register, Arkiv Tiramisu entity ${K}, created at block 444932, sealed.`)
    expect(c).toContain(permalink(K))
    expect(permalink(K)).toBe(`https://switched-off.vercel.app/e/${K}`)
    expect(c).toContain('- Govt Order No. Home-03(TSTS) of 2020 dated 14.01.2020 https://home.jk.gov.in/pdf/03(TSTS)%202020.pdf')
  })
  it('a community filing that is not sealed says so', () => {
    const x = citationText(record({ creator: MALLORY, owner: MALLORY }))
    expect(x).toContain('not sealed.')
    expect(x).toContain('Filed by a community transcriber')
  })
  it('an open-ended order says its end is not stated', () => {
    expect(citationText(record({ attrs: { ends: u(0n) } }))).toContain('In force: from 14 Jan 2020, end not stated;')
  })
  it('goes through the translator it is given', () => {
    const x = citationText(record(), { t: (s) => (s === 'Order: {id}.' ? 'आदेश: {id}।' : s), lang: 'hi' })
    expect(x).toContain('आदेश: Home-03(TSTS) of 2020।')
  })
})

describe('curl', () => {
  it('asks Arkiv for exactly this key', () => {
    const c = curlForKey(K)
    expect(c.startsWith(`curl -s -X POST ${RPC} `)).toBe(true)
    expect(c).toContain(`"method":"arkiv_query","params":["$key = key(${K})"`)
    expect(c).not.toContain('\n')
    // the JSON inside the single quotes parses
    expect(JSON.parse(/-d '(.+)'$/.exec(c)![1]).params[0]).toBe(`$key = key(${K})`)
  })
  it('refuses anything that is not a key (nothing to inject into a shell line)', () => {
    expect(() => curlForKey("0x1' ; rm -rf ~ ; '")).toThrow()
  })
  it('a query with quotes stays one valid shell word', () => {
    const c = curlForQuery("app = str('switched-off') AND state = str('MN')")
    expect(c).toContain(`str('\\''switched-off'\\'')`)
  })
})

describe('is the order itself on file', () => {
  it('a government PDF is the order; a news story, a tracker or a judgment is not', () => {
    expect(isOrderSource({ title: 'Manipur Home Dept order', url: 'https://manipur.gov.in/wp-content/uploads/2023/11/1-10-2023.pdf' })).toBe(true)
    expect(isOrderSource({ title: 'News On AIR: Internet suspended', url: 'https://www.newsonair.gov.in/internet-suspended' })).toBe(false)
    expect(isOrderSource({ title: 'MediaNama: shutdown', url: 'https://www.medianama.com/2023/03/x/' })).toBe(false)
    expect(isOrderSource({ title: 'Supreme Court judgment', url: 'https://indiankanoon.org/doc/82461587/' })).toBe(false)
    expect(isOrderSource({ title: 'x', url: 'not a url' })).toBe(false)
  })
  it('marked unpublished means not on file, whatever the sources', () => {
    expect(orderOnFile({ published: false, sources: [{ title: 'Govt Order', url: 'https://home.jk.gov.in/a.pdf' }] })).toBe(false)
    expect(orderOnFile({ published: true, sources: [] })).toBe(true)
    expect(orderOnFile({ published: null, sources: [{ title: 'Scroll', url: 'https://scroll.in/x' }] })).toBe(false)
    expect(orderOnFile({ published: null, sources: [{ title: 'Govt Order', url: 'https://home.jk.gov.in/a.pdf' }] })).toBe(true)
  })
})

describe('Right to Information request', () => {
  const base = { state: 'MN', stateName: 'Manipur', districts: ['Imphal West'], from: 1_696_118_400, to: 1_697_241_600, today: 1_792_281_600 }
  const en = rtiLetter({ ...base, lang: 'en', dark: true })
  it('goes to the Home Department’s information officer, under Section 6(1)', () => {
    expect(en.startsWith('To\nThe Public Information Officer\nHome Department, Government of Manipur\n[Office address]')).toBe(true)
    expect(en).toContain('Subject: Application under Section 6(1) of the Right to Information Act, 2005')
  })
  it('asks for the orders, their publication and the review committee’s record, for the place and dates', () => {
    expect(en).toContain('Imphal West, Manipur, at any time between 1 Oct 2023 and 14 Oct 2023')
    expect(en).toContain('the date on which and the manner in which it was published')
    expect(en).toContain('the findings the review committee recorded on it')
    expect(en).toContain('within five days of the order')
    expect(en).not.toContain('working days')
    expect(en).toContain('5. If no order suspended these services')
  })
  it('states the fee, the BPL exemption and the thirty days', () => {
    expect(en).toContain('Rs 10')
    expect(en).toContain('Section 7(5)')
    expect(en).toContain('within thirty days')
    expect(en).toContain('Section 7(1)')
  })
  it('leaves the applicant’s name and address for them to fill in, offline', () => {
    expect(en).toContain('[Your name]\n[Your postal address]')
    expect(en).not.toMatch(/0x[0-9a-f]{40}/i)
  })
  it('a known order without a dark report: no "say so if none" line, and its number when it has a real one', () => {
    const x = rtiLetter({ ...base, lang: 'en', orderId: 'Home-03(TSTS) of 2020' })
    expect(x).not.toContain('5. If no order')
    expect(x).toContain('This includes order no. Home-03(TSTS) of 2020.')
    expect(rtiLetter({ ...base, lang: 'en', orderId: 'mn-2023-10-01' })).not.toContain('order no.')
  })
  it('a statewide order asks about the whole state; a territory goes to its administration', () => {
    expect(rtiLetter({ ...base, lang: 'en', districts: ['Statewide'] })).toContain('any part of the State of Manipur,')
    expect(homeDepartment('LA', 'Ladakh', 'en')).toBe('Home Department, Administration of the Union Territory of Ladakh')
    expect(homeDepartment('DL', 'Delhi', 'en')).toContain('National Capital Territory of Delhi')
  })
  it('in Hindi, the same request', () => {
    const hi = rtiLetter({ ...base, stateName: 'मणिपुर', lang: 'hi', dark: true })
    expect(hi.startsWith('सेवा में,\nलोक सूचना अधिकारी\nगृह विभाग, मणिपुर सरकार')).toBe(true)
    expect(hi).toContain('धारा 6(1)')
    expect(hi).toContain('₹10')
    expect(hi).toContain('धारा 7(5)')
    expect(hi).toContain('तीस दिनों')
    expect(hi).toContain('[आपका नाम]')
    expect(hi).not.toContain('Sir or Madam')
  })
  it('cites the Rules on publication and on an officer’s emergency order', () => {
    expect(en).toContain('Rule 3(2) of the Telecommunications (Temporary Suspension of Services) Rules, 2024 requires every suspension order to be published.')
    expect(en).toContain('first proviso to rule 3(1)')
  })
  it('only lists state RTI portals that were checked, all on government domains', () => {
    expect(rtiPortal('AS')?.url).toBe('https://rtionline.assam.gov.in/')
    expect(rtiPortal('MN')).toBeNull()
    expect(rtiPortal('PB')).toBeNull()
    for (const p of Object.values(RTI_PORTALS)) expect(new URL(p.url).hostname).toMatch(/\.gov\.in$/)
    for (const n of LEGAL.notes) expect(n.url).toMatch(/^https:\/\//)
  })
  it('names the file after the place and language', () => {
    expect(rtiFileName({ state: 'MN', districts: ['Imphal West'], lang: 'hi' })).toBe('rti-request-MN-imphal-west-hi.txt')
    expect(rtiFileName({ state: 'JK', districts: ['Statewide'], lang: 'en' })).toBe('rti-request-JK-statewide-en.txt')
  })
})

describe('the register as a file', () => {
  const meta: ExportMeta = { query: "app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('JK')", block: 725_726n, readAt: Date.UTC(2026, 9, 18, 6), filters: ['scope = mobile-data', 'search: srinagar, budgam'], from: 'arkiv' }
  it('opens with the query and the block, in one cell', () => {
    const h = exportHeader(meta, 1)
    expect(h).toBe("# Switched Off register: 1 records read from Arkiv Tiramisu testnet (https://rpc.tiramisu.db-chain.testnet.arkiv.network) at block 725726 on 2026-10-18T06:00:00.000Z; query: app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('JK'); then filtered in the browser: scope = mobile-data; search: srinagar budgam")
    expect(h).not.toContain(',')
  })
  it('one row per record with key, creator, owner, expiry and sources', () => {
    const csv = registerCsv([record()], meta)
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe(CSV_COLUMNS.join(','))
    const cells = parseRow(lines[2])
    expect(cells).toHaveLength(CSV_COLUMNS.length)
    const at = (c: (typeof CSV_COLUMNS)[number]) => cells[CSV_COLUMNS.indexOf(c)]
    expect(at('entity_key')).toBe(K)
    expect(at('creator')).toBe(REGISTRAR)
    expect(at('owner')).toBe(SEALED)
    expect(at('expires_at_block')).toBe('31980932')
    expect(at('created_at_block')).toBe('444932')
    expect(at('starts')).toBe('2020-01-14')
    expect(lines[2]).toContain('https://home.jk.gov.in/pdf/03(TSTS)%202020.pdf')
  })
  it('a hostile record cannot smuggle a formula or break the columns', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`)
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('a, b\nc')).toBe('"a, b\nc"')
    const csv = registerCsv([record({ payload: { reason: '=cmd|"/c calc"!A1', authority: 'a,"b"' } })], meta)
    expect(csv).toContain(`"'=cmd|""/c calc""!A1"`)
  })
  it('JSON carries the same, with blocks as strings', () => {
    const j = JSON.parse(registerJson([record()], meta))
    expect(j).toMatchObject({ block: '725726', query: meta.query, count: 1, rpc: RPC })
    expect(j.records[0]).toMatchObject({ key: K, creator: REGISTRAR, owner: SEALED, expiresAtBlock: '31980932', createdAtBlock: '444932', permalink: permalink(K) })
    expect(j.records[0].sources[0].url).toBe('https://home.jk.gov.in/pdf/03(TSTS)%202020.pdf')
  })
})
