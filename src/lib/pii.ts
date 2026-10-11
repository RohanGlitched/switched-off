// Personal data never goes on the register: reports and orders are public and readonly. This is
// checked in the form (to explain) and again right before every write (so nothing slips through).
// Digits are normalised first (Devanagari and other scripts, full-width), so "९८७६५४३२१०" is a number;
// dates and clock times are set aside before counting digits, so "03.05.2023 (10:00) to 08.05.2023" is not.
const DIGITS = /(?:\d(?:[\s\-‒–_:().\/]|,(?!\s))*){10,}/ // ten or more digits, however they are spaced: phone, Aadhaar, account numbers (a comma followed by a space is a list, not a separator)
const DATE_OR_TIME = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b|\b(?:19|20)\d{2}\b/g
const EMAIL = /[^\s@]+\s*@\s*[^\s@]+\s*\.\s*[\p{L}\p{M}]{2,}/iu
const EMAIL_SPELLED = /\b[\w.\-]{2,}\s*(?:\(at\)|\[at\]|\sat\s)\s*[\w\-]{2,}\s*(?:\(dot\)|\[dot\]|\sdot\s)\s*\p{L}{2,}\b/iu
const UPI = /\b[\w.\-]{2,}@[a-z]{3,}\b(?![.\w])/i // a handle with no dot after the host is a UPI id, not a web address
const AADHAAR_WORD = /\baadha?ar\b|आधार/i
// A person's name: an honorific (with or without a dot, any case) or a judicial style before a name,
// a case title "X v. Y", or a role word followed by two capitalised words.
const HONORIFIC = /(?:^|[\s(,;:])(?:shri|sri|smt|shrimati|kumari|sh|dr|mr|mrs|ms|prof|justice|hon'?ble|advocate|adv|श्री|श्रीमती|कुमारी|डॉ|न्यायमूर्ति)\.?\s+[\p{L}][\p{L}'\-]+/iu
const CASE = /\b[\p{Lu}][\p{L}'\-]+(?:\s+(?:[\p{Lu}][\p{L}'\-]+|&|and|Ors\.?|Anr\.?))*\s+(?:[vV]\.?|[vV][sS]\.?|versus)\s+[\p{Lu}]/u
const ROLE_NAME = /\b(?:petitioner|respondent|complainant|accused|DM|SP|SDM|ADM|collector|magistrate|officer)\s+[\p{Lu}][\p{L}'\-]+\s+[\p{Lu}][\p{L}'\-]+/u
const JUDGE_STYLE = /\b(?:JJ?\.(?=\s|$|[,;)])|(?:CJ|JJ)(?=\s|$|[,;)])(?!\s+(?:Colony|bench|Bench)))/
// Names that have already had to be removed from this archive, in text and in link slugs. A bare
// "Firstname Lastname" can't be told from a place by a regex; this list grows as the register learns.
const KNOWN = /geelani|amritpal|bhasin|gogoi|biradar|fatehdeep|uday[-\s]?pratap|rajendra[-\s]?krishna|ananda[-\s]?sen|shrivastava|bharadwaj|sandeep[-\s]?singh|saikia|bhuyan|anubha|choudhary/i

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
  // links are sources, not numbers about a person: they are set aside before the digits are counted
  if (DIGITS.test(t.replace(/https?:\/\/\S+/gi, ' ').replace(DATE_OR_TIME, ' '))) return 'a long number (a phone, Aadhaar or account number)'
  if (EMAIL.test(t) || EMAIL_SPELLED.test(t) || UPI.test(t)) return 'an email or UPI address'
  if (AADHAAR_WORD.test(t)) return 'an Aadhaar reference'
  if (HONORIFIC.test(t) || CASE.test(t) || ROLE_NAME.test(t) || JUDGE_STYLE.test(t) || KNOWN.test(t)) return "a person's name (use the designation, and cite a case without the parties' names)"
  return null
}

export const looksLikeEmail = (text: string) => EMAIL.test(normalise(text)) || EMAIL_SPELLED.test(normalise(text))
/** A source link must not carry an email or a person's name in its slug. */
export const linkProblem = (url: string): string | null => (looksLikeEmail(url) ? 'an email address' : KNOWN.test(url) || HONORIFIC.test(url.replace(/[-_/]/g, ' ')) ? "a person's name in the link" : null)

export function assertNoPersonalData(...texts: (string | undefined | null)[]) {
  for (const t of texts) {
    const why = t ? personalData(t) : null
    if (why) throw new Error(`This looks like it contains ${why}. Remove it: everything on the register is public and permanent.`)
  }
}
