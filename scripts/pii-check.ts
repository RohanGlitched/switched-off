// The personal-data guard against the cases a reviewer tried, plus every record in the archive
// (which must all pass, since they are what the registrar files). Exit code 1 on any failure.
import fs from 'node:fs'
import { linkProblem, personalData } from '../src/lib/pii'
const cases: [string, boolean][] = [
  ['Call me on 98765 43210', true], ['+91-98765-43210', true], ['98765/43210', true], ['98765_43210', true], ['98765:43210', true], ['98765‒43210', true],
  ['९८७६५४३२१०', true], ['1234 5678 9012', true],
  ['mail a@b.in', true], ['raju (at) gmail (dot) com', true], ['raju @ gmail . com', true], ['raju@gmail.भारत', true], ['pay me at rohan@okaxis', true], ['rohan@kotak', true],
  ['Shri Ramesh Kumar, District Magistrate', true], ['SHRI RAMESH KUMAR', true], ['Mr Ramesh Kumar', true], ['Mr. ramesh kumar', true], ['Dr Ramesh Kumar', true], ['Prof. Ramesh Kumar', true], ['Kumari Sita Devi', true], ['श्री रमेश कुमार', true],
  ['Justice Fatehdeep Singh issued notice', true], ['Kumar J. ordered', true], ['per Kumar, J.', true], ['Bhuyan and Saikia JJ ordered restoration', true],
  ['Ashlesh Biradar v. State of WB', true], ['Ramesh Kumar v State', true], ['Ramesh Kumar Vs. State', true], ['Ramesh Kumar & Ors. v. UoI', true],
  ['petitioner Ramesh Kumar said', true], ['DM Ramesh Kumar ordered', true], ['Aadhaar card copy attached', true],
  ['After the death of separatist leader S.A.S. Geelani', true], ['the search for Amritpal Singh', true],
  ['Mobile data gone since 9 am, broadband still on', false], ['down since 10:40 on 11 Oct 2026', false], ['Order no. 12/2023-Home dated 03.05.2023', false],
  ['03.05.2023 (10:00) to 08.05.2023 (17:00)', false], ['Home Department, Government of Manipur', false], ['High Court stayed the order on 10 Mar 2022', false],
  ['Residents of JJ Colony reported no data', false], ['The CJ bench heard it', false], ['Additional District Magistrate, Churachandpur', false],
]
let bad = 0
for (const [t, expect] of cases) {
  const got = personalData(t)
  const ok = !!got === expect
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(t), '->', got)
}
// every imported record must pass as the registrar would file it
type Src = { id: string; reasonStated?: string; notes?: string; issuingAuthority?: string; sources?: { title: string }[] }
const path = fs.existsSync('research/orders-all.json') ? 'research/orders-all.json' : '../research/orders-all.json'
for (const o of JSON.parse(fs.readFileSync(path, 'utf8')) as Src[]) {
  for (const s of o.sources ?? []) {
    const why = (s as { url?: string }).url ? linkProblem((s as { url: string }).url) : null
    if (why) {
      bad++
      console.log('FAIL archive', o.id, 'url', '->', why, '::', (s as { url: string }).url.slice(0, 120))
    }
  }
  for (const [field, text] of [['reason', o.reasonStated], ['notes', o.notes], ['authority', o.issuingAuthority], ...(o.sources ?? []).map((s) => ['source', s.title] as const)] as [string, string | undefined][]) {
    const why = text ? personalData(text) : null
    if (why) {
      bad++
      console.log('FAIL archive', o.id, field, '->', why, '::', text!.slice(0, 120))
    }
  }
}
console.log(bad ? `${bad} failure(s)` : 'all clear: cases and the whole archive')
if (bad) process.exit(1)
