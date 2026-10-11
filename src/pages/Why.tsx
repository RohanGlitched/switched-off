import { FACTS } from '../data/facts'
import { Link } from '../lib/router'
import { useRegister } from '../lib/store'
import { tf, useT } from '../lib/i18n'

// The arrays below are English; every string is translated as it renders.

const USERS = [
  ['People in a district that goes dark', 'Today they find out a shutdown is “official” from a forwarded photo of a letter, if at all. On Switched Off they see whether an order exists, what it covers, and the minute it lapses. When there is no order, they can say so, and the report outlives the rumour mill only if neighbours confirm it.'],
  ['Families and employers outside', 'A daughter in Pune can’t reach her parents in Churachandpur. The register tells her whether it is an order (and until when) or a local fault, and lets her file a report on their behalf.'],
  ['Lawyers and digital-rights groups', 'Challenges to shutdowns depend on knowing the order, its stated reason and how often it was renewed. The register links every renewal to the order before it, so “renewed 23 times” is a query, not a research project.'],
  ['Journalists', 'Every claim on the site has a reproducible query and a source link, and every live change arrives on the wire with its block number, which makes the register citable.'],
  ['Courts and review committees', 'The 2024 Rules require orders to be published and reviewed. A public, timestamped register of what was in force, and when, is the evidence base those reviews currently lack.'],
]

const BREAKS = [
  ['Postgres behind our own API', 'One operator, one server, one blocking order under Section 69A, and the register is gone, along with the evidence it held. The operator can also be pressed to quietly edit or delete a record; nobody outside could prove it changed.'],
  ['IPFS', 'Good for the order’s PDF, useless for the question people ask: “what is in force in Manipur right now?” IPFS has no queries and no expiry. A lapsed order would sit there looking current forever.'],
  ['A subgraph over a smart contract', 'We would write a contract to hold records, run an indexer to query them, and still build expiry ourselves with a keeper bot. Arkiv gives typed, queryable attributes, expiry and per-entity permissions as the storage itself.'],
  ['One organisation’s tracker website', 'The best record today is SFLC.in’s internetshutdowns.in, which has counted 934 shutdowns. It is careful work, and it still depends on one team, one database and one domain: if any of them goes, so does the record, and readers can’t independently check that an entry was never changed.'],
]

const OFF = [
  ['Who filed a report', 'Reports are signed by a throwaway key generated in the browser. No name, phone number, Aadhaar or IP address is written to Arkiv, and the form refuses notes that look like a phone number or email. People reporting a shutdown in a conflict zone must not be identifiable from a public, permanent dataset.'],
  ['Exact locations', 'District, never GPS. A district is enough to light the map and too coarse to find a person.'],
  ['The full text and PDF of each order', 'The register stores a short paraphrase of the stated reason, the authority’s designation (not officials’ names) and links to the published source. The PDF stays where the government or the press published it, and the source link is on every card.'],
  ['The map, translations and site code', 'Those are presentation. They live on a static host and in the public repository; the data they draw does not depend on them.'],
]

const FEATURES = [
  ['Expiration', 'An order entity expires at its lapse block (an unconfirmed emergency order: 24 hours after issue). The map relights a district when its last order expires, with no server deciding.', 'Map, gazette countdowns'],
  ['Lifetime extension', 'Confirming a report extends it (one confirmation per key, the filer can’t confirm their own); confirming an emergency order extends it to its stated end; keeping a record alive extends it a year. The entity page counts distinct keys from the extension transactions.', 'Confirm and Keep alive buttons, “confirmed by N keys”'],
  ['Creation flags', 'Orders and reports are readonly. Reports and archive records add permissionless extension, so anyone may keep them alive but no one may change them.', 'Flags on every entity page'],
  ['Ownership transfer', 'Every archive record is handed to 0x…dEaD: the October import was sealed in batches right after it was written, and everything filed since (orders, records, corrections) is sealed in the same transaction that creates it, with keys predicted from the account’s entity nonce. Readonly stops edits; an owner nobody holds stops deletion and stretching. That closes the gap readonly leaves.', '“Sealed” on every gazette and entity page'],
  ['Attributes vs payload', 'Everything we filter or sort on is a typed attribute: state, district, scope, net, issued/starts/ends as u64 timestamps, seq. Reason text, authority and sources sit in the JSON payload because nobody queries them.', 'Register filters, state pages'],
  ['Queries', 'Typed equality (state) and u64 range queries (issued since a year) run on Arkiv, paged in 200s, and the register prints the exact query it sent; atBlock for history. A correction counts only when it comes from the registrar or from the record’s own filer.', 'Register filters and their query line, the rewind slider'],
  ['$owner / $creator', 'After sealing they differ: $owner is 0x…dEaD, $creator is who filed it. Registrar filings and community transcriptions (the File an order page) are labelled by $creator.', 'Gazette footer, entity page'],
  ['Entity events', 'The live wire and the map react to EntityCreated and ExpiryExtended events over Arkiv’s WebSocket (a subscription costs no query budget); if the socket can’t open, a node-side filter is polled through our relay. Expiry has no event, so the next re-read is timed to the soonest expiry on screen.', 'Live wire, map refresh'],
  ['Batch writes', 'An order, its permanent record and the ownership transfers that seal them are one transaction, so there is never an order without its archive copy, or a record anyone could delete.', 'Issue order (drill), File an order, archive import'],
  ['Delete', 'The one thing an owner of a readonly entity can still do. A report’s filer can withdraw it; nobody can delete a sealed record, because nobody owns it.', '“Withdraw my report” on your own reports'],
]

const LIMITS = [
  ['It is on a testnet', 'Tiramisu is Arkiv’s public testnet. Entities can outlive this site, but the network makes no durability promise yet. The design moves unchanged to Arkiv mainnet.'],
  ['One public endpoint, many possible', 'The site, mirror and CLI default to Arkiv’s public RPC. Each takes another endpoint (?rpc= in the mirror, ARKIV_RPC for the CLI), so anyone running an Arkiv node can serve the register without asking anyone.'],
  ['The register is only as complete as its transcribers', '111 orders are on file; Access Now counted 116 shutdowns in India in 2023 alone. The File an order page lets anyone add the rest, labelled as community transcriptions.'],
  ['Reporting needs a signal, and a key', 'During a mobile-data cut, people on broadband or Wi-Fi can still report, and the offline queue sends reports when the signal returns. The gas tap runs on this site; a mirror can read the register but not fund new keys. Your browser key links your phone to your reports until you forget it (button on the Report page).'],
  ['Keys are not people', 'A confirmation is one extension per key, and keys are free: one person with several browsers can inflate “confirmed by N keys”. The count is a signal, not proof; a report is still a question for the state to answer, not a verdict.'],
  ['Anyone can write to the app’s namespace', 'Arkiv has no schema owner, so anyone can write entities tagged like ours. The readers defend themselves: a correction hides a record only if it comes from the registrar or the record’s own filer, a community order darkens the map only within the law’s fifteen-day cap, and every entity shows its $creator.'],
  ['Public court records, not private people', 'Orders cite courts, dates and outlets as sources, never a person. The guard before every write refuses honorifics, case titles, judge styles, names the register has already had to remove, and links whose slug carries a name. An early batch of notes did quote case titles with parties’ and judges’ names, and one note named a public figure; those records carry registrar corrections. The originals are sealed and stay readable by key until they expire, which is the price of an archive nobody can edit, and the reason the guard runs before, not after.'],
]

export function WhyPage() {
  const live = useRegister('live')
  const t = useT()
  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px', display: 'grid', gap: 56 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="chip sodium">{t('Why this exists')}</span>
        <h1 className="h2">{t('When the internet goes off, the people it happens to are the last to be able to say so.')}</h1>
        <p className="lede">{t('Switched Off is built for India, where internet shutdowns are an administrative routine: exams, protests, unrest, festivals. These are the numbers, each with its source.')}</p>
      </div>

      <div className="grid3">
        {FACTS.map((f) => (
          <div key={f.text} className="panel" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <span className="serif" style={{ fontSize: 44, lineHeight: 1, color: 'var(--sodium)' }}>{t(f.big)}</span>
            <p style={{ margin: 0 }}>{t(f.text)}</p>
            <a className="hint" href={f.url} target="_blank" rel="noreferrer">{t(f.source)}</a>
          </div>
        ))}
      </div>

      <div>
        <div className="section-head"><h2 className="h2">{t('Who uses it, and what changes for them on day one')}</h2></div>
        <div className="grid2">{USERS.map(([h, b]) => <Block key={h} t={h} b={b} />)}</div>
      </div>

      <div>
        <div className="section-head">
          <h2 className="h2">{t('Why Arkiv: what would break without it')}</h2>
          <p className="lede">{t('The register’s whole job is to be the one record of a shutdown that can’t be switched off, while obeying the law’s own clocks. Take Arkiv away and one of those two breaks.')}</p>
        </div>
        <div className="grid2">{BREAKS.map(([h, b]) => <Block key={h} t={h} b={b} />)}</div>
      </div>

      <div>
        <div className="section-head">
          <h2 className="h2">{t('What we keep off Arkiv, on purpose')}</h2>
          <p className="lede">{t('A permanent public dataset about shutdowns is also a dataset about the people living through them. These stay off-chain by design.')}</p>
        </div>
        <div className="grid2">{OFF.map(([h, b]) => <Block key={h} t={h} b={b} />)}</div>
      </div>

      <div>
        <div className="section-head"><h2 className="h2">{t('Each Arkiv feature, and what it changes on screen')}</h2></div>
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr>{['Feature', 'How Switched Off uses it', 'Where you see it'].map((h) => <th key={h} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--mute)', fontWeight: 500, fontSize: 13, borderBottom: '1px solid var(--line)' }}>{t(h)}</th>)}</tr></thead>
            <tbody>{FEATURES.map(([a, b, c]) => (
              <tr key={a}><td style={{ padding: '12px 10px', verticalAlign: 'top', fontWeight: 600, borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap' }}>{t(a)}</td><td style={{ padding: '12px 10px', borderBottom: '1px solid var(--line)' }} className="mute">{t(b)}</td><td style={{ padding: '12px 10px', borderBottom: '1px solid var(--line)', fontSize: 14 }}>{t(c)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="section-head"><h2 className="h2">{t('Honest limits')}</h2><p className="lede">{t('What this is not, yet.')}</p></div>
        <div className="grid2">{LIMITS.map(([h, b]) => <Block key={h} t={h} b={b} />)}</div>
      </div>

      <div id="sources">
        <div className="section-head"><h2 className="h2">{t('Sources')}</h2><p className="lede">{tf('Every order on the register carries its own source links. The archive was transcribed from published orders, court records and reporting that cites them; {n} orders are on file.', { n: live.loadedAt ? live.records.length : '…' })}</p></div>
        <div className="row"><Link to="/register" className="btn">{t('Open the register')}</Link><Link to="/data" className="btn">{t('Check the queries')}</Link></div>
      </div>
    </section>
  )
}

function Block({ t: title, b }: { t: string; b: string }) {
  const t = useT()
  return (
    <div className="panel" style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
      <h3 className="h3">{t(title)}</h3>
      <p className="mute" style={{ margin: 0 }}>{t(b)}</p>
    </div>
  )
}
