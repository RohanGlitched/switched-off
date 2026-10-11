// Reproducible: the exact queries behind every claim on this site, a one-file mirror, and a CLI.
import { RPC, WS, EXPLORER } from '../lib/arkiv'
import { REGISTRARS } from '../lib/registrars'
import { useRegister } from '../lib/store'
import { Link } from '../lib/router'
import { tf, tx, useT } from '../lib/i18n'

const q = (expr: string, extra = '') =>
  `curl -s -X POST ${RPC} \\
  -H 'content-type: application/json' \\
  -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"arkiv_query\\",\\"params\\":[\\"${expr}\\",{\\"select\\":{\\"key\\":true,\\"attributes\\":true,\\"payload\\":true,\\"expiresAt\\":true,\\"owner\\":true,\\"creator\\":true,\\"creationFlags\\":true}${extra}}]}"`

const QUERIES: { title: string; claim: string; expr: string; sdk: string; extra?: string }[] = [
  {
    title: 'Orders in force right now',
    claim: 'The map’s dark districts and “orders in force now”. An order entity exists only until its lapse block, so no date filter is needed: being alive is being in force.',
    expr: "app = str('switched-off') AND type = str('order') AND net = str('live')",
    sdk: `pub.select('*').where(and([eq('app','switched-off'), eq('type','order'), eq('net','live')])).fetch()`,
  },
  {
    title: 'The whole archive',
    claim: 'The register page and the year-by-year table. Readonly records anyone can extend.',
    expr: "app = str('switched-off') AND type = str('record') AND net = str('live')",
    sdk: `pub.select('*').where(and([eq('app','switched-off'), eq('type','record'), eq('net','live')])).fetch() // walk .next() past 200`,
  },
  {
    title: 'Every order ever filed for Manipur',
    claim: 'Filter by state code on an attribute, not by reading payloads.',
    expr: "app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('MN')",
    sdk: `pub.select('*').where(and([eq('app','switched-off'), eq('type','record'), eq('net','live'), eq('state','MN')])).fetch()`,
  },
  {
    title: 'Live citizen reports',
    claim: 'Red districts. A report is alive only while someone keeps confirming it.',
    expr: "app = str('switched-off') AND type = str('report') AND net = str('live')",
    sdk: `pub.select('*').where(and([eq('app','switched-off'), eq('type','report'), eq('net','live')])).fetch()`,
  },
  {
    title: 'Orders issued after a date',
    claim: 'Timestamps are u64 attributes, so ranges are a query, not a scan. Note the u64(…) tag: a bare number is read as i32 and silently matches nothing (see friction.md).',
    expr: "app = str('switched-off') AND type = str('record') AND net = str('live') AND issued > u64(1688169600)",
    sdk: `pub.select('*').where(and([eq('app','switched-off'), eq('type','record'), gt('issued', u64(1688169600n))])).fetch() // issued after 1 Jul 2023`,
  },
]

export function DataPage() {
  const live = useRegister('live')
  const t = useT()
  return (
    <section className="wrap" style={{ padding: '40px var(--gutter) 20px', display: 'grid', gap: 40 }}>
      <div className="section-head" style={{ marginBottom: 0 }}>
        <span className="chip sodium">{t('Data & mirrors')}</span>
        <h1 className="h2">{t('Don’t trust this site. Ask the network.')}</h1>
        <p className="lede">{t('Every number on Switched Off comes from one of the queries below. Run them yourself against Arkiv’s Tiramisu testnet: no key, no account, no Switched Off server in between.')}</p>
        <div className="row">
          <span className="chip">RPC {RPC.replace('https://', '')}</span>
          <span className="chip">WebSocket {WS.replace('wss://', '')}</span>
          <a className="chip" href={EXPLORER}>{t('Explorer')}</a>
          <span className="chip num">{live.loadedAt ? tf('{records} records · {orders} in force · {reports} live reports', { records: live.records.length, orders: live.orders.length, reports: live.reports.length }) : t('reading Arkiv…')}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 22 }}>
        {QUERIES.map((x) => (
          <div key={x.title} className="panel" style={{ display: 'grid', gap: 10 }}>
            <h2 className="h3">{t(x.title)}</h2>
            <p className="mute" style={{ margin: 0 }}>{t(x.claim)}</p>
            <pre className="code">{q(x.expr, x.extra)}</pre>
            <pre className="code" style={{ opacity: 0.85 }}>{`// @arkiv-network/sdk 0.8.1\n${x.sdk}`}</pre>
          </div>
        ))}
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <h2 className="h3">{t('Evidence that survives expiry')}</h2>
          <p className="mute" style={{ margin: 0 }}>{tx('Lapsed orders vanish from the present, not from history. On 11 Oct we filed a drill order that lived 30 blocks: entity {key}, created at block 437,835. Run the first query and it is gone; run the second, the same query at block 437,835, and it is there. The drill’s rewind slider and the CLI’s {at} command do exactly this.', { key: <code>0x0bd2969f…b57302c</code>, at: <code>at</code> })}</p>
          <pre className="code">{q("app = str('switched-off') AND order_id = str('drill-evidence-lapse')")}</pre>
          <pre className="code">{q("app = str('switched-off') AND order_id = str('drill-evidence-lapse')", `,\\"atBlock\\":\\"0x6ae4b\\"`)}</pre>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <h2 className="h3">{t('Nobody can delete the archive')}</h2>
          <p className="mute" style={{ margin: 0 }}>{tx('Every live record is owned by {dead}, an address nobody holds a key for, while its {creator} still shows who filed it. Only an owner can delete an entity, so these can only expire, and anyone can extend them. This query should return all of them:', { dead: <code>0x…dEaD</code>, creator: <code>$creator</code> })}</p>
          <pre className="code">{q("\\$owner = addr(0x000000000000000000000000000000000000dEaD) AND app = str('switched-off') AND type = str('record') AND net = str('live')")}</pre>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 10 }}>
          <h2 className="h3">{t('Who filed it')}</h2>
          <p className="mute" style={{ margin: 0 }}>{tx('Every entity carries its {creator} and {owner}. Orders from the Switched Off registrar come from these addresses; anything else is a community transcription, labelled as such.', { creator: <code>$creator</code>, owner: <code>$owner</code> })}</p>
          <pre className="code">{REGISTRARS.map((r) => `${r.name}: ${r.address}`).join('\n')}{`\n\ncreatedBy: pub.select('*').where(eq('app','switched-off')).createdBy('${REGISTRARS[0].address}').fetch()\n(ownedBy would find almost nothing: the records are sealed, so their $owner is 0x…dEaD)`}</pre>
        </div>
      </div>

      <div id="mirrors" className="section-head" style={{ marginBottom: 0 }}>
        <h2 className="h2">{t('Mirrors and the command line')}</h2>
        <p className="lede">{t('If this site is blocked, the register isn’t. Three ways to read it without us:')}</p>
      </div>
      <div className="grid3">
        <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <h3 className="h3">{t('One-file mirror')}</h3>
          <p className="mute" style={{ margin: 0 }}>{t('A single HTML file, about 10 KB, that reads orders and reports straight from Arkiv in the browser. Save it, put it on any host, send it on WhatsApp.')}</p>
          <a className="btn small" href="/mirror.html" download style={{ justifySelf: 'start' }}>{t('Download mirror.html')}</a>
          <a href="/mirror.html">{t('Open it here')}</a>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <h3 className="h3">{t('Independent copy')}</h3>
          <p className="mute" style={{ margin: 0 }}>{t('The same mirror, served by GitHub Pages from the repository, on a different company’s servers and domain.')}</p>
          <a className="btn small" href="https://rohanglitched.github.io/switched-off/" style={{ justifySelf: 'start' }}>{t('Open the GitHub Pages mirror')}</a>
        </div>
        <div className="panel" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <h3 className="h3">{t('Command line')}</h3>
          <p className="mute" style={{ margin: 0 }}>{t('A zero-dependency Node script in the repo.')}</p>
          <pre className="code">{`node cli/switched-off.mjs active\nnode cli/switched-off.mjs state MN\nnode cli/switched-off.mjs reports`}</pre>
        </div>
      </div>
      <p className="hint">{tx('Full entity schema: {schema}. What was hard: {friction}. {why}', { schema: <a href="https://github.com/RohanGlitched/switched-off/blob/main/arkiv/schema.md">arkiv/schema.md</a>, friction: <a href="https://github.com/RohanGlitched/switched-off/blob/main/arkiv/friction.md">arkiv/friction.md</a>, why: <Link to="/why">{t('Why Arkiv, and what we keep off it.')}</Link> })}</p>
    </section>
  )
}
