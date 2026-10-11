import { useEffect, useState } from 'react'
import { Link, usePath } from './lib/router'
import { currentBlock, syncClock } from './lib/arkiv'
import { useNow } from './lib/store'
import { Home } from './pages/Home'
import { RegisterPage } from './pages/Register'
import { EntityPage } from './pages/Entity'
import { ReportPage } from './pages/Report'
import { DrillPage } from './pages/Drill'
import { DataPage } from './pages/Data'
import { WhyPage } from './pages/Why'
import { ToastHost } from './components/Toast'
import { setLang, useLang, useT } from './lib/i18n'
import { MODE, setMode } from './lib/arkiv'

const NAV = [
  ['/', 'Map'],
  ['/register', 'Register'],
  ['/report', 'Report'],
  ['/drill', 'Drill'],
  ['/data', 'Data & mirrors'],
  ['/why', 'Why'],
] as const

export function App() {
  const path = usePath()
  const route = path.split('?')[0]
  const [open, setOpen] = useState(false)
  const t = useT()
  const lang = useLang()
  useEffect(() => setOpen(false), [path])
  const page = route === '/' ? <Home />
    : route === '/register' ? <RegisterPage />
    : route.startsWith('/e/') ? <EntityPage entityKey={route.slice(3) as `0x${string}`} />
    : route === '/report' ? <ReportPage />
    : route === '/drill' ? <DrillPage />
    : route === '/data' ? <DataPage />
    : route === '/why' ? <WhyPage />
    : <NotFound />
  return (
    <>
      <a href="#main" className="sr" onFocus={(e) => e.currentTarget.classList.remove('sr')}>Skip to content</a>
      <header className="top">
        <div className="wrap">
          <Link to="/" className="brand" aria-label="Switched Off, home">
            <span className="switch" aria-hidden="true" />
            Switched Off
          </Link>
          <ChainBadge />
          <nav className={`nav${open ? ' open' : ''}`} aria-label="Main">
            {NAV.map(([to, label]) => <Link key={to} to={to}>{t(label)}</Link>)}
          </nav>
          <button className="lang" onClick={() => setLang(lang === 'hi' ? 'en' : 'hi')} aria-label={lang === 'hi' ? 'Switch to English' : 'हिंदी में देखें'}>{lang === 'hi' ? 'EN' : 'हिं'}</button>
          <button className="menu-btn" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}</button>
        </div>
      </header>
      <main id="main">{page}</main>
      <Footer />
      <ToastHost />
    </>
  )
}

function ChainBadge() {
  const now = useNow(2000)
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    syncClock().then(() => setOk(true), () => setOk(false))
  }, [])
  void now
  return (
    <span className="chain" title="Every read and write on this site goes to Arkiv's Tiramisu testnet">
      <span className={`pulse${ok === false ? ' off' : ''}`} aria-hidden="true" />
      {ok === false ? 'Arkiv unreachable' : ok ? <>Arkiv Tiramisu · block <span className="num">{currentBlock().toString()}</span></> : 'Connecting to Arkiv…'}
      <button className="lang" style={{ minHeight: 28, padding: '2px 8px', fontSize: 12 }} onClick={() => setMode(MODE === 'direct' ? 'relay' : 'direct')} title={MODE === 'direct' ? 'Your browser talks to Arkiv directly. Switch back to the shared, cached relay.' : 'Reads go through this site’s cached relay. Switch to talk to Arkiv directly, with no Switched Off server in between.'}>{MODE === 'direct' ? 'direct' : 'via relay'}</button>
    </span>
  )
}

function NotFound() {
  return (
    <section className="wrap section" style={{ borderTop: 0 }}>
      <h1 className="h2">No page here.</h1>
      <p className="lede">The register is on the <Link to="/">map</Link> and in the <Link to="/register">list of orders</Link>.</p>
    </section>
  )
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap foot-grid">
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="brand"><span className="switch" aria-hidden="true" />Switched Off</div>
          <p style={{ maxWidth: 380 }}>India’s register of internet shutdowns, kept on Arkiv so that the record of a shutdown can’t itself be switched off. Built for the Arkiv Global Tour Stop (Best Indian Use Case), October 2026.</p>
          <p className="faint">Testnet: Arkiv Tiramisu (chain 7738577). Reports are anonymous; never include names or phone numbers.</p>
        </div>
        <div>
          <h4>Use it</h4>
          <ul>
            <li><Link to="/">Live map</Link></li>
            <li><Link to="/register">Register of orders</Link></li>
            <li><Link to="/report">Report no internet</Link></li>
            <li><Link to="/drill">Run a drill</Link></li>
          </ul>
        </div>
        <div>
          <h4>Check it</h4>
          <ul>
            <li><Link to="/data">Exact queries</Link></li>
            <li><Link to="/data#mirrors">Mirrors and CLI</Link></li>
            <li><a href="https://github.com/RohanGlitched/switched-off/blob/main/arkiv/schema.md">schema.md</a></li>
            <li><a href="https://github.com/RohanGlitched/switched-off/blob/main/arkiv/friction.md">friction.md</a></li>
          </ul>
        </div>
        <div>
          <h4>Credits</h4>
          <ul>
            <li><a href="https://github.com/datameet/maps">District map: Datameet (CC BY 2.5 IN)</a></li>
            <li><a href="https://github.com/datameet/maps/tree/master/Country">India outline: Datameet (CC0)</a></li>
            <li><a href="https://arkiv.network">Data layer: Arkiv</a></li>
            <li><Link to="/why#sources">Sources for every order</Link></li>
          </ul>
        </div>
      </div>
      <div className="wrap faint" style={{ marginTop: 28, fontSize: 13 }}>MIT licensed · Changelog: Oct 11 first register, map and drill.</div>
    </footer>
  )
}
