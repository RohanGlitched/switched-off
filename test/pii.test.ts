// The personal-data guard: everything on the register is public and permanent, so a phone number,
// an email, an Aadhaar reference or a person's name must be caught before it is written, and the
// ordinary words of a shutdown order (districts, carriers, dates, order numbers) must pass.
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertNoPersonalData, linkProblem, looksLikeEmail, personalData } from '../src/lib/pii'

const caught = (t: string) => expect(personalData(t), JSON.stringify(t)).not.toBeNull()
const clean = (t: string) => expect(personalData(t), JSON.stringify(t)).toBeNull()

describe('long numbers (phone, Aadhaar, account)', () => {
  it.each([
    'Call me on 98765 43210',
    '9876543210',
    '+91 98765 43210',
    '+91-98765-43210',
    '(+91) 98765-43210',
    '98765/43210',
    '98765_43210',
    '98765:43210',
    '98765‒43210',
    '98765–43210',
    '1234 5678 9012',
    '1234-5678-9012',
  ])('%s', (t) => expect(personalData(t)).toMatch(/long number/))

  it('reads Devanagari, Bengali and full-width digits as digits', () => {
    expect(personalData('९८७६५४३२१०')).toMatch(/long number/)
    expect(personalData('মোবাইল ৯৮৭৬৫৪৩২১০')).toMatch(/long number/)
    expect(personalData('９８７６５４３２１０')).toMatch(/long number/)
  })

  it('does not count digits inside a source link', () => clean('see https://example.org/orders/2023/1234567890123 for the text'))
  it('does not count a list of short numbers separated by ", "', () => clean('Order nos. 12, 13, 14, 15, 16, 17 issued'))
  it('nine digits are not a phone number', () => clean('Reference 987654321 is pending'))
})

describe('emails and UPI handles', () => {
  it.each(['mail a@b.in', 'raju@gmail.com', 'raju @ gmail . com', 'raju@gmail.भारत', 'raju (at) gmail (dot) com', 'raju [at] gmail [dot] com', 'write to raju at gmail dot com'])('%s', (t) =>
    expect(personalData(t)).toMatch(/email or UPI/),
  )
  it.each(['pay me at rohan@okaxis', 'rohan@kotak', 'rohan.k@ybl'])('UPI id %s', (t) => expect(personalData(t)).toMatch(/email or UPI/))
  it('looksLikeEmail sees spelled-out and spaced addresses', () => {
    expect(looksLikeEmail('raju at gmail dot com')).toBe(true)
    expect(looksLikeEmail('raju @ gmail . com')).toBe(true)
    expect(looksLikeEmail('Home Department, Government of Manipur')).toBe(false)
  })
})

describe('Aadhaar references', () => {
  it.each(['Aadhaar card copy attached', 'my aadhar is with the SDM', 'आधार कार्ड'])('%s', (t) => expect(personalData(t)).toMatch(/Aadhaar/))
})

describe("people's names", () => {
  it.each([
    'Shri Ramesh Kumar, District Magistrate',
    'SHRI RAMESH KUMAR',
    'Mr Ramesh Kumar',
    'Mr. ramesh kumar',
    'Dr Ramesh Kumar',
    'Prof. Ramesh Kumar',
    'Kumari Sita Devi',
    'Smt. Sita Devi',
    'श्री रमेश कुमार',
    'Justice Fatehdeep Singh issued notice',
    "Hon'ble Ramesh Kumar",
  ])('honorific: %s', (t) => expect(personalData(t)).toMatch(/person's name/))
  it.each(['Kumar J. ordered', 'per Kumar, J.', 'Bhuyan and Saikia JJ ordered restoration'])('judicial style: %s', caught)
  it.each(['Ashlesh Biradar v. State of WB', 'Ramesh Kumar v State', 'Ramesh Kumar Vs. State', 'Ramesh Kumar & Ors. v. UoI', 'Ramesh Kumar versus Union'])('case title: %s', caught)
  it.each(['petitioner Ramesh Kumar said', 'DM Ramesh Kumar ordered', 'collector Sita Devi signed'])('role and name: %s', caught)
  it.each(['After the death of separatist leader S.A.S. Geelani', 'the search for Amritpal Singh'])('a name the archive has had to remove: %s', caught)
})

describe('what an order says must pass', () => {
  it.each([
    'Mobile data gone since 9 am, broadband still on',
    'down since 10:40 on 11 Oct 2026',
    'Order no. 12/2023-Home dated 03.05.2023',
    '03.05.2023 (10:00) to 08.05.2023 (17:00)',
    '2023-05-03 to 2023-05-08',
    'Home Department, Government of Manipur',
    'High Court stayed the order on 10 Mar 2022',
    'Residents of JJ Colony reported no data',
    'The CJ bench heard it',
    'Additional District Magistrate, Churachandpur',
    'Imphal West',
    'Jammu and Kashmir',
    'Jio, Airtel, Vi and BSNL mobile data suspended',
    'Section 144 CrPC; Rule 2(1) of the 2017 Rules',
    'Principal Secretary (Home), Government of Rajasthan',
    'Telecommunications (Temporary Suspension of Services) Rules, 2024',
    '',
  ])('%s', clean)
})

describe('source links', () => {
  it('flags an email in a link', () => expect(linkProblem('mailto:raju@gmail.com')).toBe('an email address'))
  it('flags a name in a link slug', () => {
    expect(linkProblem('https://news.example/2023/04/amritpal-singh-internet-ban')).toBe("a person's name in the link")
    expect(linkProblem('https://news.example/mr-ramesh-kumar-dm-orders-ban')).toBe("a person's name in the link")
  })
  it('lets an ordinary source through', () => {
    expect(linkProblem('https://home.rajasthan.gov.in/content/dam/orders/2023/suspension-order-12.pdf')).toBeNull()
    expect(linkProblem('https://www.thehindu.com/news/national/other-states/manipur-internet-suspension-extended/article67000000.ece')).toBeNull()
  })
})

describe('assertNoPersonalData, the last check before a write', () => {
  it('throws with the reason', () => expect(() => assertNoPersonalData('fine', 'Call 98765 43210')).toThrow(/long number.*public and permanent/))
  it('skips empty and missing fields', () => expect(() => assertNoPersonalData(undefined, null, '', 'Imphal West')).not.toThrow())
})

// The archive the registrar files must itself pass the guard, field by field and link by link.
describe('the whole archive passes', () => {
  type Src = { id: string; reasonStated?: string; notes?: string; issuingAuthority?: string; sources?: { title: string; url?: string }[] }
  const archive = JSON.parse(fs.readFileSync(new URL('../research/orders-all.json', import.meta.url), 'utf8')) as Src[]
  it('has the records', () => expect(archive.length).toBeGreaterThan(100))
  it('every reason, note, authority and source title is clean', () => {
    const bad: string[] = []
    for (const o of archive)
      for (const [field, t] of [['reason', o.reasonStated], ['notes', o.notes], ['authority', o.issuingAuthority], ...(o.sources ?? []).map((s) => ['source', s.title])] as [string, string | undefined][]) {
        const why = t ? personalData(t) : null
        if (why) bad.push(`${o.id} ${field}: ${why}`)
      }
    expect(bad).toEqual([])
  })
  it('every source link is clean', () => {
    const bad = archive.flatMap((o) => (o.sources ?? []).filter((s) => s.url && linkProblem(s.url)).map((s) => `${o.id}: ${s.url}`))
    expect(bad).toEqual([])
  })
})

describe('the scripts reports are written in', () => {
  it.each(['श्री राम आए थे', 'श्रीमती गीता', 'ਸ਼੍ਰੀ ਰਾਮ', 'শ্রী রাম', 'শ্ৰী ৰাম', 'ଶ୍ରୀ ରାମ', 'جناب احمد صاحب', 'ڈاکٹر احمد'])('a name after an honorific: %s', caught)
  it.each(['꯹꯸꯷꯶꯵꯴꯳꯲꯱꯰', '۹۸۷۶۵۴۳۲۱۰', '৯৮৭৬৫৪৩২১০', '੯੮੭੬੫੪੩੨੧੦', '୯୮୭୬୫୪୩୨୧୦'])('a phone number in its own digits: %s', (t) => expect(personalData(t)).toMatch(/long number/))
  it.each(['আধার নম্বর', 'ਆਧਾਰ ਕਾਰਡ', 'آدھار نمبر', 'ଆଧାର'])('an Aadhaar reference: %s', (t) => expect(personalData(t)).toMatch(/Aadhaar/))
  it.each(['मोबाइल डेटा सुबह से बंद', 'শ্রীনগরে ইন্টারনেট বন্ধ', 'سری نگر میں موبائل ڈیٹا بند ہے', 'ਮੋਬਾਈਲ ਡਾਟਾ ਬੰਦ', 'Sri Ganganagar: no data since 6 pm', 'Sri Muktsar Sahib broadband down', 'Srinagar mobile data off'])('ordinary words and place names pass: %s', clean)
})
