// The documents the register's users need, built from what Arkiv returned: a citation for one order,
// a curl that re-reads it, the register as CSV or JSON, and a Right to Information request for an
// order nobody published. Pure functions (no network, no globals), so the tests can pin their words.
import { RPC, SEALED, type Order, type Record_ } from './arkiv'
import { BASIS_LABEL } from './basis'

export const SITE = 'https://switched-off.vercel.app'
export const permalink = (key: string) => `${SITE}/e/${key}`

/** A translator: the app passes i18n's `tr`; tests and the English defaults pass nothing. */
export type T = (s: string) => string
const id: T = (s) => s
const fill = (t: T, template: string, vars: Record<string, string | number>) => t(template).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))

export type Lang = 'en' | 'hi'
/** Citations and letters are written in English or Hindi; any other interface language gets English. */
export const letterLang = (l: string): Lang => (l === 'hi' ? 'hi' : 'en')
const IST = 'Asia/Kolkata'
/** "14 Jan 2020" in IST, or the Hindi form; empty for an unknown date. */
export const citeDate = (unix: number, lang: Lang = 'en') => (unix > 0 ? new Date(unix * 1000).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '')
/** "2020-01-14" in IST, for files and date inputs. */
export const isoDay = (unix: number) => (unix > 0 ? new Date(unix * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10) : '')

const SCOPE: Record<string, string> = { 'mobile-data': 'Mobile internet', broadband: 'Broadband', 'all-internet': 'All internet', 'voice-sms-too': 'Internet, calls and SMS', unknown: 'Internet' }
export const basisName = (o: Pick<Order, 'basis' | 'basisCode'>) => BASIS_LABEL[o.basis] ?? (o.basis && o.basis !== o.basisCode ? o.basis : BASIS_LABEL[o.basisCode] ?? (o.basis || BASIS_LABEL['not-stated']))

/** Hosts that publish news about orders, not the orders: a link there is not the order itself. */
const NOT_THE_ORDER = /(^|\.)(newsonair|pib|sci|main\.sci|indiankanoon|doj|ecourts|egazette)\.gov\.in$|(^|\.)indiankanoon\.org$/i
/** A source that is the order itself: a government page or PDF, or one titled as an order or notification. */
export function isOrderSource(s: { title: string; url: string }): boolean {
  let host = ''
  try {
    host = new URL(s.url).hostname
  } catch {
    return false
  }
  if (NOT_THE_ORDER.test(host)) return false
  return /\.(gov|nic)\.in$/i.test(host) || /\b(govt\.?|government) order\b|^order no\b|\bnotification\b/i.test(s.title)
}
/**
 * Whether the register holds the order's own text. False when the filer marked it unpublished, or
 * when it is not marked published and no source is the order itself (only news, trackers, courts).
 */
export function orderOnFile(o: Pick<Order, 'published' | 'sources'>): boolean {
  if (o.published === false) return false
  return o.published === true || o.sources.some(isOrderSource)
}

/** The register's own ids look like "mn-2023-05-03": not an order number anyone could look up. */
export const officialNumber = (id?: string) => (id && !/^[a-z]{2}-[a-z0-9-]+$/.test(id) ? id : '')
const place = (ds: string[], t: T) => (ds.length ? ds.map((d) => (/^statewide$/i.test(d) ? t('Statewide') : d)).join(', ') : t('districts not recorded'))

/**
 * A plain-text citation of one order as the register holds it, with the Arkiv coordinates that let
 * anyone check it: entity key, creation block and whether it is sealed.
 */
export function citationText(o: Order | Record_, opts: { t?: T; lang?: Lang } = {}): string {
  const t = opts.t ?? id
  const lang = opts.lang ?? 'en'
  const record = 'sealed' in o
  const sealed = record ? o.sealed : o.owner.toLowerCase() === SEALED.toLowerCase()
  const when = o.ends ? fill(t, '{from} to {to}', { from: citeDate(o.starts, lang), to: citeDate(o.ends, lang) }) : fill(t, 'from {from}, end not stated', { from: citeDate(o.starts, lang) })
  const lines = [
    fill(t, 'Internet suspension order: {state}, {districts}.', { state: t(o.stateName), districts: place(o.districts, t) }),
    fill(t, 'Issuing authority: {authority}.', { authority: o.authority || t('not recorded') }),
    o.orderId ? fill(t, officialNumber(o.orderId) ? 'Order: {id}.' : 'Register entry: {id} (the order’s own number is not recorded).', { id: o.orderId }) : '',
    fill(t, 'In force: {when}; issued {issued}.', { when, issued: citeDate(o.issued, lang) || t('date not recorded') }),
    fill(t, 'What was cut: {scope}.', { scope: t(SCOPE[o.scope] ?? SCOPE.unknown) }),
    basisName(o) === BASIS_LABEL['not-stated'] ? t('Legal basis: not stated.') : fill(t, 'Legal basis: {basis}.', { basis: t(basisName(o)) }),
    t(o.published === true ? 'Order text: published.' : o.published === false ? 'Order text: not published.' : 'Order text: whether it was published is not known.'),
    o.net === 'drill' ? t('This is a drill entity, not the live register.') : '',
    fill(t, sealed ? 'Switched Off register, Arkiv Tiramisu entity {key}, created at block {block}, sealed.' : 'Switched Off register, Arkiv Tiramisu entity {key}, created at block {block}, not sealed.', { key: o.key, block: o.createdAt > 0n ? o.createdAt.toString() : '?' }),
    fill(t, o.official ? 'Filed by the Switched Off registrar ({creator}).' : 'Filed by a community transcriber ({creator}), not the registrar.', { creator: o.creator }),
    permalink(o.key),
    o.sources.length ? `${t('Sources:')}\n${o.sources.map((s) => `- ${s.title}${s.url && s.url !== s.title ? ` ${s.url}` : ''}`).join('\n')}` : t('Sources: none recorded.'),
  ]
  return lines.filter(Boolean).join('\n')
}

const SELECT = '{"key":true,"attributes":true,"payload":true,"owner":true,"creator":true,"createdAt":true,"expiresAt":true}'
/** One line that asks Arkiv itself for this entity, with no Switched Off server in between. */
export function curlForKey(key: string): string {
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('not an entity key')
  return `curl -s -X POST ${RPC} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["$key = key(${key})",{"select":${SELECT}}]}'`
}
/** The same for a whole query (the register view's), in the same one-line form. */
export function curlForQuery(query: string): string {
  // the query sits inside a JSON string inside single quotes: escape for both
  const q = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/'/g, `'\\''`)
  return `curl -s -X POST ${RPC} -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["${q}",{"select":${SELECT}}]}'`
}

// ─── the register as a file ─────────────────────────────────────────────────

export type ExportMeta = {
  /** the query text sent to Arkiv (as printed under the register) */
  query: string
  /** the block the records were read at */
  block: bigint
  /** when they were read (ms; 0 when not known, as for the bundled snapshot) */
  readAt: number
  /** what the browser then filtered, in words ("scope = mobile-data; search: imphal") */
  filters: string[]
  /** where the read came from: Arkiv now, or the bundled snapshot */
  from: 'arkiv' | 'snapshot'
}

export const CSV_COLUMNS = [
  'entity_key', 'order_id', 'state', 'state_name', 'districts', 'scope', 'issuing_authority', 'legal_basis', 'basis_code', 'issued', 'starts', 'ends',
  'order_text_published', 'order_text_on_file', 'reason', 'renews', 'seq', 'filed_by', 'creator', 'owner', 'sealed', 'created_at_block', 'expires_at_block',
  'permalink', 'source_urls', 'source_titles',
] as const

/**
 * One CSV cell. Quoted when it holds a comma, quote or line break; and a cell that a spreadsheet
 * would run as a formula (=, +, -, @, tab, CR) gets a leading apostrophe: anyone can file a record.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const flat = (s: string) => s.replace(/[\r\n,]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The header line: what was asked of Arkiv, at which block. No commas, so it stays one cell. */
export function exportHeader(m: ExportMeta, count: number): string {
  const src = m.from === 'snapshot' ? 'the bundled snapshot of Arkiv' : 'Arkiv Tiramisu testnet'
  return flat(`# Switched Off register: ${count} records read from ${src} (${RPC}) at block ${m.block}${m.readAt > 0 ? ` on ${new Date(m.readAt).toISOString()}` : ''}; query: ${m.query}${m.filters.length ? `; then filtered in the browser: ${m.filters.join('; ')}` : ''}`)
}

const row = (r: Record_) => [
  r.key, r.orderId, r.state, r.stateName, r.districts.join('; '), r.scope, r.authority, basisName(r), r.basisCode, isoDay(r.issued), isoDay(r.starts), isoDay(r.ends),
  r.published == null ? 'unknown' : r.published ? 'yes' : 'no', orderOnFile(r) ? 'yes' : 'no', r.reason, r.renews ?? '', r.seq, r.official ? 'registrar' : 'community', r.creator, r.owner,
  r.sealed ? 'yes' : 'no', r.createdAt.toString(), r.expiresAt.toString(), permalink(r.key), r.sources.map((s) => s.url).filter(Boolean).join(' | '), r.sources.map((s) => s.title).join(' | '),
]

export function registerCsv(rs: Record_[], m: ExportMeta): string {
  const lines = [exportHeader(m, rs.length), CSV_COLUMNS.join(','), ...rs.map((r) => row(r).map(csvCell).join(','))]
  // a byte-order mark so spreadsheet programs read it as UTF-8
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function registerJson(rs: Record_[], m: ExportMeta): string {
  return JSON.stringify(
    {
      register: 'Switched Off',
      network: 'Arkiv Tiramisu testnet',
      rpc: RPC,
      from: m.from,
      query: m.query,
      block: m.block.toString(),
      readAt: m.readAt > 0 ? new Date(m.readAt).toISOString() : null,
      filteredInBrowser: m.filters,
      count: rs.length,
      records: rs.map((r) => ({
        key: r.key,
        permalink: permalink(r.key),
        orderId: r.orderId,
        state: r.state,
        stateName: r.stateName,
        districts: r.districts,
        scope: r.scope,
        authority: r.authority,
        legalBasis: basisName(r),
        basisCode: r.basisCode,
        issued: isoDay(r.issued),
        starts: isoDay(r.starts),
        ends: isoDay(r.ends) || null,
        published: r.published,
        orderTextOnFile: orderOnFile(r),
        reason: r.reason,
        notes: r.notes,
        renews: r.renews,
        seq: r.seq,
        filedBy: r.official ? 'registrar' : 'community',
        creator: r.creator,
        owner: r.owner,
        sealed: r.sealed,
        createdAtBlock: r.createdAt.toString(),
        expiresAtBlock: r.expiresAt.toString(),
        sources: r.sources,
      })),
    },
    null,
    2,
  )
}

/** "switched-off-register-MN-block-725726.csv" */
export const exportName = (ext: 'csv' | 'json', m: Pick<ExportMeta, 'block'>, state?: string) => `switched-off-register${state ? `-${state}` : ''}-block-${m.block}.${ext}`

// ─── Right to Information: ask for an order nobody published ─────────────────

/**
 * The law the letter relies on, each point with where it was checked. The page shows these under
 * "Where this comes from"; the letter only states what these say.
 */
const RULES_2024 = 'https://eservices.dot.gov.in/sites/default/files/circular-notifications/temporary-suspension-of-services-rules-2024.pdf'
const RTI_ACT = 'https://cic.gov.in/sites/default/files/RTI-Act_English.pdf'
export const LEGAL = {
  centralPortal: { url: 'https://rtionline.gov.in/', label: 'rtionline.gov.in' },
  // checked against the texts on 18 Oct 2026
  notes: [
    {
      text: 'Only the Union Home Secretary, or the State’s Secretary in charge of the Home Department, may order a suspension, in writing and with reasons. In unavoidable circumstances an officer of at least Joint Secretary rank in the Union government, authorised by them, may; that order lapses unless confirmed within 24 hours (rules 2 and 3).',
      source: 'Telecommunications (Temporary Suspension of Services) Rules, 2024, G.S.R. 724(E), Gazette of India, 22 Nov 2024',
      url: RULES_2024,
    },
    {
      text: 'Every suspension order “shall be published”, must name its reasons, area and services, and may run at most 15 days (rule 3(2)). It goes to a review committee within 24 hours (rule 3(3)); the committee meets within five days and records whether the order is lawful, and may set it aside (rule 5).',
      source: 'Rules, 2024',
      url: RULES_2024,
    },
    {
      text: 'In Anuradha Bhasin v. Union of India (2020) the Supreme Court directed the authorities to publish all suspension orders in force and every future one.',
      source: 'Judgment of 10 Jan 2020, (2020) 3 SCC 637, para 152',
      url: 'https://indiankanoon.org/doc/82461587/',
    },
    {
      text: 'Anyone can ask in writing or electronically, in English, Hindi or the official language of the area (section 6(1)), without giving a reason (section 6(2)). An office that doesn’t hold the information must pass the request on within five days (section 6(3)).',
      source: 'Right to Information Act, 2005',
      url: RTI_ACT,
    },
    {
      text: 'The reply is due within 30 days. The 48-hour limit applies only where the information concerns the life or liberty of a person (section 7(1)); a late reply must be free of charge (section 7(6)).',
      source: 'Right to Information Act, 2005',
      url: RTI_ACT,
    },
    {
      text: 'The fee is Rs 10 for Union government offices; each state sets its own in its RTI rules, so check before paying. People below the poverty line pay no fee (proviso to section 7(5)).',
      source: 'RTI Rules, 2012, G.S.R. 603(E), rules 3 and 5',
      url: 'https://niti.gov.in/sites/default/files/2025-07/RTI%20Rules%20Final%20PDF.pdf',
    },
    {
      text: 'In 2023 the Supreme Court directed every state and union territory to run an online RTI portal. Not all of them do yet; the portals listed here were opened and checked.',
      source: 'Pravasi Legal Cell v. Union of India, order of 20 Mar 2023',
      url: 'https://api.sci.gov.in/supremecourt/2019/18483/18483_2019_1_21_42868_Order_20-Mar-2023.pdf',
    },
  ] as { text: string; source: string; url: string }[],
}

/**
 * State RTI portals, each one opened on 18 Oct 2026 and identified by its own text as that
 * government's portal for filing requests. Left out: states with no portal found, and portals that
 * were down for maintenance, not yet launched, or had filing switched off (Punjab, Tamil Nadu, Bihar,
 * Chhattisgarh, Mizoram, West Bengal, Gujarat). rtionline.gov.in refuses requests for state authorities.
 */
export const RTI_PORTALS: Record<string, { url: string; label: string }> = {
  AP: { url: 'https://rtionline.ap.gov.in/', label: 'rtionline.ap.gov.in' },
  AR: { url: 'https://rti.arunachal.gov.in/', label: 'rti.arunachal.gov.in' },
  AS: { url: 'https://rtionline.assam.gov.in/', label: 'rtionline.assam.gov.in' },
  DL: { url: 'https://rtionline.delhi.gov.in/', label: 'rtionline.delhi.gov.in' },
  GA: { url: 'https://rtionline.goa.gov.in/', label: 'rtionline.goa.gov.in' },
  HP: { url: 'https://onlinerti.hp.gov.in/', label: 'onlinerti.hp.gov.in' },
  HR: { url: 'https://rtiharyana.gov.in/', label: 'rtiharyana.gov.in' },
  JH: { url: 'https://rti.jharkhand.gov.in/', label: 'rti.jharkhand.gov.in' },
  JK: { url: 'https://rtionline.jk.gov.in/', label: 'rtionline.jk.gov.in' },
  KA: { url: 'https://rtionline.karnataka.gov.in/', label: 'rtionline.karnataka.gov.in' },
  KL: { url: 'https://rtionline.kerala.gov.in/', label: 'rtionline.kerala.gov.in' },
  LA: { url: 'https://rtionline.ladakh.gov.in/', label: 'rtionline.ladakh.gov.in' },
  MH: { url: 'https://rtionline.maharashtra.gov.in/', label: 'rtionline.maharashtra.gov.in' },
  ML: { url: 'https://megrti.gov.in/', label: 'megrti.gov.in' },
  MP: { url: 'https://rti.mp.gov.in/', label: 'rti.mp.gov.in' },
  OD: { url: 'https://rtiodisha.gov.in/', label: 'rtiodisha.gov.in' },
  RJ: { url: 'https://rti.rajasthan.gov.in/', label: 'rti.rajasthan.gov.in' },
  SK: { url: 'https://rtionline.sikkim.gov.in/', label: 'rtionline.sikkim.gov.in' },
  TR: { url: 'https://rtionline.tripura.gov.in/', label: 'rtionline.tripura.gov.in' },
  TS: { url: 'https://rti.telangana.gov.in/', label: 'rti.telangana.gov.in' },
  UK: { url: 'https://rtionline.uk.gov.in/', label: 'rtionline.uk.gov.in' },
  UP: { url: 'https://rtionline.up.gov.in/', label: 'rtionline.up.gov.in' },
}
export const rtiPortal = (state: string) => RTI_PORTALS[state] ?? null

const UT_ADMIN = new Set(['AN', 'CH', 'DH', 'LA', 'LD'])
/** Who holds the order: the Home Department of the state (or of the territory's government or administration). */
export function homeDepartment(state: string, name: string, lang: Lang): string {
  if (lang === 'hi') {
    if (state === 'DL') return 'गृह विभाग, राष्ट्रीय राजधानी क्षेत्र दिल्ली सरकार'
    if (UT_ADMIN.has(state)) return `गृह विभाग, ${name} केंद्र शासित प्रदेश प्रशासन`
    return `गृह विभाग, ${name} सरकार`
  }
  if (state === 'DL') return 'Home Department, Government of the National Capital Territory of Delhi'
  if (UT_ADMIN.has(state)) return `Home Department, Administration of the Union Territory of ${name}`
  return `Home Department, Government of ${name}`
}

export type RtiInput = {
  lang: Lang
  /** state code, as on the register */
  state: string
  /** the state's name in the letter's language */
  stateName: string
  districts: string[]
  /** the period asked about, unix seconds (0 = not known) */
  from: number
  to: number
  /** the order the register knows about, if any */
  orderId?: string
  authority?: string
  /** a district reported dark with no order on the register, rather than a known order */
  dark?: boolean
  /** the letter's date, unix seconds */
  today: number
}

const isStatewide = (ds: string[]) => !ds.length || ds.some((d) => /^statewide$/i.test(d))
const squeeze = (lines: string[]) => lines.filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n')

/** The request, in English or Hindi. Square brackets mark what the applicant fills in. */
export function rtiLetter(x: RtiInput): string {
  const hi = x.lang === 'hi'
  const statewide = isStatewide(x.districts)
  const from = citeDate(x.from, x.lang) || (hi ? '[तारीख़]' : '[date]')
  const to = citeDate(x.to, x.lang) || (hi ? '[तारीख़]' : '[date]')
  const dept = homeDepartment(x.state, x.stateName, x.lang)
  const known = officialNumber(x.orderId)
  if (hi) {
    const area = statewide ? `${x.stateName} राज्य` : `${x.districts.join(', ')}, ${x.stateName}`
    return squeeze([
      'सेवा में,',
      'लोक सूचना अधिकारी',
      dept,
      '[कार्यालय का पता]',
      '',
      `दिनांक: ${citeDate(x.today, 'hi')}`,
      '',
      `विषय: सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत आवेदन: ${area} में इंटरनेट सेवाएँ निलंबित करने वाले आदेश`,
      '',
      'महोदय/महोदया,',
      '',
      'सूचना का अधिकार अधिनियम, 2005 की धारा 6(1) के अंतर्गत मैं निम्नलिखित सूचना का अनुरोध करता/करती हूँ:',
      '',
      `1. हर उस आदेश की प्रति जिसने ${from} से ${to} के बीच किसी भी समय ${area} के पूरे या किसी हिस्से में इंटरनेट या अन्य दूरसंचार सेवाएँ (मोबाइल डेटा, ब्रॉडबैंड, या दोनों) निलंबित कीं, और हर उस आदेश की प्रति जिसने ऐसे किसी आदेश की अवधि बढ़ाई, उसे बदला या वापस लिया।${known ? ` इसमें आदेश सं. ${known} भी शामिल है।` : ''}${x.authority ? ` सार्वजनिक रूप से उपलब्ध जानकारी के अनुसार इस अवधि का एक आदेश इस प्राधिकारी ने जारी किया: ${x.authority}।` : ''}`,
      '2. हर ऐसे आदेश के लिए: उसे जारी करने वाला प्राधिकारी, वह क़ानूनी प्रावधान जिसके तहत वह जारी हुआ, और वह तारीख़ और तरीक़ा जिससे उसे प्रकाशित किया गया (जैसे राजपत्र में या किसी सरकारी वेबसाइट पर), प्रकाशन की प्रति या लिंक सहित। (दूरसंचार (सेवाओं का अस्थायी निलंबन) नियम, 2024 के नियम 3(2) के अनुसार हर निलंबन आदेश प्रकाशित किया जाएगा।) यदि कोई आदेश प्रकाशित नहीं किया गया, तो कृपया यह बताएँ।',
      '3. हर ऐसे आदेश के लिए: वह तारीख़ जब उसकी प्रति पुनर्विलोकन समिति को भेजी गई (नियम 3(3)), और पुनर्विलोकन समिति द्वारा उस आदेश पर अभिलिखित निष्कर्षों और उसकी बैठक के कार्यवृत्त की प्रति, बैठक की तारीख़ सहित (नियम 5(3) के अनुसार समिति आदेश जारी होने के पाँच दिन के भीतर बैठक करती है)।',
      '4. यदि कोई आदेश नियम 3(1) के पहले परंतुक के तहत किसी प्राधिकृत अधिकारी ने जारी किया: सक्षम प्राधिकारी द्वारा उसकी पुष्टि की प्रति, तारीख़ और समय सहित।',
      x.dark ? `5. यदि इस अवधि में ${area} में ये सेवाएँ किसी आदेश से निलंबित नहीं की गईं, तो कृपया यह लिखित में बताएँ।` : '',
      '',
      'यदि इनमें से कोई सूचना किसी अन्य लोक प्राधिकारी के पास है, तो कृपया अधिनियम की धारा 6(3) के तहत यह आवेदन उसे अंतरित करें और मुझे सूचित करें।',
      '',
      'मैं भारत का/की नागरिक हूँ। आवेदन शुल्क ₹10 [या राज्य के RTI नियमों में तय राशि] [भारतीय पोस्टल ऑर्डर / डिमांड ड्राफ़्ट / कोर्ट-फ़ीस स्टाम्प / ऑनलाइन भुगतान, सं. ____] द्वारा जमा है। [या: मैं गरीबी रेखा से नीचे (BPL) के परिवार से हूँ, इसलिए धारा 7(5) के तहत शुल्क से मुक्त हूँ; BPL प्रमाण की प्रति संलग्न है।]',
      '',
      'कृपया धारा 7(1) के अनुसार आवेदन मिलने के तीस दिनों के भीतर सूचना [डाक से प्रतियाँ / ईमेल से इलेक्ट्रॉनिक प्रतियाँ] के रूप में दें।',
      '',
      'भवदीय/भवदीया,',
      '',
      '[आपका नाम]',
      '[आपका डाक पता]',
      '[ईमेल (वैकल्पिक)]',
    ])
  }
  const area = statewide ? `the State of ${x.stateName}` : `${x.districts.join(', ')}, ${x.stateName}`
  return squeeze([
    'To',
    'The Public Information Officer',
    dept,
    '[Office address]',
    '',
    `Date: ${citeDate(x.today, 'en')}`,
    '',
    `Subject: Application under Section 6(1) of the Right to Information Act, 2005, for the orders suspending internet services in ${area}`,
    '',
    'Sir or Madam,',
    '',
    'Under Section 6(1) of the Right to Information Act, 2005, I request the following information:',
    '',
    `1. A copy of every order that suspended internet or other telecommunication services (mobile data, broadband, or both) in all or any part of ${area}, at any time between ${from} and ${to}, and of every order that extended, modified or withdrew such an order.${known ? ` This includes order no. ${known}.` : ''}${x.authority ? ` Public reports attribute an order in this period to: ${x.authority}.` : ''}`,
    '2. For each such order: the authority that issued it, the provision of law under which it was issued, and the date on which and the manner in which it was published (for example in the Official Gazette or on a government website), with a copy of or link to the publication. (Rule 3(2) of the Telecommunications (Temporary Suspension of Services) Rules, 2024 requires every suspension order to be published.) If an order was not published, please say so.',
    '3. For each such order: the date on which a copy of it was forwarded to the review committee (rule 3(3)), and a copy of the findings the review committee recorded on it, with the minutes and date of its meeting (rule 5(3) requires the committee to meet within five days of the order).',
    '4. If any order was issued by an officer authorised under the first proviso to rule 3(1): a copy of its confirmation by the competent authority, with the date and time.',
    x.dark ? `5. If no order suspended these services in ${area}, during this period, please say so in writing.` : '',
    '',
    'If any of this information is held by another public authority, please transfer this application to it under Section 6(3) of the Act and inform me.',
    '',
    'I am a citizen of India. I have paid the application fee of Rs 10 [or the amount the State’s RTI rules prescribe] by [Indian Postal Order / demand draft / court-fee stamp / online payment, no. ____]. [Or: I belong to a family below the poverty line and am exempt from the fee under Section 7(5); a copy of my BPL certificate is enclosed.]',
    '',
    'Please provide the information within thirty days of receiving this application, as Section 7(1) requires, as [copies by post / electronic copies by email].',
    '',
    'Yours faithfully,',
    '',
    '[Your name]',
    '[Your postal address]',
    '[Email (optional)]',
  ])
}

/** "rti-request-MN-imphal-west-en.txt" */
export function rtiFileName(x: { state: string; districts: string[]; lang: Lang }) {
  const d = (x.districts.length === 1 ? x.districts[0] : x.districts.length ? 'several-districts' : 'statewide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'district'
  return `rti-request-${x.state}-${d}-${x.lang}.txt`
}
