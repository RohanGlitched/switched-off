/** A short, queryable code for the legal basis; the full citation lives in the payload. */
export function basisCode(b: string | null | undefined): string {
  const s = (b ?? '').toLowerCase()
  if (!s) return 'not-stated'
  if (/2024|telecommunications act|temporary suspension of services\) rules/.test(s)) return 'tsr-2024'
  if (/2017|temporary suspension of telecom services/.test(s)) return 'tsr-2017'
  if (/163/.test(s) && /bnss|nagarik/.test(s)) return 'bnss-163'
  if (/144/.test(s)) return 'crpc-144'
  if (/5\(2\)|telegraph/.test(s)) return 'telegraph-5-2'
  return 'other'
}
export const BASIS_LABEL: Record<string, string> = {
  'tsr-2024': 'Telecommunications (Temporary Suspension of Services) Rules, 2024',
  'tsr-2017': 'Temporary Suspension of Telecom Services Rules, 2017',
  'telegraph-5-2': 'Section 5(2), Indian Telegraph Act, 1885',
  'crpc-144': 'Section 144, Code of Criminal Procedure',
  'bnss-163': 'Section 163, Bharatiya Nagarik Suraksha Sanhita',
  'not-stated': 'Legal basis not stated',
  other: 'Other legal basis',
}
export const clip = (s: string, n = 120) => (new TextEncoder().encode(s).length <= n ? s : s.slice(0, n - 1))
