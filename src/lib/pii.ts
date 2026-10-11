// Personal data never goes on the register: reports and orders are public and readonly. This is
// checked in the form (to explain) and again right before every write (so nothing slips through).
const DIGITS = /(?:\d[\s\-().]*){10,}/ // ten or more digits, however they are spaced: phone, Aadhaar, account numbers
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i
const UPI = /\b[\w.\-]{2,}@(?:ok\w+|ybl|ibl|axl|paytm|upi|apl|icici|sbi|hdfc\w*)\b/i
const AADHAAR_WORD = /\baadha?ar\b/i

/** The reason a text can't be published, or null if it looks clean. */
export function personalData(text: string): string | null {
  if (DIGITS.test(text)) return 'a long number (a phone, Aadhaar or account number)'
  if (EMAIL.test(text) || UPI.test(text)) return 'an email or UPI address'
  if (AADHAAR_WORD.test(text)) return 'an Aadhaar reference'
  return null
}

export function assertNoPersonalData(...texts: (string | undefined | null)[]) {
  for (const t of texts) {
    const why = t ? personalData(t) : null
    if (why) throw new Error(`This looks like it contains ${why}. Remove it: everything on the register is public and permanent.`)
  }
}
