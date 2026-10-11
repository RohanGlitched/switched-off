// English and Hindi for the parts people in an affected district actually use: the header, the
// hero, and the report form. The register itself (orders, sources) stays in English, as published.
import { useSyncExternalStore } from 'react'

export type Lang = 'en' | 'hi'
const KEY = 'switched-off:lang'
let lang: Lang = (() => {
  try {
    return (localStorage.getItem(KEY) as Lang) || (navigator.language?.startsWith('hi') ? 'hi' : 'en')
  } catch {
    return 'en'
  }
})()
const subs = new Set<() => void>()
export function setLang(l: Lang) {
  lang = l
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
  document.documentElement.lang = l
  subs.forEach((f) => f())
}
export const useLang = () => useSyncExternalStore((f) => (subs.add(f), () => subs.delete(f)), () => lang)

const HI: Record<string, string> = {
  Map: 'नक्शा',
  Register: 'रजिस्टर',
  Report: 'रिपोर्ट करें',
  Drill: 'अभ्यास',
  'Data & mirrors': 'डेटा और मिरर',
  Why: 'क्यों',
  'The record of a shutdown can’t be switched off.': 'इंटरनेट बंदी का रिकॉर्ड बंद नहीं किया जा सकता।',
  'Is your internet off? Report it': 'आपका इंटरनेट बंद है? बताइए',
  'Open the register': 'रजिस्टर खोलें',
  'orders in force now': 'आदेश अभी लागू',
  'districts switched off': 'ज़िले बंद',
  'live reports of no internet': 'इंटरनेट न होने की ताज़ा रिपोर्टें',
  'Is your internet off?': 'क्या आपका इंटरनेट बंद है?',
  'No internet': 'इंटरनेट नहीं है',
  'Barely working': 'बहुत धीमा है',
  'It’s back': 'वापस आ गया',
  'State or UT': 'राज्य या केंद्र शासित प्रदेश',
  District: 'ज़िला',
  Network: 'नेटवर्क',
  'Choose…': 'चुनें…',
  'Pick a state first': 'पहले राज्य चुनें',
  'What you see (optional, 140 characters)': 'आप क्या देख रहे हैं (वैकल्पिक, 140 अक्षर)',
  'Never include names, phone numbers or exact addresses.': 'नाम, फ़ोन नंबर या पूरा पता कभी न लिखें।',
  'File this report': 'रिपोर्ट दर्ज करें',
  'Choose a district to report': 'रिपोर्ट के लिए ज़िला चुनें',
  'Writing to Arkiv… (about 8 seconds)': 'Arkiv पर दर्ज हो रही है… (लगभग 8 सेकंड)',
  'Say where and on which network. No sign-up and no name: this browser holds a throwaway key, and the report is owned by it.':
    'बताइए कहाँ और किस नेटवर्क पर। न साइन-अप, न नाम: यह ब्राउज़र एक अस्थायी कुंजी रखता है, और रिपोर्ट उसी की होती है।',
  'It fades unless someone nearby confirms it.': 'आस-पास कोई पुष्टि न करे तो यह कुछ घंटों में मिट जाती है।',
  'In a real blackout, this page works offline once it has been opened: reports are kept on the phone with the time they were made and sent when the signal comes back, marked as late.':
    'असली बंदी में, एक बार खुलने के बाद यह पेज बिना नेटवर्क के भी चलता है: रिपोर्ट फ़ोन में समय के साथ सहेजी जाती है और सिग्नल लौटते ही भेज दी जाती है।',
  'Live reports across India': 'पूरे भारत की ताज़ा रिपोर्टें',
}

export function useT() {
  const l = useLang()
  return (s: string) => (l === 'hi' ? (HI[s] ?? s) : s)
}
