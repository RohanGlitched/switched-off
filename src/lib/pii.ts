// Personal data never goes on the register: reports and orders are public and readonly. This is
// checked in the form (to explain) and again right before every write (so nothing slips through).
// Digits are normalised first (Devanagari and other scripts, full-width), so "९८७६५४३२१०" is a number.
const DIGITS = /(?:\d[\s\-().\/]*){10,}/ // ten or more digits, however they are spaced: phone, Aadhaar, account numbers
const EMAIL = /[^\s@]+@[^\s@]+\.[\p{L}\p{M}]{2,}/iu
const EMAIL_SPELLED = /\b[\w.\-]{2,}\s*(?:\(at\)|\[at\]|\sat\s)\s*[\w\-]{2,}\s*(?:\(dot\)|\[dot\]|\sdot\s)\s*\p{L}{2,}\b/iu
const UPI = /\b[\w.\-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfc\w*)\b/i
const AADHAAR_WORD = /\baadha?ar\b/i
// A person's name: an honorific or a judicial style before a capitalised name, or a case title "X v. Y".
const NAME = /\b(?:[Ss]hri|[Ss]mt|[Ss]h\.|[Dd]r\.|[Mm]r\.|[Mm]rs\.|[Mm]s\.|[Jj]ustice|[Hh]on'?ble|[Aa]dvocate|[Aa]dv\.)\s+[A-Z][\p{L}'-]+/u
const CASE = /\b[A-Z][\p{L}'\-]+(?:\s+[A-Z][\p{L}'\-]+)*\s+(?:v\.|vs\.?|versus)\s+[A-Z]/u
const JUDGE_STYLE = /\b(?:JJ?\.|CJ|JJ)\b/

const normalise = (t: string) => t.normalize('NFKC').replace(/\p{Nd}/gu, digitValue)
function digitValue(ch: string): string {
  // any script's decimal digit to ASCII: the code point minus its script's zero
  const cp = ch.codePointAt(0)!
  for (const zero of [0x30, 0x660, 0x6f0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xff10]) if (cp >= zero && cp <= zero + 9) return String(cp - zero)
  return ch
}

/** The reason a text can't be published, or null if it looks clean. */
export function personalData(text: string): string | null {
  const t = normalise(text)
  if (DIGITS.test(t)) return 'a long number (a phone, Aadhaar or account number)'
  if (EMAIL.test(t) || EMAIL_SPELLED.test(t) || UPI.test(t)) return 'an email or UPI address'
  if (AADHAAR_WORD.test(t)) return 'an Aadhaar reference'
  if (NAME.test(t) || CASE.test(t) || JUDGE_STYLE.test(t)) return "a person's name (use the designation, and cite a case without the parties' names)"
  return null
}

export const looksLikeEmail = (text: string) => EMAIL.test(normalise(text)) || EMAIL_SPELLED.test(normalise(text))

export function assertNoPersonalData(...texts: (string | undefined | null)[]) {
  for (const t of texts) {
    const why = t ? personalData(t) : null
    if (why) throw new Error(`This looks like it contains ${why}. Remove it: everything on the register is public and permanent.`)
  }
}
