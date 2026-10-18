// English and Hindi for everything the app itself says: pages, buttons, labels, messages. The
// content of the register (an order's reason, authority, notes, source titles, place names as
// stored) stays as published. Keys are the exact English strings; `{name}` marks a variable.
import { createElement, Fragment, useSyncExternalStore, type ReactNode } from 'react'
import { MORE, type MoreLang } from './i18n-more'

export type Lang = 'en' | 'hi' | MoreLang
/** Every language the report form speaks, in its own script. English and Hindi cover the whole site. */
export const LANGS: [Lang, string][] = [['en', 'English'], ['hi', 'हिन्दी'], ['ur', 'اردو'], ['bn', 'বাংলা'], ['as', 'অসমীয়া'], ['pa', 'ਪੰਜਾਬੀ'], ['or', 'ଓଡ଼ିଆ']]
const KNOWN_LANGS = new Set(LANGS.map(([l]) => l))
const KEY = 'switched-off:lang'
let lang: Lang = (() => {
  try {
    const saved = localStorage.getItem(KEY) as Lang | null
    if (saved && KNOWN_LANGS.has(saved)) return saved
    const nav = (navigator.language ?? '').slice(0, 2) as Lang
    return KNOWN_LANGS.has(nav) ? nav : 'en'
  } catch {
    return 'en'
  }
})()
try {
  document.documentElement.lang = lang
} catch {
  /* no document */
}
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
/** The current language, read at call time (for plain functions such as the date formatters). */
export const getLang = () => lang
/** The locale for dates and numbers in the current language. */
export const locale = () => (lang === 'en' || (lang !== 'hi' && !onReportForm()) ? 'en-IN' : `${lang}-IN`)
/** Urdu is written right to left. */
export const dirOf = (l: Lang) => (l === 'ur' ? 'rtl' : 'ltr')

const onReportForm = () => typeof location !== 'undefined' && location.pathname.startsWith('/report')
const missing = new Set<string>()
/** Translate outside React (event handlers, toasts, formatters): the same dictionary as useT. */
export function tr(s: string): string {
  if (lang === 'en') return s
  // the other languages cover the report form (and the menu above it); elsewhere the page stays wholly
  // English rather than mixing scripts in one sentence
  if (lang !== 'hi') return onReportForm() ? MORE[lang][s] ?? s : s
  const h = HI[s]
  if (h === undefined && import.meta.env.DEV && !missing.has(s)) {
    missing.add(s)
    ;(globalThis as { __i18nMissing?: string[] }).__i18nMissing = [...missing]
    console.warn('[i18n] no Hindi for:', s)
  }
  return h ?? s
}
/** Translate into a given language, whatever the page is in (a Hindi letter from the English page). */
export const trIn = (l: Lang, s: string): string => (l === 'hi' ? HI[s] ?? s : s)
/** A template with `{name}` placeholders: the Hindi entry may put them in any order. */
export function tf(template: string, vars: Record<string, string | number>): string {
  return tr(template).replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}
/** Pick the singular or plural English template by `n`, then translate it with `{n}` filled in. */
export function tp(n: number, one: string, many: string, vars: Record<string, string | number> = {}): string {
  return tf(n === 1 ? one : many, { n, ...vars })
}
/** A template whose placeholders are elements (links, code): returns nodes in the language's order. */
export function tx(template: string, vars: Record<string, ReactNode>): ReactNode {
  return tr(template)
    .split(/\{(\w+)\}/)
    .map((p, i) => createElement(Fragment, { key: i }, i % 2 ? (p in vars ? vars[p] : `{${p}}`) : p))
}
/** In a component: subscribes it to language changes and returns the translator. */
export function useT() {
  useLang()
  return tr
}

const HI: Record<string, string> = {
  'at block {block}': 'ब्लॉक {block} पर',
  // states and union territories (shown in Hindi; stored names stay English)
  'Andaman and Nicobar Islands': 'अंडमान और निकोबार द्वीपसमूह',
  'Andhra Pradesh': 'आंध्र प्रदेश',
  'Arunachal Pradesh': 'अरुणाचल प्रदेश',
  'Assam': 'असम',
  'Bihar': 'बिहार',
  'Chandigarh': 'चंडीगढ़',
  'Chhattisgarh': 'छत्तीसगढ़',
  'Dadra and Nagar Haveli and Daman and Diu': 'दादरा और नगर हवेली और दमन और दीव',
  'Delhi': 'दिल्ली',
  'Goa': 'गोवा',
  'Gujarat': 'गुजरात',
  'Himachal Pradesh': 'हिमाचल प्रदेश',
  'Haryana': 'हरियाणा',
  'Jharkhand': 'झारखंड',
  'Jammu and Kashmir': 'जम्मू और कश्मीर',
  'Karnataka': 'कर्नाटक',
  'Kerala': 'केरल',
  'Ladakh': 'लद्दाख',
  'Lakshadweep': 'लक्षद्वीप',
  'Maharashtra': 'महाराष्ट्र',
  'Meghalaya': 'मेघालय',
  'Manipur': 'मणिपुर',
  'Madhya Pradesh': 'मध्य प्रदेश',
  'Mizoram': 'मिज़ोरम',
  'Nagaland': 'नागालैंड',
  'Odisha': 'ओडिशा',
  'Punjab': 'पंजाब',
  'Puducherry': 'पुदुचेरी',
  'Rajasthan': 'राजस्थान',
  'Sikkim': 'सिक्किम',
  'Telangana': 'तेलंगाना',
  'Tamil Nadu': 'तमिलनाडु',
  'Tripura': 'त्रिपुरा',
  'Uttar Pradesh': 'उत्तर प्रदेश',
  'Uttarakhand': 'उत्तराखंड',
  'West Bengal': 'पश्चिम बंगाल',
  'This part of the page could not be drawn.': 'पेज का यह हिस्सा नहीं बन पाया।',
  'Something on the register did not match the shape the page expects. The rest of the site still works; reloading usually clears it.': 'रजिस्टर में कुछ ऐसा है जो पेज की अपेक्षित बनावट से मेल नहीं खाता। बाक़ी साइट चलती रहेगी; दोबारा लोड करने से आमतौर पर ठीक हो जाता है।',
  'Try again': 'फिर कोशिश करें',
  'earlier': 'पहले',
  'ARCHIVED': 'अभिलेख में',
  'community': 'सामुदायिक',
  'The archive copy; its order runs until {date}.': 'अभिलेख की प्रति; इसका आदेश {date} तक चलता है।',
  '1h ago': '1 घंटा पहले',
  'a person\'s name (reports never need a name)': 'किसी व्यक्ति का नाम (रिपोर्ट में नाम की ज़रूरत नहीं होती)',
  '{n} corrected original hidden': '{n} सुधारा गया मूल रिकॉर्ड छिपाया गया',
  '{n} corrected originals hidden': '{n} सुधारे गए मूल रिकॉर्ड छिपाए गए',
  'Replaying the register: {date}': 'रजिस्टर दोहराया जा रहा है: {date}',
  'Scroll or tap to stop': 'रोकने के लिए स्क्रॉल या टैप करें',
  'Data and mirrors': 'डेटा और मिरर',
  'Entity': 'एंटिटी',
  'Page not found': 'पेज नहीं मिला',
  'Switched Off: India\'s internet shutdown register': 'Switched Off: भारत का इंटरनेट बंदी रजिस्टर',
  'Reading through the relay (press to read Arkiv directly)': 'रिले के ज़रिए पढ़ा जा रहा है (Arkiv से सीधे पढ़ने के लिए दबाएँ)',
  'Reading Arkiv directly (press to use the relay)': 'Arkiv से सीधे पढ़ा जा रहा है (रिले इस्तेमाल करने के लिए दबाएँ)',
  // Header, hero, counters, map legend, report form
  Map: 'नक्शा',
  Register: 'रजिस्टर',
  Report: 'रिपोर्ट करें',
  Drill: 'अभ्यास',
  'Data & mirrors': 'डेटा और मिरर',
  Why: 'क्यों',
  Menu: 'मेनू',
  Close: 'बंद करें',
  'Lights on': 'बत्तियाँ जल रही हैं',
  'Switched off by an order in force': 'लागू आदेश से बंद',
  'Reported dark, no published order': 'बंद बताया गया, कोई प्रकाशित आदेश नहीं',
  'Play the history': 'इतिहास दोबारा देखें',
  'Back to now': 'अभी पर लौटें',
  'File a published order': 'प्रकाशित आदेश दर्ज करें',
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
  'In a real blackout, this page works offline once it has been opened: reports are kept on the phone with the time they were made and sent when the signal comes back, marked as late.':
    'असली बंदी में, एक बार खुलने के बाद यह पेज बिना नेटवर्क के भी चलता है: रिपोर्ट फ़ोन में समय के साथ सहेजी जाती है और सिग्नल लौटते ही भेज दी जाती है।',
  'Live reports across India': 'पूरे भारत की ताज़ा रिपोर्टें',
  // App: header, menu, 404, footer
  'Skip to content': 'मुख्य सामग्री पर जाएँ',
  'Switched Off, home': 'Switched Off, मुख्य पेज',
  Main: 'मुख्य',
  'Reading Arkiv directly · switch to the relay': 'Arkiv से सीधे पढ़ रहे हैं · रिले पर जाएँ',
  'Reading through the relay · read Arkiv directly': 'रिले के ज़रिए पढ़ रहे हैं · Arkiv से सीधे पढ़ें',
  "Every read and write on this site goes to Arkiv's Tiramisu testnet": 'इस साइट पर हर पढ़ना और लिखना Arkiv के Tiramisu टेस्टनेट पर होता है',
  'Arkiv unreachable': 'Arkiv से संपर्क नहीं हो पा रहा',
  'Arkiv Tiramisu · block {n}': 'Arkiv Tiramisu · ब्लॉक {n}',
  'Connecting to Arkiv…': 'Arkiv से जुड़ रहे हैं…',
  'Your browser talks to Arkiv directly. Switch back to the shared, cached relay.': 'आपका ब्राउज़र सीधे Arkiv से बात कर रहा है। साझा, कैश वाले रिले पर वापस जाएँ।',
  'Reads go through this site’s cached relay. Switch to talk to Arkiv directly, with no Switched Off server in between.': 'डेटा इस साइट के कैश वाले रिले से पढ़ा जा रहा है। सीधे Arkiv से बात करने के लिए बदलें, बीच में Switched Off का कोई सर्वर नहीं रहेगा।',
  direct: 'सीधे',
  'via relay': 'रिले से',
  'No page here.': 'यहाँ कोई पेज नहीं है।',
  'The register is on the {map} and in the {list}.': 'रजिस्टर {map} पर और {list} में है।',
  map: 'नक्शे',
  'list of orders': 'आदेशों की सूची',
  'India’s register of internet shutdowns, kept on Arkiv so that the record of a shutdown can’t itself be switched off. Built for the Arkiv Global Tour Stop (Best Indian Use Case), October 2026.':
    'भारत में इंटरनेट बंदी का रजिस्टर। इसे Arkiv पर रखा गया है ताकि बंदी का रिकॉर्ड खुद बंद न किया जा सके। Arkiv Global Tour Stop (Best Indian Use Case), अक्टूबर 2026 के लिए बनाया गया।',
  'Testnet: Arkiv Tiramisu (chain 7738577). Reports are anonymous; never include names or phone numbers.': 'टेस्टनेट: Arkiv Tiramisu (चेन 7738577)। रिपोर्टें गुमनाम होती हैं; इनमें कभी नाम या फ़ोन नंबर न लिखें।',
  'Use it': 'इस्तेमाल करें',
  'Check it': 'जाँचें',
  Credits: 'आभार',
  'Live map': 'लाइव नक्शा',
  'Register of orders': 'आदेशों का रजिस्टर',
  'Report no internet': 'इंटरनेट बंद होने की रिपोर्ट करें',
  'Run a drill': 'अभ्यास चलाएँ',
  'Exact queries': 'सटीक क्वेरी',
  'Mirrors and CLI': 'मिरर और CLI',
  'Independent mirror (GitHub Pages)': 'स्वतंत्र मिरर (GitHub Pages)',
  'Source on GitHub (MIT)': 'GitHub पर सोर्स कोड (MIT)',
  'Why Arkiv, and the honest limits': 'Arkiv क्यों, और ईमानदार सीमाएँ',
  'District map: Datameet (CC BY 2.5 IN)': 'ज़िलों का नक्शा: Datameet (CC BY 2.5 IN)',
  'India outline: Datameet (CC0)': 'भारत की रूपरेखा: Datameet (CC0)',
  'Data layer: Arkiv': 'डेटा परत: Arkiv',
  'Sources for every order': 'हर आदेश के स्रोत',
  'MIT licensed · Changelog: Oct 11 first register, map and drill.': 'MIT लाइसेंस · बदलाव: 11 अक्टूबर को पहला रजिस्टर, नक्शा और अभ्यास।',
  // Home
  'Register of telecom suspension orders · India': 'दूरसंचार निलंबन आदेशों का रजिस्टर · भारत',
  'India’s internet shutdown orders, filed on Arkiv the way the law says they work: each lives until it lapses, nobody can quietly edit or delete the record, and anyone can keep it alive. When the lights go out without a published order, people on the ground can say so, and their neighbours can confirm it.':
    'भारत में इंटरनेट बंदी के आदेश, Arkiv पर ठीक उसी तरह दर्ज जैसे क़ानून कहता है: हर आदेश अपनी अवधि ख़त्म होने तक रहता है, कोई चुपचाप रिकॉर्ड बदल या मिटा नहीं सकता, और कोई भी उसे जीवित रख सकता है। जब बिना किसी प्रकाशित आदेश के बत्तियाँ बुझ जाती हैं, तो वहाँ के लोग यह बता सकते हैं, और उनके पड़ोसी इसकी पुष्टि कर सकते हैं।',
  'Right now': 'अभी',
  'orders on file': 'आदेश दर्ज',
  'Arkiv didn’t answer just now ({error}). The map will retry on its own.': 'Arkiv ने अभी जवाब नहीं दिया ({error})। नक्शा अपने-आप फिर कोशिश करेगा।',
  'No order on the register is in force right now. Latest on file:': 'रजिस्टर का कोई आदेश इस समय लागू नहीं है। सबसे ताज़ा दर्ज आदेश:',
  lapsed: 'समाप्त',
  'Map of India on {date}: {n} districts under a suspension order on file.': '{date} को भारत का नक्शा: {n} ज़िलों पर दर्ज निलंबन आदेश लागू।',
  Now: 'अभी',
  '{n} order in force': '{n} आदेश लागू',
  '{n} orders in force': '{n} आदेश लागू',
  '{n} district dark': '{n} ज़िला बंद',
  '{n} districts dark': '{n} ज़िले बंद',
  Pause: 'रोकें',
  'Day to show': 'दिखाने के लिए दिन',
  today: 'आज',
  'Every order on the register, replayed from its stated start to its stated end. Orders without a published end date are shown until the next order on file for that state, at most fifteen days.':
    'रजिस्टर का हर आदेश, उसमें बताई गई शुरुआत से बताए गए अंत तक, दोबारा चलाया गया। जिन आदेशों की अंतिम तारीख़ प्रकाशित नहीं है, वे उस राज्य के अगले दर्ज आदेश तक दिखाए जाते हैं, ज़्यादा से ज़्यादा पंद्रह दिन।',
  'Live wire': 'ताज़ा हलचल',
  'Every change, as Arkiv writes it.': 'हर बदलाव, ठीक जैसे Arkiv उसे लिखता है।',
  'This feed follows Arkiv’s entity events: a new order, a report, a neighbour confirming a report, someone paying to keep a record alive. Each shows up here within seconds of its block, for everyone, over Arkiv’s WebSocket (a node-side filter polled through the relay if the socket can’t open).':
    'यह फ़ीड Arkiv की एंटिटी घटनाओं पर चलती है: नया आदेश, नई रिपोर्ट, किसी पड़ोसी द्वारा रिपोर्ट की पुष्टि, किसी का रिकॉर्ड जीवित रखने के लिए भुगतान करना। हर घटना अपने ब्लॉक के कुछ ही सेकंड में यहाँ सबको दिखती है, Arkiv के WebSocket के ज़रिए (सॉकेट न खुले तो रिले से नोड पर लगा फ़िल्टर बार-बार जाँचा जाता है)।',
  'File a report': 'रिपोर्ट दर्ज करें',
  'Start a drill to watch it move': 'इसे चलता देखने के लिए अभ्यास शुरू करें',
  'How the register works': 'रजिस्टर कैसे काम करता है',
  'The law’s clock is the database’s clock.': 'क़ानून की घड़ी ही डेटाबेस की घड़ी है।',
  'India’s Telecommunications (Temporary Suspension of Services) Rules, 2024 put deadlines on every shutdown. Switched Off doesn’t enforce those deadlines with a cron job on someone’s server. Each one is how long the Arkiv entity is allowed to exist.':
    'भारत के दूरसंचार (सेवाओं का अस्थायी निलंबन) नियम, 2024 हर इंटरनेट बंदी की समय-सीमा तय करते हैं। Switched Off इन समय-सीमाओं को किसी सर्वर पर चलने वाले cron job से लागू नहीं करता। हर समय-सीमा उतनी ही है, जितनी देर Arkiv एंटिटी को रहने की इजाज़त है।',
  'days, at most': 'दिन, ज़्यादा से ज़्यादा',
  'An order can’t run longer than fifteen days.': 'कोई आदेश पंद्रह दिन से ज़्यादा नहीं चल सकता।',
  'Each order is filed with its Arkiv expiry set to the day it lapses. When that block comes, the order entity is gone, its districts light up again, and nothing anyone does can stretch it: a longer shutdown needs a new order, so every renewal shows.':
    'हर आदेश ऐसे दर्ज होता है कि उसकी Arkiv समय-सीमा उसी दिन ख़त्म हो, जिस दिन आदेश समाप्त होता है। वह ब्लॉक आते ही आदेश की एंटिटी मिट जाती है, उसके ज़िलों में फिर बत्तियाँ जल उठती हैं, और कोई भी उसे आगे नहीं खींच सकता: लंबी बंदी के लिए नया आदेश चाहिए, इसलिए हर नवीनीकरण सामने आता है।',
  hours: 'घंटे',
  'An emergency order dies in a day unless confirmed.': 'पुष्टि न हो तो आपात आदेश एक दिन में ख़त्म हो जाता है।',
  'When an officer issues an order in an emergency, it is filed to expire 24 hours later. Confirming it is extending it, and only the filer’s key can: until then the gazette says EMERGENCY and the clock is running.':
    'जब कोई अधिकारी आपात स्थिति में आदेश जारी करता है, तो वह 24 घंटे बाद समाप्त होने के लिए दर्ज होता है। पुष्टि का मतलब है उसकी अवधि बढ़ाना, और यह सिर्फ़ दर्ज करने वाले की कुंजी कर सकती है: तब तक गज़ट पर "आपात" लिखा रहता है और घड़ी चलती रहती है।',
  'edits, 0 deletions': 'बदलाव, 0 डिलीट',
  'Records are readonly, then sealed.': 'रिकॉर्ड केवल-पढ़ने वाले होते हैं, फिर सील कर दिए जाते हैं।',
  'Every order and report is created with Arkiv’s readonly flag, so its text can never change. The archive record is then handed to an address nobody holds a key for, so nobody can delete it either, not even the registrar. A mistake gets a correction: a new entity that names the one it corrects, both kept.':
    'हर आदेश और रिपोर्ट Arkiv के readonly फ़्लैग के साथ बनती है, इसलिए उसका पाठ कभी नहीं बदल सकता। फिर संग्रह का रिकॉर्ड एक ऐसे पते को सौंप दिया जाता है जिसकी कुंजी किसी के पास नहीं, इसलिए उसे कोई मिटा भी नहीं सकता, रजिस्ट्रार भी नहीं। ग़लती का इलाज सुधार है: एक नई एंटिटी, जो बताती है कि वह किस रिकॉर्ड को सुधार रही है, और दोनों बने रहते हैं।',
  'A report fades unless a neighbour confirms it.': 'कोई पड़ोसी पुष्टि न करे तो रिपोर्ट मिट जाती है।',
  '“No mobile data in Imphal West” lives six hours. Reports are created with permissionless extension: anyone who sees the same thing can push the expiry out again with one tap, without being able to touch what it says. A rumour fades; a real blackout stays lit red.':
    '“Imphal West में मोबाइल डेटा नहीं” जैसी रिपोर्ट छह घंटे रहती है। रिपोर्टें ऐसे बनती हैं कि कोई भी बिना अनुमति उनकी अवधि बढ़ा सके: जो भी वही हाल देख रहा है, वह एक टैप से समय-सीमा फिर आगे कर सकता है, पर उसमें लिखी बात को छू नहीं सकता। अफ़वाह मिट जाती है; असली बंदी लाल चमकती रहती है।',
  'as long as someone cares': 'जब तक किसी को परवाह है',
  'The archive lives as long as anyone pays for it.': 'जब तक कोई इसका ख़र्च उठाए, संग्रह बना रहता है।',
  'An order filed here is written together with its permanent record, and both are sealed, in one transaction. The record is readonly and anyone can extend it: a library, a newsroom or a law school can keep India’s shutdown history alive without asking us, and without being able to rewrite it.':
    'यहाँ दर्ज आदेश अपने स्थायी रिकॉर्ड के साथ एक ही ट्रांज़ैक्शन में लिखा जाता है, और दोनों सील हो जाते हैं। रिकॉर्ड केवल-पढ़ने वाला है और कोई भी उसकी अवधि बढ़ा सकता है: कोई पुस्तकालय, न्यूज़रूम या लॉ स्कूल हमसे पूछे बिना भारत में इंटरनेट बंदी का इतिहास जीवित रख सकता है, और उसे दोबारा लिख नहीं सकता।',
  'The register': 'रजिस्टर',
  '{n} orders on file, from {states} states and territories, {from} to {to}.': '{states} राज्यों और केंद्र शासित प्रदेशों के {n} आदेश दर्ज, {from} से {to} तक।',
  'Each one transcribed from a published order or from reporting that cites one, with its sources. Click a state on the map, or open the full register to filter.':
    'हर आदेश किसी प्रकाशित आदेश से, या उसका हवाला देने वाली ख़बरों से, स्रोतों के साथ उतारा गया है। नक्शे पर किसी राज्य पर क्लिक करें, या छाँटने के लिए पूरा रजिस्टर खोलें।',
  'The archive is being written to Arkiv. {link} meanwhile.': 'संग्रह Arkiv पर लिखा जा रहा है। तब तक {link}।',
  'Try the drill': 'अभ्यास आज़माएँ',
  'See all {n} orders': 'सभी {n} आदेश देखें',
  'Year by year': 'साल-दर-साल',
  'Where the lights went out.': 'कहाँ-कहाँ बत्तियाँ बुझीं।',
  'Orders on file per state and year. It undercounts the real thing: many orders were never published, and Access Now counted 116 shutdowns in India in 2023 alone. Every order that does get filed can also be asked about at any past Arkiv block, long after it has lapsed.':
    'हर राज्य और हर साल के दर्ज आदेश। असल संख्या इससे ज़्यादा है: कई आदेश कभी प्रकाशित ही नहीं हुए, और Access Now ने अकेले 2023 में भारत में 116 इंटरनेट बंदियाँ गिनीं। जो आदेश दर्ज होता है, उसके बारे में Arkiv के किसी भी पुराने ब्लॉक पर पूछा जा सकता है, उसके समाप्त होने के बहुत बाद भी।',
  'Dark without an order': 'बिना आदेश के बंद',
  'The shutdowns nobody published.': 'वे इंटरनेट बंदियाँ, जिनका आदेश किसी ने प्रकाशित नहीं किया।',
  'The Supreme Court held in {case} (2020) that suspension orders must be published. When people report no internet in a district and no order is on the register, that district burns red on the map. Each red light is a question the state should answer.':
    'सर्वोच्च न्यायालय ने {case} (2020) में कहा कि निलंबन आदेश प्रकाशित होने चाहिए। जब लोग किसी ज़िले में इंटरनेट न होने की रिपोर्ट करते हैं और रजिस्टर पर कोई आदेश नहीं होता, तो वह ज़िला नक्शे पर लाल चमकता है। हर लाल बत्ती एक सवाल है, जिसका जवाब सरकार को देना चाहिए।',
  '{n} live report': '{n} ताज़ा रिपोर्ट',
  '{n} live reports': '{n} ताज़ा रिपोर्टें',
  'no order': 'कोई आदेश नहीं',
  'No district is reported dark without an order right now. If yours is, {link}: it takes one tap and no sign-up.':
    'इस समय कोई ज़िला बिना आदेश के बंद नहीं बताया गया है। अगर आपका ज़िला बंद है, तो {link}: बस एक टैप, कोई साइन-अप नहीं।',
  'say so': 'बताइए',
  'Why it can’t be switched off': 'इसे बंद क्यों नहीं किया जा सकता',
  'Block this site and the register is still there.': 'यह साइट ब्लॉक हो जाए, तब भी रजिस्टर बना रहता है।',
  'A shutdown tracker on one server is one blocking order away from disappearing. The register isn’t on our server: it is Arkiv entities that any copy of this page, any script, any newsroom can read straight from the network. This site only runs a small cache in front of Arkiv to stay inside its query quota, and the switch in the header turns even that off.':
    'एक सर्वर पर चलने वाला बंदी ट्रैकर एक ब्लॉकिंग आदेश से ग़ायब हो सकता है। रजिस्टर हमारे सर्वर पर नहीं है: ये Arkiv की एंटिटी हैं, जिन्हें इस पेज की कोई भी कॉपी, कोई भी स्क्रिप्ट, कोई भी न्यूज़रूम सीधे नेटवर्क से पढ़ सकता है। क्वेरी कोटा के भीतर रहने के लिए यह साइट Arkiv के आगे बस एक छोटा कैश चलाती है, और हेडर का स्विच उसे भी बंद कर देता है।',
  'Ask the network directly': 'सीधे नेटवर्क से पूछें',
  'One JSON-RPC call returns every order in force. No account and no Switched Off server in the middle (Arkiv meters keyless reads, so heavy users want their own free key).':
    'एक JSON-RPC कॉल हर लागू आदेश लौटा देती है। न खाता चाहिए, न बीच में Switched Off का सर्वर (Arkiv बिना कुंजी वाली रीड सीमित रखता है, इसलिए ज़्यादा इस्तेमाल करने वाले अपनी मुफ़्त कुंजी ले लें)।',
  'See the exact query': 'सटीक क्वेरी देखें',
  'Open a mirror': 'मिरर खोलें',
  'A one-file copy of the register that reads Arkiv from your browser. Save it, host it anywhere, email it: it keeps working.':
    'रजिस्टर की एक फ़ाइल वाली कॉपी, जो आपके ब्राउज़र से Arkiv को पढ़ती है। इसे सहेजें, कहीं भी होस्ट करें, ईमेल करें: यह चलती रहेगी।',
  'Get the mirror': 'मिरर लें',
  'Keep the history alive': 'इतिहास जीवित रखें',
  'Every record is sealed: owned by an address nobody holds, so nobody can delete it, us included. Anyone can extend it, so a lapsed order’s record can outlive this site.':
    'हर रिकॉर्ड सील है: वह एक ऐसे पते के नाम है जो किसी के पास नहीं, इसलिए उसे कोई नहीं मिटा सकता, हम भी नहीं। कोई भी उसकी अवधि बढ़ा सकता है, इसलिए समाप्त आदेश का रिकॉर्ड इस साइट के बाद भी बचा रह सकता है।',
  'Pick a record': 'कोई रिकॉर्ड चुनें',
  'India led the world in internet shutdowns six years running. Parliament asked for a register in 2021. There still isn’t an official one.':
    'लगातार छह साल भारत इंटरनेट बंदी में दुनिया में सबसे आगे रहा। संसद ने 2021 में एक रजिस्टर माँगा था। आज भी कोई आधिकारिक रजिस्टर नहीं है।',
  'The people it happens to are the last to be able to say so, and the government told Parliament it doesn’t count them. {link}, and what we deliberately keep off-chain to protect the people who use it.':
    'जिन पर यह बीतती है, वही सबसे आख़िर में इसके बारे में बता पाते हैं, और सरकार ने संसद से कहा कि वह इनकी गिनती नहीं रखती। {link}, और यह भी कि इस्तेमाल करने वालों की सुरक्षा के लिए हम जानबूझकर क्या-क्या ऑफ़-चेन रखते हैं।',
  'Read why this register exists': 'पढ़ें कि यह रजिस्टर क्यों है',
  // Register
  'Every suspension order on file.': 'दर्ज हर निलंबन आदेश।',
  'Read straight from Arkiv: each card is a readonly, sealed {record} entity. Orders still in force also exist as a short-lived {order} entity that disappears the moment the order lapses.':
    'सीधे Arkiv से पढ़ा गया: हर कार्ड एक केवल-पढ़ने वाली, सील की हुई {record} एंटिटी है। जो आदेश अभी लागू हैं, वे एक अल्पकालिक {order} एंटिटी के रूप में भी मौजूद हैं, जो आदेश समाप्त होते ही मिट जाती है।',
  'Seen one that isn’t here? Anyone can add it.': 'कोई आदेश देखा जो यहाँ नहीं है? कोई भी उसे जोड़ सकता है।',
  State: 'राज्य',
  'All states and UTs': 'सभी राज्य और केंद्र शासित प्रदेश',
  'Issued since': 'कब से जारी',
  'Any year': 'कोई भी साल',
  'Issued {y} or later': '{y} या उसके बाद जारी',
  'What was cut': 'क्या बंद किया गया',
  Anything: 'कुछ भी',
  Search: 'खोजें',
  'District, reason, authority': 'ज़िला, कारण, प्राधिकारी',
  'Which orders': 'कौन से आदेश',
  'All on file': 'सभी दर्ज',
  'In force now': 'अभी लागू',
  'Reading the register from Arkiv…': 'Arkiv से रजिस्टर पढ़ा जा रहा है…',
  '{n} of {total} orders': '{total} में से {n} आदेश',
  'query sent to Arkiv:': 'Arkiv को भेजी गई क्वेरी:',
  'Arkiv didn’t answer your browser directly ({error}).': 'Arkiv ने आपके ब्राउज़र को सीधे जवाब नहीं दिया ({error})।',
  'Arkiv didn’t answer through this site’s relay ({error}).': 'इस साइट के रिले के ज़रिए Arkiv ने जवाब नहीं दिया ({error})।',
  'Read through the relay instead': 'इसके बजाय रिले से पढ़ें',
  'Read Arkiv directly from your browser': 'अपने ब्राउज़र से सीधे Arkiv पढ़ें',
  'Open the record for {state}': '{state} का रिकॉर्ड खोलें',
  'No order on the register is in force right now. Know of one? {link}.': 'रजिस्टर का कोई आदेश इस समय लागू नहीं है। किसी आदेश के बारे में जानते हैं? {link}।',
  'File it': 'उसे दर्ज करें',
  'No order on file matches. Clear a filter, or {link}.': 'कोई दर्ज आदेश मेल नहीं खाता। कोई फ़िल्टर हटाएँ, या {link}।',
  'file one that’s missing': 'छूटा हुआ आदेश दर्ज करें',
  // what an order cuts, and network names
  'Mobile internet': 'मोबाइल इंटरनेट',
  Broadband: 'ब्रॉडबैंड',
  'All internet': 'पूरा इंटरनेट',
  'Internet, calls and SMS': 'इंटरनेट, कॉल और SMS',
  Internet: 'इंटरनेट',
  'All networks': 'सभी नेटवर्क',
  statewide: 'पूरा राज्य',
  Statewide: 'पूरा राज्य',
  '{n} districts': '{n} ज़िले',
  '{n}s ago': '{n} सेकंड पहले',
  '{n}m ago': '{n} मिनट पहले',
  '{n}h ago': '{n} घंटे पहले',
  '{n}d ago': '{n} दिन पहले',
  // Report
  'Signal’s back: sent {n} report you made while offline.': 'सिग्नल लौट आया: नेटवर्क न होने पर बनाई गई आपकी {n} रिपोर्ट भेज दी गई।',
  'Signal’s back: sent {n} reports you made while offline.': 'सिग्नल लौट आया: नेटवर्क न होने पर बनाई गई आपकी {n} रिपोर्टें भेज दी गईं।',
  'Pick your state and district first.': 'पहले अपना राज्य और ज़िला चुनें।',
  'Take out the phone number or ID: reports are public and permanent until they fade.': 'फ़ोन नंबर या पहचान संख्या हटा दें: रिपोर्टें सार्वजनिक होती हैं और मिटने तक बदली नहीं जा सकतीं।',
  'No connection. Your report is saved on this phone with the time you saw it, and goes out the moment the signal returns.':
    'नेटवर्क नहीं है। आपकी रिपोर्ट उस समय के साथ इसी फ़ोन में सहेज ली गई है जब आपने बंदी देखी, और सिग्नल लौटते ही भेज दी जाएगी।',
  'Filed on Arkiv. Neighbours can now confirm it.': 'Arkiv पर दर्ज हो गई। अब पड़ोसी इसकी पुष्टि कर सकते हैं।',
  'Arkiv could not be reached, so the report is saved here and will be sent when the connection is back.': 'Arkiv से संपर्क नहीं हो सका, इसलिए रिपोर्ट यहीं सहेज ली गई है और नेटवर्क लौटने पर भेज दी जाएगी।',
  'Report · drill (sandbox, not the live register)': 'रिपोर्ट · अभ्यास (सैंडबॉक्स, असली रजिस्टर नहीं)',
  'It fades in {time} unless someone nearby confirms it.': 'आस-पास कोई पुष्टि न करे तो यह {time} में मिट जाती है।',
  'six minutes': 'छह मिनट',
  '{n} hours': '{n} घंटे',
  'What are you seeing': 'आप क्या देख रहे हैं',
  'Mobile data gone since morning; broadband still working': 'सुबह से मोबाइल डेटा बंद; ब्रॉडबैंड चल रहा है',
  'That looks like {what}. Remove it: reports are public and permanent.': 'यह {what} जैसा लगता है। इसे हटा दें: रिपोर्टें सार्वजनिक और स्थायी होती हैं।',
  'Filed ✓ (one report per district is enough; neighbours confirm it)': 'दर्ज ✓ (हर ज़िले के लिए एक रिपोर्ट काफ़ी है; पड़ोसी उसकी पुष्टि करते हैं)',
  '{n} report saved on this phone, waiting for a connection.': '{n} रिपोर्ट इस फ़ोन में सहेजी गई है, नेटवर्क का इंतज़ार है।',
  '{n} reports saved on this phone, waiting for a connection.': '{n} रिपोर्टें इस फ़ोन में सहेजी गई हैं, नेटवर्क का इंतज़ार है।',
  'Filed as {key} in transaction {tx}, signed by {witness}.': '{key} के रूप में ट्रांज़ैक्शन {tx} में दर्ज, {witness} के हस्ताक्षर से।',
  'Witness {id}': 'गवाह {id}',
  'Your safety': 'आपकी सुरक्षा',
  'Reports carry no name, number or location finer than a district. The only link between this phone and what it filed is the throwaway key in this browser ({witness}). Forget it before handing your phone to anyone; your reports stay on the register, but nothing on the phone points to them.':
    'रिपोर्ट में न नाम होता है, न नंबर, और ज़िले से छोटी कोई जगह नहीं। इस फ़ोन और इससे दर्ज रिपोर्टों के बीच इकलौता संबंध इस ब्राउज़र की अस्थायी कुंजी है ({witness})। फ़ोन किसी को देने से पहले इसे भुला दें; आपकी रिपोर्टें रजिस्टर पर रहेंगी, पर फ़ोन में ऐसा कुछ नहीं बचेगा जो उनकी ओर इशारा करे।',
  'Forget this browser’s key? Reports you filed stay public, but you can no longer withdraw them from this phone.':
    'इस ब्राउज़र की कुंजी भुला दें? आपकी दर्ज रिपोर्टें सार्वजनिक रहेंगी, पर आप उन्हें इस फ़ोन से वापस नहीं ले सकेंगे।',
  'Forget this browser’s key': 'इस ब्राउज़र की कुंजी भुला दें',
  'Just trying it out? {link}: same entities, kept off the live map.': 'बस आज़मा रहे हैं? {link}: वही एंटिटी, पर असली नक्शे से अलग।',
  'Use the drill version of this form': 'इस फ़ॉर्म का अभ्यास वाला रूप इस्तेमाल करें',
  'Live reports in {state}': '{state} की ताज़ा रिपोर्टें',
  'No live reports in {state}. Reports fade unless confirmed, so this list only ever shows what people are seeing now.':
    '{state} से कोई ताज़ा रिपोर्ट नहीं। पुष्टि न होने पर रिपोर्टें मिट जाती हैं, इसलिए यह सूची सिर्फ़ वही दिखाती है जो लोग अभी देख रहे हैं।',
  'No live reports. Reports fade unless confirmed, so this list only ever shows what people are seeing now.':
    'कोई ताज़ा रिपोर्ट नहीं। पुष्टि न होने पर रिपोर्टें मिट जाती हैं, इसलिए यह सूची सिर्फ़ वही दिखाती है जो लोग अभी देख रहे हैं।',
  'Confirm or inspect': 'पुष्टि करें या देखें',
  // what personalData() names
  'a long number (a phone, Aadhaar or account number)': 'एक लंबी संख्या (फ़ोन, आधार या खाता नंबर)',
  'an email or UPI address': 'ईमेल या UPI पता',
  'an Aadhaar reference': 'आधार का ज़िक्र',
  "a person's name (use the designation, and cite a case without the parties' names)": 'किसी व्यक्ति का नाम (पद लिखें, और मुक़दमे का हवाला पक्षकारों के नाम के बिना दें)',
  // Entity page
  'renewal no. {n}, {date}': 'नवीनीकरण सं. {n}, {date}',
  'That isn’t an entity key.': 'यह एंटिटी कुंजी नहीं है।',
  'An Arkiv entity key is 0x followed by 64 hex characters. Check the link, or open the register and pick a record.': 'Arkiv एंटिटी कुंजी 0x के बाद 64 हेक्स अक्षरों की होती है। लिंक जाँचें, या रजिस्टर खोलकर कोई रिकॉर्ड चुनें।',
  Home: 'मुख्य पेज',
  'This entity has expired, or never existed.': 'यह एंटिटी समाप्त हो चुकी है, या कभी थी ही नहीं।',
  'On Arkiv, an order that has lapsed and a report nobody confirmed simply stop existing at their expiry block. The archive keeps a permanent record of every order; reports are meant to fade.':
    'Arkiv पर, समाप्त हो चुका आदेश और ऐसी रिपोर्ट जिसकी किसी ने पुष्टि नहीं की, अपने समाप्ति ब्लॉक पर बस मिट जाते हैं। संग्रह हर आदेश का स्थायी रिकॉर्ड रखता है; रिपोर्टें मिटने के लिए ही बनी हैं।',
  'Key {key}': 'कुंजी {key}',
  'Query a past block': 'किसी पुराने ब्लॉक पर क्वेरी करें',
  'Superseded by a correction': 'इसकी जगह अब सुधार है',
  'The registrar filed a correction for this record: its notes or sources quoted people’s names, or better sources improved its dates and links. The register shows the correction. This original is sealed and readonly, so it stays on Arkiv until it expires, but this site does not display its text.':
    'रजिस्ट्रार ने इस रिकॉर्ड का सुधार दर्ज किया: इसके नोट्स या स्रोतों में लोगों के नाम थे, या बेहतर स्रोतों से इसकी तारीख़ें और लिंक सुधरे। रजिस्टर सुधार दिखाता है। यह मूल रिकॉर्ड सील और केवल-पठनीय है, इसलिए समाप्त होने तक Arkiv पर रहता है, पर यह साइट इसका पाठ नहीं दिखाती।',
  'Open the correction': 'सुधार खोलें',
  'Citizen report on Arkiv': 'Arkiv पर नागरिक रिपोर्ट',
  'Permanent record on Arkiv': 'Arkiv पर स्थायी रिकॉर्ड',
  'Order in force on Arkiv': 'Arkiv पर लागू आदेश',
  'Entity key': 'एंटिटी कुंजी',
  'Explorer: its creation, and for sealed records the transfer to 0x…dEaD': 'एक्सप्लोरर: इसका बनना, और सील रिकॉर्ड के लिए 0x…dEaD को सौंपा जाना',
  Owner: 'मालिक',
  ' (you)': ' (आप)',
  ' · sealed: nobody holds this key, so nobody can delete it': ' · सील: यह कुंजी किसी के पास नहीं, इसलिए इसे कोई नहीं मिटा सकता',
  Creator: 'बनाने वाला',
  Expires: 'समाप्ति',
  'block {n}': 'ब्लॉक {n}',
  Flags: 'फ़्लैग',
  'Confirmed by': 'पुष्टि करने वाले',
  'Kept alive by': 'जीवित रखने वाले',
  '{n} other key ({list})': '{n} दूसरी कुंजी ({list})',
  '{n} other keys ({list})': '{n} दूसरी कुंजियाँ ({list})',
  'nobody yet': 'अभी तक कोई नहीं',
  Corrects: 'किसका सुधार',
  '(the original stays on Arkiv, unchanged)': '(मूल रिकॉर्ड Arkiv पर बिना बदले रहता है)',
  'Corrected by': 'सुधार',
  Renews: 'किसका नवीनीकरण',
  'Renewed by': 'नवीनीकरण',
  Head: 'ताज़ा ब्लॉक',
  'Seeing the same thing? Confirming pushes this report’s expiry six minutes from now. You can’t change what it says, and neither can its author. Each browser key counts once; it counts keys, not people.':
    'आप भी यही देख रहे हैं? पुष्टि करने से इस रिपोर्ट की समाप्ति अब से छह मिनट आगे हो जाती है। इसमें लिखी बात न आप बदल सकते हैं, न इसे लिखने वाला। हर ब्राउज़र कुंजी एक बार गिनी जाती है; यह कुंजियाँ गिनता है, लोग नहीं।',
  'Seeing the same thing? Confirming pushes this report’s expiry six hours from now. You can’t change what it says, and neither can its author. Each browser key counts once; it counts keys, not people.':
    'आप भी यही देख रहे हैं? पुष्टि करने से इस रिपोर्ट की समाप्ति अब से छह घंटे आगे हो जाती है। इसमें लिखी बात न आप बदल सकते हैं, न इसे लिखने वाला। हर ब्राउज़र कुंजी एक बार गिनी जाती है; यह कुंजियाँ गिनता है, लोग नहीं।',
  'Confirmed. The report stays up for another window.': 'पुष्टि हो गई। रिपोर्ट एक और अवधि तक बनी रहेगी।',
  'Writing to Arkiv…': 'Arkiv पर लिखा जा रहा है…',
  'You filed this: a neighbour has to confirm it': 'यह आपने दर्ज की है: पुष्टि किसी पड़ोसी को करनी होगी',
  'You already confirmed this': 'आप इसकी पुष्टि कर चुके हैं',
  'Still down here: confirm': 'यहाँ अब भी बंद है: पुष्टि करें',
  'You filed this report, so this browser’s key owns it: the one thing an owner of a readonly entity can still do is delete it. Withdrawing removes it from the register now; its creation stays readable at past blocks.':
    'यह रिपोर्ट आपने दर्ज की है, इसलिए इसकी मालिक इस ब्राउज़र की कुंजी है: केवल-पढ़ने वाली एंटिटी का मालिक बस एक ही काम कर सकता है, उसे मिटाना। वापस लेने पर यह अभी रजिस्टर से हट जाती है; इसका बनना पुराने ब्लॉक पर पढ़ा जा सकता है।',
  'Withdraw this report? It leaves the register at once.': 'यह रिपोर्ट वापस लें? यह तुरंत रजिस्टर से हट जाएगी।',
  'Withdrawn. The report is gone from the register.': 'वापस ले ली गई। रिपोर्ट रजिस्टर से हट गई है।',
  'Withdraw my report': 'मेरी रिपोर्ट वापस लें',
  'This record is readonly and anyone may extend it. Keeping it alive moves its expiry another drill day out, paid by your browser’s testnet wallet.':
    'यह रिकॉर्ड केवल-पढ़ने वाला है और कोई भी इसकी अवधि बढ़ा सकता है। इसे जीवित रखने से इसकी समाप्ति एक अभ्यास-दिन आगे हो जाती है, ख़र्च आपके ब्राउज़र का टेस्टनेट वॉलेट उठाता है।',
  'This record is readonly and anyone may extend it. Keeping it alive moves its expiry another year out, paid by your browser’s testnet wallet.':
    'यह रिकॉर्ड केवल-पढ़ने वाला है और कोई भी इसकी अवधि बढ़ा सकता है। इसे जीवित रखने से इसकी समाप्ति एक साल आगे हो जाती है, ख़र्च आपके ब्राउज़र का टेस्टनेट वॉलेट उठाता है।',
  'Thank you. This record now lives longer, whoever runs this site.': 'धन्यवाद। यह साइट कोई भी चलाए, यह रिकॉर्ड अब ज़्यादा समय तक रहेगा।',
  'Keep this record alive another drill day': 'इस रिकॉर्ड को एक अभ्यास-दिन और जीवित रखें',
  'Keep this record alive another year': 'इस रिकॉर्ड को एक साल और जीवित रखें',
  'Confirmed: the order now runs to its stated end.': 'पुष्टि हो गई: आदेश अब अपनी बताई गई अंतिम तारीख़ तक चलेगा।',
  'Confirm this emergency order': 'इस आपात आदेश की पुष्टि करें',
  'Written in transaction {tx}.': 'ट्रांज़ैक्शन {tx} में लिखा गया।',
  'Reproduce: {code} on Tiramisu, or see {link}.': 'ख़ुद जाँचें: Tiramisu पर {code} चलाएँ, या {link} देखें।',
  'the exact queries': 'सटीक क्वेरी',
  'readonly · anyone may extend': 'केवल-पढ़ने वाला · कोई भी अवधि बढ़ा सकता है',
  readonly: 'केवल-पढ़ने वाला',
  'readonly · only its filer may extend (confirm)': 'केवल-पढ़ने वाला · सिर्फ़ दर्ज करने वाला अवधि बढ़ा (पुष्टि कर) सकता है',
  editable: 'बदला जा सकता है',
  'Internet back': 'इंटरनेट वापस',
  Crawling: 'बहुत धीमा',
  ' · drill': ' · अभ्यास',
  'seen {ago}': '{ago} देखा गया',
  ' (sent once the signal came back)': ' (सिग्नल लौटने पर भेजी गई)',
  'Fades in {time} unless someone confirms it.': 'कोई पुष्टि न करे तो {time} में मिट जाएगी।',
  // write errors
  'This looks like it contains {what}. Remove it: everything on the register is public and permanent.': 'इसमें {what} लगता है। इसे हटा दें: रजिस्टर पर सब कुछ सार्वजनिक और स्थायी है।',
  'Arkiv refused the write: {detail}': 'Arkiv ने लिखने से मना कर दिया: {detail}',
  'This browser’s testnet wallet is out of gas. Try again in a minute: the gas tap refills it.': 'इस ब्राउज़र के टेस्टनेट वॉलेट में गैस ख़त्म हो गई है। एक मिनट बाद फिर कोशिश करें: गैस टैप इसे फिर भर देता है।',
  'Someone just extended it further than this would. Nothing to do.': 'किसी ने अभी-अभी इसकी अवधि इससे भी ज़्यादा बढ़ा दी है। कुछ करने की ज़रूरत नहीं।',
  'Only the filer’s key can do that.': 'यह सिर्फ़ दर्ज करने वाले की कुंजी कर सकती है।',
  'Arkiv didn’t answer in time. Your action was not written; try again.': 'Arkiv ने समय पर जवाब नहीं दिया। आपका काम दर्ज नहीं हुआ; फिर कोशिश करें।',
  'A source link must not contain an email address: everything on the register is public and permanent.': 'स्रोत के लिंक में ईमेल पता नहीं होना चाहिए: रजिस्टर पर सब कुछ सार्वजनिक और स्थायी है।',
  'Could not get testnet gas for this browser.': 'इस ब्राउज़र के लिए टेस्टनेट गैस नहीं मिल सकी।',
  // gas tap (server) messages, passed through as they arrive
  'That is not a wallet address.': 'यह वॉलेट पता नहीं है।',
  'The gas tap is not configured.': 'गैस टैप सेट नहीं है।',
  'The gas tap is not configured properly.': 'गैस टैप ठीक से सेट नहीं है।',
  'This browser was topped up a moment ago. Try again in a minute.': 'इस ब्राउज़र को अभी-अभी गैस मिली है। एक मिनट बाद फिर कोशिश करें।',
  'Many top-ups from this network just now. Try again in a few minutes.': 'इस नेटवर्क से अभी बहुत सारे टॉप-अप हुए हैं। कुछ मिनट बाद फिर कोशिश करें।',
  'The gas tap is busy this hour. Reading the register still works; try reporting again later.': 'इस घंटे गैस टैप व्यस्त है। रजिस्टर पढ़ना अब भी चलता है; रिपोर्ट थोड़ी देर बाद फिर करें।',
  'The gas tap is empty, so new reports are paused until it is refilled. Reading the register still works, and so does any Arkiv wallet of your own.':
    'गैस टैप ख़ाली है, इसलिए उसके फिर भरने तक नई रिपोर्टें रुकी हैं। रजिस्टर पढ़ना अब भी चलता है, और आपका अपना कोई Arkiv वॉलेट भी।',
  'Arkiv did not answer. Try again in a moment.': 'Arkiv ने जवाब नहीं दिया। थोड़ी देर में फिर कोशिश करें।',
  'The top-up was sent and is taking a while to land. Try your report again in a moment.': 'टॉप-अप भेज दिया गया है, पहुँचने में थोड़ा समय लग रहा है। थोड़ी देर में रिपोर्ट फिर भेजें।',
  'The testnet did not take the top-up. Try again in a moment.': 'टेस्टनेट ने टॉप-अप नहीं लिया। थोड़ी देर में फिर कोशिश करें।',
  'Arkiv did not answer.': 'Arkiv ने जवाब नहीं दिया।',
  // Drill
  'Renewal filed: a new order that takes over when the current one lapses.': 'नवीनीकरण दर्ज: एक नया आदेश, जो मौजूदा आदेश समाप्त होते ही लागू होगा।',
  'Emergency order filed. It dies in one drill day unless you confirm it.': 'आपात आदेश दर्ज। आप पुष्टि न करें तो यह एक अभ्यास-दिन में ख़त्म हो जाएगा।',
  'Order filed. Watch its districts go dark.': 'आदेश दर्ज। अब इसके ज़िलों को बंद होते देखिए।',
  'Drill · one legal day = one real minute': 'अभ्यास · क़ानून का एक दिन = असल का एक मिनट',
  'Run the register at the speed of a demo.': 'रजिस्टर को डेमो की रफ़्तार से चलाइए।',
  'Everything here is real Arkiv entities on Tiramisu, tagged {tag} and kept apart from the live register. Issue an order and its districts go dark; it lapses on its own when its last drill day ends. Make it an emergency order and it dies in one drill day unless you confirm it. Nothing to install: this browser has its own testnet key.':
    'यहाँ सब कुछ Tiramisu पर असली Arkiv एंटिटी है, {tag} टैग के साथ, असली रजिस्टर से अलग। आदेश जारी करें और उसके ज़िले बंद हो जाएँगे; आख़िरी अभ्यास-दिन ख़त्म होते ही वह अपने-आप समाप्त हो जाता है। इसे आपात आदेश बनाएँ तो पुष्टि न करने पर यह एक अभ्यास-दिन में ख़त्म हो जाएगा। कुछ इंस्टॉल नहीं करना: इस ब्राउज़र की अपनी टेस्टनेट कुंजी है।',
  '1 · Issue a suspension order': '1 · निलंबन आदेश जारी करें',
  'What is cut': 'क्या बंद होगा',
  'Districts ({n})': 'ज़िले ({n})',
  'whole state': 'पूरा राज्य',
  'Length: {n} drill day ({n} minute)': 'अवधि: {n} अभ्यास-दिन ({n} मिनट)',
  'Length: {n} drill days ({n} minutes)': 'अवधि: {n} अभ्यास-दिन ({n} मिनट)',
  'The rules cap an order at fifteen days, so the slider stops at fifteen.': 'नियमों के तहत कोई आदेश पंद्रह दिन से ज़्यादा नहीं चल सकता, इसलिए स्लाइडर पंद्रह पर रुकता है।',
  'Issued in an emergency (lapses after one drill day unless confirmed)': 'आपात स्थिति में जारी (पुष्टि न हो तो एक अभ्यास-दिन बाद समाप्त)',
  'Writing order + record in one batch…': 'आदेश और रिकॉर्ड एक साथ लिखे जा रहे हैं…',
  'Issue the order': 'आदेश जारी करें',
  '2 · Report from the ground': '2 · ज़मीन से रिपोर्ट करें',
  'Click any district on the map to report it dark. A report in a district with no order in force turns it red: a shutdown nobody published. Drill reports fade in six minutes unless confirmed.':
    'किसी ज़िले को बंद बताने के लिए नक्शे पर उस पर क्लिक करें। जिस ज़िले में कोई आदेश लागू नहीं, वहाँ की रिपोर्ट उसे लाल कर देती है: ऐसी बंदी जिसका आदेश किसी ने प्रकाशित नहीं किया। पुष्टि न हो तो अभ्यास की रिपोर्टें छह मिनट में मिट जाती हैं।',
  'Or use the {link} (that one files to the live register).': 'या {link} इस्तेमाल करें (वह असली रजिस्टर में दर्ज करता है)।',
  'report form': 'रिपोर्ट फ़ॉर्म',
  '3 · Your orders': '3 · आपके आदेश',
  ' · renewal {n}': ' · नवीनीकरण {n}',
  'lapses {time}': '{time} पर समाप्त',
  ' (unconfirmed)': ' (पुष्टि नहीं हुई)',
  'Confirmed: the order now runs its full length.': 'पुष्टि हो गई: आदेश अब अपनी पूरी अवधि चलेगा।',
  Confirm: 'पुष्टि करें',
  Renew: 'नवीनीकरण करें',
  'Last write: {tx}': 'आख़िरी बार लिखा: {tx}',
  'Drill map: pick a district to report it dark': 'अभ्यास का नक्शा: किसी ज़िले को बंद बताने के लिए उसे चुनें',
  'Report {district}, {state} as dark (drill)?': '{district}, {state} को बंद बताएँ (अभ्यास)?',
  ' An order is already in force here.': ' यहाँ पहले से एक आदेश लागू है।',
  ' No order is in force here, so it will burn red.': ' यहाँ कोई आदेश लागू नहीं, इसलिए यह लाल चमकेगा।',
  'Drill report filed for {district}.': '{district} के लिए अभ्यास रिपोर्ट दर्ज।',
  'Report it': 'रिपोर्ट करें',
  Cancel: 'रद्द करें',
  'Rewind the drill:': 'अभ्यास में पीछे जाकर देखें:',
  '{n} minute ago (querying Arkiv at block {block})': '{n} मिनट पहले (Arkiv से ब्लॉक {block} पर क्वेरी)',
  '{n} minutes ago (querying Arkiv at block {block})': '{n} मिनट पहले (Arkiv से ब्लॉक {block} पर क्वेरी)',
  '{n} minutes ago': '{n} मिनट पहले',
  now: 'अभी',
  'Arkiv answers queries as of any past block, so lapsed orders and faded reports reappear exactly as they were.': 'Arkiv किसी भी पुराने ब्लॉक के हिसाब से क्वेरी का जवाब देता है, इसलिए समाप्त आदेश और मिट चुकी रिपोर्टें ठीक वैसे ही फिर दिखती हैं जैसी वे थीं।',
  'Writing the report to Arkiv…': 'रिपोर्ट Arkiv पर लिखी जा रही है…',
  'Drill orders in force ({n})': 'लागू अभ्यास आदेश ({n})',
  'No drill order is in force. Issue one above and it appears here as a gazette page, counting down.': 'कोई अभ्यास आदेश लागू नहीं है। ऊपर से एक जारी करें, वह यहाँ गज़ट के पन्ने की तरह उलटी गिनती के साथ दिखेगा।',
  // File an order
  'Pick the state or UT.': 'राज्य या केंद्र शासित प्रदेश चुनें।',
  'Give the start date stated in the order.': 'आदेश में लिखी शुरुआत की तारीख़ भरें।',
  'The end date is before the start date.': 'अंतिम तारीख़ शुरुआत की तारीख़ से पहले है।',
  'Link the published order or reporting that cites it (https://…).': 'प्रकाशित आदेश का, या उसका हवाला देने वाली ख़बर का लिंक दें (https://…)।',
  'Paraphrase the reason the order gives.': 'आदेश में दिया गया कारण अपने शब्दों में लिखें।',
  'Remove {what}: the register is public.': '{what} हटा दें: रजिस्टर सार्वजनिक है।',
  'Use the designation (e.g. "Home Secretary, Government of Manipur"), not an official’s name.': 'अधिकारी का नाम नहीं, पद लिखें (जैसे "गृह सचिव, मणिपुर सरकार")।',
  'Filed and sealed in one transaction: the order is in force on the map until it lapses.': 'एक ही ट्रांज़ैक्शन में दर्ज और सील: आदेश समाप्त होने तक नक्शे पर लागू दिखेगा।',
  'Filed to the archive and sealed.': 'संग्रह में दर्ज और सील।',
  'Filed. The seal did not land: this browser still owns the record. Open it and try again, or leave it; it is readonly either way.':
    'दर्ज हो गया, पर सील नहीं लगी: रिकॉर्ड अब भी इस ब्राउज़र के पास है। इसे खोलकर फिर कोशिश करें, या ऐसे ही छोड़ दें; दोनों हालत में यह केवल-पढ़ने वाला है।',
  'File an order': 'आदेश दर्ज करें',
  'Transcribe a published order.': 'प्रकाशित आदेश को रजिस्टर में उतारें।',
  'Saw a suspension order in a gazette, a district’s website or the news? Put it on the register. It is signed by this browser’s key, labelled as a community transcription, and its archive copy is sealed straight away, so nobody can delete it afterwards, you included.':
    'किसी गज़ट, ज़िले की वेबसाइट या ख़बरों में निलंबन आदेश देखा? उसे रजिस्टर पर डालें। उस पर इस ब्राउज़र की कुंजी के हस्ताक्षर होते हैं, उसे सामुदायिक प्रतिलिपि के रूप में दिखाया जाता है, और उसकी संग्रह वाली कॉपी तुरंत सील हो जाती है, ताकि बाद में उसे कोई न मिटा सके, आप भी नहीं।',
  'An order whose end date is still ahead goes on the live map and lapses on its own.': 'जिस आदेश की अंतिम तारीख़ अभी आगे है, वह लाइव नक्शे पर आता है और अपने-आप समाप्त हो जाता है।',
  'Use the issuing authority’s designation, never an official’s name.': 'जारी करने वाले प्राधिकारी का पद लिखें, अधिकारी का नाम कभी नहीं।',
  'Paraphrase the stated reason; link the source.': 'बताया गया कारण अपने शब्दों में लिखें; स्रोत का लिंक दें।',
  'Got something wrong? File again: a correction is a new entity, and both are kept.': 'कुछ ग़लत हो गया? फिर से दर्ज करें: सुधार एक नई एंटिटी होता है, और दोनों रखे जाते हैं।',
  'Practising? The {link} uses the same entities without touching the live register.': 'अभ्यास कर रहे हैं? {link} वही एंटिटी इस्तेमाल करता है, असली रजिस्टर को छुए बिना।',
  drill: 'अभ्यास',
  'Districts named in the order ({n})': 'आदेश में लिखे ज़िले ({n})',
  Starts: 'शुरुआत',
  'Ends (as stated)': 'अंत (जैसा लिखा है)',
  '{n} days: longer than the fifteen days one order may run (since November 2020). If that is what the order says, file it as written; the register will show it.':
    '{n} दिन: एक आदेश की पंद्रह दिन की सीमा से ज़्यादा (नवंबर 2020 से)। अगर आदेश में यही लिखा है, तो जैसा लिखा है वैसा ही दर्ज करें; रजिस्टर इसे दिखाएगा।',
  'Issuing authority (designation)': 'जारी करने वाला प्राधिकारी (पद)',
  'Home Department, Government of Manipur': 'गृह विभाग, मणिपुर सरकार',
  'That looks like a person’s name. Use the designation.': 'यह किसी व्यक्ति का नाम लगता है। पद लिखें।',
  'Legal basis': 'क़ानूनी आधार',
  'Telecommunications (Temporary Suspension of Services) Rules, 2024': 'दूरसंचार (सेवाओं का अस्थायी निलंबन) नियम, 2024',
  'Temporary Suspension of Telecom Services Rules, 2017': 'दूरसंचार सेवाओं का अस्थायी निलंबन नियम, 2017',
  'Section 5(2), Indian Telegraph Act, 1885': 'धारा 5(2), भारतीय तार अधिनियम, 1885',
  'Section 144, Code of Criminal Procedure': 'धारा 144, दंड प्रक्रिया संहिता',
  'Section 163, Bharatiya Nagarik Suraksha Sanhita': 'धारा 163, भारतीय नागरिक सुरक्षा संहिता',
  'Legal basis not stated': 'क़ानूनी आधार नहीं बताया गया',
  'Other legal basis': 'अन्य क़ानूनी आधार',
  'Reason the order gives (paraphrase)': 'आदेश में दिया गया कारण (अपने शब्दों में)',
  'To prevent the spread of rumours on social media during unrest': 'अशांति के दौरान सोशल मीडिया पर अफ़वाहें फैलने से रोकने के लिए',
  'Source link': 'स्रोत का लिंक',
  'Source title': 'स्रोत का शीर्षक',
  'Home Department order no. …': 'गृह विभाग आदेश सं. …',
  'Was the order text published': 'क्या आदेश का पाठ प्रकाशित हुआ',
  'Text published': 'पाठ प्रकाशित',
  'Not published': 'प्रकाशित नहीं',
  'Don’t know': 'पता नहीं',
  'Writing order and record to Arkiv…': 'आदेश और रिकॉर्ड Arkiv पर लिखे जा रहे हैं…',
  'File this order': 'यह आदेश दर्ज करें',
  'Filed in {tx}. Record {record}': '{tx} में दर्ज। रिकॉर्ड {record}',
  'in force as {order}': '{order} के रूप में लागू',
  '.': '।',
  // Why
  'Why this exists': 'यह क्यों है',
  'When the internet goes off, the people it happens to are the last to be able to say so.': 'जब इंटरनेट बंद होता है, तो जिन पर यह बीतती है, वही सबसे आख़िर में इसके बारे में बता पाते हैं।',
  'Switched Off is built for India, where internet shutdowns are an administrative routine: exams, protests, unrest, festivals. These are the numbers, each with its source.':
    'Switched Off भारत के लिए बना है, जहाँ इंटरनेट बंदी प्रशासन का रोज़ का तरीक़ा बन चुकी है: परीक्षाएँ, विरोध प्रदर्शन, अशांति, त्योहार। ये रहे आँकड़े, हर एक अपने स्रोत के साथ।',
  // the facts (src/data/facts.ts)
  '1st': 'पहला',
  '212': '212',
  '~550': '~550',
  '0': '0',
  '2021': '2021',
  '$585M': '$585 मिलियन',
  'India ordered more internet shutdowns than any other country for six years running, 2018 to 2023 (134, 121, 109, 106, 84 and 116), and was second only to Myanmar in 2024 (84) and 2025 (65).':
    'लगातार छह साल, 2018 से 2023 तक, भारत ने दुनिया के किसी भी देश से ज़्यादा इंटरनेट बंदी के आदेश दिए (134, 121, 109, 106, 84 और 116), और 2024 (84) व 2025 (65) में वह सिर्फ़ म्यांमार से पीछे रहा।',
  'Access Now #KeepItOn, 2023 and 2024 reports': 'Access Now #KeepItOn, 2023 और 2024 की रिपोर्टें',
  'days of statewide shutdown in Manipur in 2023, covering about 3.2 million people: the longest in the world that year, kept going by a series of 44 orders.':
    'दिन, 2023 में मणिपुर में पूरे राज्य की इंटरनेट बंदी, जिसका असर लगभग 32 लाख लोगों पर पड़ा: उस साल दुनिया की सबसे लंबी बंदी, जिसे 44 आदेशों की कड़ी से जारी रखा गया।',
  'Access Now, 2023': 'Access Now, 2023',
  'days without 4G in Jammu and Kashmir, from August 2019 until 4G was restored across the territory on 5 February 2021.':
    'दिन जम्मू और कश्मीर में 4G नहीं रहा, अगस्त 2019 से 5 फ़रवरी 2021 तक, जब पूरे केंद्र शासित प्रदेश में 4G बहाल हुआ।',
  'Business Today': 'Business Today',
  'The Union government keeps no count. In 2023 the telecom department and the home ministry told Parliament they were “not aware of the number of internet shutdowns imposed by the States”.':
    'केंद्र सरकार कोई गिनती नहीं रखती। 2023 में दूरसंचार विभाग और गृह मंत्रालय ने संसद को बताया कि उन्हें “राज्यों द्वारा लगाई गई इंटरनेट बंदियों की संख्या की जानकारी नहीं है”।',
  'MediaNama, on the committee’s Action Taken Report': 'MediaNama, समिति की कार्रवाई रिपोर्ट पर',
  'Parliament’s IT committee recommended a centralised database of every shutdown, recording its duration, reasons and authority. No official one exists. Switched Off is an open, public version anyone can add to and nobody can quietly edit.':
    'संसद की IT समिति ने हर इंटरनेट बंदी का एक केंद्रीय डेटाबेस बनाने की सिफ़ारिश की, जिसमें उसकी अवधि, कारण और प्राधिकारी दर्ज हों। ऐसा कोई आधिकारिक डेटाबेस नहीं है। Switched Off इसका खुला, सार्वजनिक रूप है, जिसमें कोई भी जोड़ सकता है और कोई चुपचाप बदल नहीं सकता।',
  'PRS summary of the 26th Report': '26वीं रिपोर्ट का PRS सारांश',
  'what shutdowns cost India in 2023, across 7,812 hours of disruption, with Manipur the largest share. In 2020 the figure was $2.8 billion.':
    '2023 में इंटरनेट बंदी से भारत को हुआ नुक़सान, 7,812 घंटों की रुकावट में, जिसमें सबसे बड़ा हिस्सा मणिपुर का था। 2020 में यह आँकड़ा $2.8 अरब था।',
  'Top10VPN, via MediaNama': 'Top10VPN, MediaNama के ज़रिए',
  // who uses it
  'Who uses it, and what changes for them on day one': 'इसे कौन इस्तेमाल करता है, और पहले ही दिन उनके लिए क्या बदलता है',
  'People in a district that goes dark': 'जिस ज़िले में इंटरनेट बंद हो, वहाँ के लोग',
  'Today they find out a shutdown is “official” from a forwarded photo of a letter, if at all. On Switched Off they see whether an order exists, what it covers, and the minute it lapses. When there is no order, they can say so, and the report outlives the rumour mill only if neighbours confirm it.':
    'आज उन्हें बंदी के “आधिकारिक” होने का पता किसी चिट्ठी की फ़ॉरवर्ड की गई फ़ोटो से चलता है, अगर चलता भी है। Switched Off पर वे देख सकते हैं कि कोई आदेश है या नहीं, उसमें क्या-क्या शामिल है, और वह किस मिनट समाप्त होगा। आदेश न हो, तो वे यह बता सकते हैं, और उनकी रिपोर्ट अफ़वाहों से ज़्यादा तभी टिकती है जब पड़ोसी उसकी पुष्टि करें।',
  'Families and employers outside': 'बाहर रहने वाले परिवार और नियोक्ता',
  'A daughter in Pune can’t reach her parents in Churachandpur. The register tells her whether it is an order (and until when) or a local fault, and lets her file a report on their behalf.':
    'पुणे में रहने वाली एक बेटी चुराचांदपुर में अपने माता-पिता से बात नहीं कर पा रही। रजिस्टर उसे बताता है कि यह किसी आदेश की वजह से है (और कब तक) या कोई स्थानीय ख़राबी है, और वह उनकी ओर से रिपोर्ट भी दर्ज कर सकती है।',
  'Lawyers and digital-rights groups': 'वकील और डिजिटल अधिकार संगठन',
  'Challenges to shutdowns depend on knowing the order, its stated reason and how often it was renewed. The register links every renewal to the order before it, so “renewed 23 times” is a query, not a research project.':
    'इंटरनेट बंदी को चुनौती देने के लिए आदेश, उसमें बताया गया कारण और उसके नवीनीकरण की गिनती जानना ज़रूरी है। रजिस्टर हर नवीनीकरण को उससे पहले वाले आदेश से जोड़ता है, इसलिए “23 बार नवीनीकरण” एक क्वेरी है, कोई शोध परियोजना नहीं।',
  Journalists: 'पत्रकार',
  'Every claim on the site has a reproducible query and a source link, and every live change arrives on the wire with its block number, which makes the register citable.':
    'साइट के हर दावे के पीछे एक क्वेरी है जिसे कोई भी दोबारा चला सकता है, और स्रोत का लिंक है; हर ताज़ा बदलाव अपने ब्लॉक नंबर के साथ फ़ीड पर आता है। इसलिए रजिस्टर का हवाला दिया जा सकता है।',
  'Courts and review committees': 'अदालतें और समीक्षा समितियाँ',
  'The 2024 Rules require orders to be published and reviewed. A public, timestamped register of what was in force, and when, is the evidence base those reviews currently lack.':
    '2024 के नियमों के तहत आदेशों का प्रकाशन और उनकी समीक्षा ज़रूरी है। क्या लागू था और कब, इसका सार्वजनिक, समय-मुहर वाला रजिस्टर वही सबूत है जो इन समीक्षाओं के पास अभी नहीं है।',
  // what would break
  'Why Arkiv: what would break without it': 'Arkiv क्यों: इसके बिना क्या टूट जाएगा',
  'The register’s whole job is to be the one record of a shutdown that can’t be switched off, while obeying the law’s own clocks. Take Arkiv away and one of those two breaks.':
    'रजिस्टर का पूरा काम है इंटरनेट बंदी का ऐसा रिकॉर्ड बनना जिसे बंद न किया जा सके, और साथ ही क़ानून की अपनी घड़ियों का पालन करना। Arkiv हटा दें, तो इन दोनों में से एक टूट जाता है।',
  'Postgres behind our own API': 'हमारी अपनी API के पीछे Postgres',
  'One operator, one server, one blocking order under Section 69A, and the register is gone, along with the evidence it held. The operator can also be pressed to quietly edit or delete a record; nobody outside could prove it changed.':
    'एक संचालक, एक सर्वर, धारा 69A के तहत एक ब्लॉकिंग आदेश, और रजिस्टर ग़ायब, उसमें रखे सबूतों समेत। संचालक पर चुपचाप कोई रिकॉर्ड बदलने या मिटाने का दबाव भी डाला जा सकता है; बाहर कोई साबित नहीं कर पाएगा कि कुछ बदला।',
  IPFS: 'IPFS',
  'Good for the order’s PDF, useless for the question people ask: “what is in force in Manipur right now?” IPFS has no queries and no expiry. A lapsed order would sit there looking current forever.':
    'आदेश की PDF रखने के लिए अच्छा, पर लोगों के असली सवाल के लिए बेकार: “मणिपुर में अभी क्या लागू है?” IPFS में न क्वेरी है, न समाप्ति। समाप्त हो चुका आदेश वहाँ हमेशा मौजूदा जैसा दिखता रहेगा।',
  'A subgraph over a smart contract': 'स्मार्ट कॉन्ट्रैक्ट पर सबग्राफ़',
  'We would write a contract to hold records, run an indexer to query them, and still build expiry ourselves with a keeper bot. Arkiv gives typed, queryable attributes, expiry and per-entity permissions as the storage itself.':
    'हमें रिकॉर्ड रखने के लिए एक कॉन्ट्रैक्ट लिखना पड़ता, उन पर क्वेरी के लिए एक इंडेक्सर चलाना पड़ता, और फिर भी समाप्ति ख़ुद एक कीपर बॉट से बनानी पड़ती। Arkiv में टाइप वाले, क्वेरी हो सकने वाले एट्रिब्यूट, समाप्ति और हर एंटिटी की अलग अनुमतियाँ, सब स्टोरेज में ही मिलते हैं।',
  'One organisation’s tracker website': 'किसी एक संस्था की ट्रैकर वेबसाइट',
  'The best record today is SFLC.in’s internetshutdowns.in, which has counted 934 shutdowns. It is careful work, and it still depends on one team, one database and one domain: if any of them goes, so does the record, and readers can’t independently check that an entry was never changed.':
    'आज सबसे अच्छा रिकॉर्ड SFLC.in का internetshutdowns.in है, जिसने 934 इंटरनेट बंदियाँ गिनी हैं। यह बहुत सावधानी से किया गया काम है, फिर भी यह एक टीम, एक डेटाबेस और एक डोमेन पर टिका है: इनमें से कोई भी गया तो रिकॉर्ड भी जाएगा, और पाठक ख़ुद नहीं जाँच सकते कि कोई प्रविष्टि कभी बदली नहीं गई।',
  // kept off Arkiv
  'What we keep off Arkiv, on purpose': 'हम जानबूझकर क्या Arkiv से बाहर रखते हैं',
  'A permanent public dataset about shutdowns is also a dataset about the people living through them. These stay off-chain by design.':
    'इंटरनेट बंदी का स्थायी सार्वजनिक डेटासेट उन लोगों का डेटासेट भी है जो इसे झेल रहे हैं। ये चीज़ें सोच-समझकर ऑफ़-चेन रखी गई हैं।',
  'Who filed a report': 'रिपोर्ट किसने दर्ज की',
  'Reports are signed by a throwaway key generated in the browser. No name, phone number, Aadhaar or IP address is written to Arkiv, and the form refuses notes that look like a phone number or email. People reporting a shutdown in a conflict zone must not be identifiable from a public, permanent dataset.':
    'रिपोर्टों पर ब्राउज़र में बनी एक अस्थायी कुंजी के हस्ताक्षर होते हैं। Arkiv पर कोई नाम, फ़ोन नंबर, आधार या IP पता नहीं लिखा जाता, और फ़ॉर्म ऐसे नोट स्वीकार नहीं करता जो फ़ोन नंबर या ईमेल जैसे लगें। संघर्ष वाले इलाक़े से बंदी की रिपोर्ट करने वालों की पहचान किसी सार्वजनिक, स्थायी डेटासेट से नहीं होनी चाहिए।',
  'Exact locations': 'सटीक जगह',
  'District, never GPS. A district is enough to light the map and too coarse to find a person.': 'ज़िला, GPS कभी नहीं। नक्शा रोशन करने के लिए ज़िला काफ़ी है, और किसी व्यक्ति को ढूँढ़ने के लिए बहुत बड़ा।',
  'The full text and PDF of each order': 'हर आदेश का पूरा पाठ और PDF',
  'The register stores a short paraphrase of the stated reason, the authority’s designation (not officials’ names) and links to the published source. The PDF stays where the government or the press published it, and the source link is on every card.':
    'रजिस्टर बताए गए कारण का छोटा सार, प्राधिकारी का पद (अधिकारियों के नाम नहीं) और प्रकाशित स्रोत के लिंक रखता है। PDF वहीं रहती है जहाँ सरकार या मीडिया ने उसे प्रकाशित किया, और स्रोत का लिंक हर कार्ड पर है।',
  'The map, translations and site code': 'नक्शा, अनुवाद और साइट का कोड',
  'Those are presentation. They live on a static host and in the public repository; the data they draw does not depend on them.':
    'ये सिर्फ़ दिखाने का हिस्सा हैं। ये एक स्टैटिक होस्ट और सार्वजनिक रिपॉज़िटरी में रहते हैं; जो डेटा ये दिखाते हैं, वह इन पर निर्भर नहीं है।',
  // features table
  'Each Arkiv feature, and what it changes on screen': 'Arkiv की हर सुविधा, और स्क्रीन पर उससे क्या बदलता है',
  Feature: 'सुविधा',
  'How Switched Off uses it': 'Switched Off इसे कैसे इस्तेमाल करता है',
  'Where you see it': 'यह कहाँ दिखता है',
  Expiration: 'समाप्ति (Expiration)',
  'An order entity expires at its lapse block (an unconfirmed emergency order: 24 hours after issue). The map relights a district when its last order expires, with no server deciding.':
    'आदेश की एंटिटी अपने समाप्ति ब्लॉक पर ख़त्म हो जाती है (बिना पुष्टि वाला आपात आदेश: जारी होने के 24 घंटे बाद)। ज़िले का आख़िरी आदेश समाप्त होते ही नक्शा उसे फिर रोशन कर देता है, बिना किसी सर्वर के फ़ैसले के।',
  'Map, gazette countdowns': 'नक्शा, गज़ट की उलटी गिनती',
  'Lifetime extension': 'अवधि बढ़ाना (Lifetime extension)',
  'Confirming a report extends it (one confirmation per key, the filer can’t confirm their own); confirming an emergency order extends it to its stated end; keeping a record alive extends it a year. The entity page counts distinct keys from the extension transactions.':
    'रिपोर्ट की पुष्टि उसकी अवधि बढ़ाती है (हर कुंजी से एक पुष्टि, दर्ज करने वाला अपनी रिपोर्ट की पुष्टि नहीं कर सकता); आपात आदेश की पुष्टि उसे बताई गई अंतिम तारीख़ तक बढ़ाती है; रिकॉर्ड को जीवित रखना उसे एक साल बढ़ाता है। एंटिटी पेज अवधि बढ़ाने वाले ट्रांज़ैक्शन से अलग-अलग कुंजियाँ गिनता है।',
  'Confirm and Keep alive buttons, “confirmed by N keys”': '“पुष्टि करें” और “जीवित रखें” बटन, “N कुंजियों ने पुष्टि की”',
  'Creation flags': 'निर्माण फ़्लैग (Creation flags)',
  'Orders and reports are readonly. Reports and archive records add permissionless extension, so anyone may keep them alive but no one may change them.':
    'आदेश और रिपोर्टें केवल-पढ़ने वाली हैं। रिपोर्टों और संग्रह के रिकॉर्ड में बिना अनुमति अवधि बढ़ाने की सुविधा भी है, इसलिए कोई भी उन्हें जीवित रख सकता है, पर कोई बदल नहीं सकता।',
  'Flags on every entity page': 'हर एंटिटी पेज पर फ़्लैग',
  'Ownership transfer': 'मालिकाना हक़ सौंपना (Ownership transfer)',
  'Every archive record, and every non-emergency order filed on the site, is handed to 0x…dEaD in the same transaction that creates it (the keys are predicted from the account’s entity nonce). Readonly stops edits; an owner nobody holds stops deletion and stretching. That closes the gap readonly leaves.':
    'संग्रह का हर रिकॉर्ड, और साइट पर दर्ज हर ग़ैर-आपात आदेश, उसी ट्रांज़ैक्शन में 0x…dEaD को सौंप दिया जाता है जिसमें वह बनता है (कुंजियों का अनुमान खाते के एंटिटी nonce से लगाया जाता है)। Readonly बदलाव रोकता है; ऐसा मालिक जो किसी के पास नहीं, मिटाना और अवधि खींचना रोकता है। Readonly जो कमी छोड़ता है, वह इससे पूरी हो जाती है।',
  '“Sealed” on every gazette and entity page': 'हर गज़ट और एंटिटी पेज पर “सील”',
  'Attributes vs payload': 'एट्रिब्यूट बनाम पेलोड',
  'Everything we filter or sort on is a typed attribute: state, district, scope, net, issued/starts/ends as u64 timestamps, seq. Reason text, authority and sources sit in the JSON payload because nobody queries them.':
    'जिस भी चीज़ से हम छाँटते या क्रम लगाते हैं, वह टाइप वाला एट्रिब्यूट है: state, district, scope, net, u64 टाइमस्टैम्प के रूप में issued/starts/ends, और seq। कारण का पाठ, प्राधिकारी और स्रोत JSON पेलोड में रहते हैं, क्योंकि उन पर कोई क्वेरी नहीं करता।',
  'Register filters, state pages': 'रजिस्टर के फ़िल्टर, राज्य वाले पेज',
  Queries: 'क्वेरी (Queries)',
  'Typed equality (state) and u64 range queries (issued since a year) run on Arkiv, paged in 200s, and the register prints the exact query it sent; atBlock for history. A correction counts only when it comes from the registrar or from the record’s own filer.':
    'टाइप वाली बराबरी (state) और u64 रेंज क्वेरी (किसी साल से जारी) Arkiv पर चलती हैं, 200-200 के पन्नों में, और रजिस्टर वही सटीक क्वेरी दिखाता है जो उसने भेजी; इतिहास के लिए atBlock। सुधार तभी माना जाता है जब वह रजिस्ट्रार से या रिकॉर्ड दर्ज करने वाले से आए।',
  'Register filters and their query line, the rewind slider': 'रजिस्टर के फ़िल्टर और उनकी क्वेरी वाली लाइन, पीछे ले जाने वाला स्लाइडर',
  '$owner / $creator': '$owner / $creator',
  'After sealing they differ: $owner is 0x…dEaD, $creator is who filed it. Registrar filings and community transcriptions (the File an order page) are labelled by $creator.':
    'सील होने के बाद दोनों अलग होते हैं: $owner 0x…dEaD है, $creator वह है जिसने दर्ज किया। रजिस्ट्रार की प्रविष्टियाँ और सामुदायिक प्रतिलिपियाँ (“आदेश दर्ज करें” पेज) $creator से पहचानी जाती हैं।',
  'Gazette footer, entity page': 'गज़ट का निचला हिस्सा, एंटिटी पेज',
  'Entity events': 'एंटिटी घटनाएँ (Entity events)',
  'The live wire and the map react to EntityCreated and ExpiryExtended events over Arkiv’s WebSocket (a subscription costs no query budget); if the socket can’t open, a node-side filter is polled through our relay. Expiry has no event, so the next re-read is timed to the soonest expiry on screen.':
    'ताज़ा हलचल और नक्शा Arkiv के WebSocket पर EntityCreated और ExpiryExtended घटनाओं पर प्रतिक्रिया देते हैं (सब्सक्रिप्शन से क्वेरी बजट ख़र्च नहीं होता); सॉकेट न खुले तो हमारे रिले से नोड पर लगा फ़िल्टर बार-बार जाँचा जाता है। समाप्ति की कोई घटना नहीं होती, इसलिए अगली बार पढ़ने का समय स्क्रीन पर सबसे जल्दी होने वाली समाप्ति के हिसाब से तय होता है।',
  'Live wire, map refresh': 'ताज़ा हलचल, नक्शे का रिफ़्रेश',
  'Batch writes': 'बैच में लिखना (Batch writes)',
  'An order, its permanent record and the ownership transfers that seal them are one transaction, so there is never an order without its archive copy, or a record anyone could delete.':
    'आदेश, उसका स्थायी रिकॉर्ड और उन्हें सील करने वाले मालिकाना हस्तांतरण, सब एक ही ट्रांज़ैक्शन हैं, इसलिए कभी ऐसा आदेश नहीं होता जिसकी संग्रह-कॉपी न हो, या ऐसा रिकॉर्ड जिसे कोई मिटा सके।',
  'Issue order (drill), File an order, archive import': 'आदेश जारी करना (अभ्यास), आदेश दर्ज करना, संग्रह का आयात',
  Delete: 'हटाना (Delete)',
  'The one thing an owner of a readonly entity can still do. A report’s filer can withdraw it; nobody can delete a sealed record, because nobody owns it.':
    'केवल-पढ़ने वाली एंटिटी का मालिक बस यही एक काम कर सकता है। रिपोर्ट दर्ज करने वाला उसे वापस ले सकता है; सील रिकॉर्ड को कोई नहीं मिटा सकता, क्योंकि उसका कोई मालिक नहीं।',
  '“Withdraw my report” on your own reports': 'आपकी अपनी रिपोर्टों पर “मेरी रिपोर्ट वापस लें”',
  // honest limits
  'Honest limits': 'ईमानदार सीमाएँ',
  'What this is not, yet.': 'यह अभी क्या नहीं है।',
  'It is on a testnet': 'यह टेस्टनेट पर है',
  'Tiramisu is Arkiv’s public testnet. Entities can outlive this site, but the network makes no durability promise yet. The design moves unchanged to Arkiv mainnet.':
    'Tiramisu, Arkiv का सार्वजनिक टेस्टनेट है। एंटिटी इस साइट के बाद भी रह सकती हैं, पर नेटवर्क अभी टिकाऊपन का कोई वादा नहीं करता। यही डिज़ाइन बिना बदले Arkiv मेननेट पर चल सकता है।',
  'One public endpoint, many possible': 'एक सार्वजनिक एंडपॉइंट, पर कई हो सकते हैं',
  'The site, mirror and CLI default to Arkiv’s public RPC. Each takes another endpoint (?rpc= in the mirror, ARKIV_RPC for the CLI), so anyone running an Arkiv node can serve the register without asking anyone.':
    'साइट, मिरर और CLI डिफ़ॉल्ट रूप से Arkiv का सार्वजनिक RPC इस्तेमाल करते हैं। हर एक दूसरा एंडपॉइंट भी ले सकता है (मिरर में ?rpc=, CLI के लिए ARKIV_RPC), इसलिए Arkiv नोड चलाने वाला कोई भी, किसी से पूछे बिना, रजिस्टर उपलब्ध करा सकता है।',
  'The register is only as complete as its transcribers': 'रजिस्टर उतना ही पूरा है, जितना उसे दर्ज करने वाले बनाते हैं',
  '187 orders are on file; Access Now counted 116 shutdowns in India in 2023 alone. The File an order page lets anyone add the rest, labelled as community transcriptions.':
    '187 आदेश दर्ज हैं; Access Now ने अकेले 2023 में भारत में 116 इंटरनेट बंदियाँ गिनीं। “आदेश दर्ज करें” पेज से कोई भी बाक़ी आदेश जोड़ सकता है, जो सामुदायिक प्रतिलिपि के रूप में दिखते हैं।',
  'Reporting needs a signal, and a key': 'रिपोर्ट के लिए सिग्नल चाहिए, और एक कुंजी',
  'During a mobile-data cut, people on broadband or Wi-Fi can still report, and the offline queue sends reports when the signal returns. The gas tap runs on this site; a mirror can read the register but not fund new keys. Your browser key links your phone to your reports until you forget it (button on the Report page).':
    'मोबाइल डेटा बंद होने पर भी ब्रॉडबैंड या वाई-फ़ाई वाले लोग रिपोर्ट कर सकते हैं, और ऑफ़लाइन कतार सिग्नल लौटने पर रिपोर्टें भेज देती है। गैस टैप इसी साइट पर चलता है; मिरर रजिस्टर पढ़ सकता है, पर नई कुंजियों को गैस नहीं दे सकता। आपकी ब्राउज़र कुंजी आपके फ़ोन को आपकी रिपोर्टों से तब तक जोड़ती है, जब तक आप उसे भुला न दें (रिपोर्ट पेज पर बटन है)।',
  'Keys are not people': 'कुंजियाँ लोग नहीं हैं',
  'A confirmation is one extension per key, and keys are free: one person with several browsers can inflate “confirmed by N keys”. The count is a signal, not proof; a report is still a question for the state to answer, not a verdict.':
    'हर कुंजी से एक ही पुष्टि होती है, और कुंजियाँ मुफ़्त हैं: कई ब्राउज़र वाला एक व्यक्ति “N कुंजियों ने पुष्टि की” को बढ़ा सकता है। यह गिनती एक संकेत है, सबूत नहीं; रिपोर्ट अब भी सरकार से पूछा गया सवाल है, कोई फ़ैसला नहीं।',
  'Anyone can write to the app’s namespace': 'ऐप के नेमस्पेस में कोई भी लिख सकता है',
  'Arkiv has no schema owner, so anyone can write entities tagged like ours. The readers defend themselves: a correction hides a record only if it comes from the registrar or the record’s own filer, a community order darkens the map only within the law’s fifteen-day cap, and every entity shows its $creator.':
    'Arkiv में स्कीमा का कोई मालिक नहीं, इसलिए कोई भी हमारे जैसे टैग वाली एंटिटी लिख सकता है। पढ़ने वाला कोड अपना बचाव ख़ुद करता है: सुधार किसी रिकॉर्ड को तभी छिपाता है जब वह रजिस्ट्रार से या रिकॉर्ड दर्ज करने वाले से आए, सामुदायिक आदेश नक्शे को सिर्फ़ क़ानून की पंद्रह दिन की सीमा के भीतर बंद दिखाता है, और हर एंटिटी अपना $creator दिखाती है।',
  'Public court records, not private people': 'सार्वजनिक अदालती रिकॉर्ड, निजी लोग नहीं',
  'Orders cite reported cases and judgments as sources. Nobody is named in a record (designations only); an early batch of notes quoted case titles with parties’ and judges’ names, and those records have been corrected with name-free notes. The originals are sealed and readable until they expire, which is the price of an archive nobody can edit.':
    'आदेश स्रोत के रूप में प्रकाशित मुक़दमों और फ़ैसलों का हवाला देते हैं। किसी रिकॉर्ड में किसी का नाम नहीं (सिर्फ़ पद); शुरुआती नोट्स के एक बैच में मुक़दमों के शीर्षक पक्षकारों और जजों के नामों के साथ थे, और उन रिकॉर्ड को बिना नाम वाले नोट्स से सुधार दिया गया है। मूल रिकॉर्ड सील हैं और समाप्त होने तक पढ़े जा सकते हैं; ऐसे संग्रह की यही क़ीमत है, जिसे कोई बदल नहीं सकता।',
  // sources
  Sources: 'स्रोत',
  'Every order on the register carries its own source links. The archive was transcribed from published orders, court records and reporting that cites them; {n} orders are on file.':
    'रजिस्टर के हर आदेश के साथ उसके अपने स्रोत-लिंक हैं। संग्रह प्रकाशित आदेशों, अदालती रिकॉर्ड और उनका हवाला देने वाली ख़बरों से उतारा गया है; {n} आदेश दर्ज हैं।',
  'Check the queries': 'क्वेरी जाँचें',
  // Data & mirrors
  'Don’t trust this site. Ask the network.': 'इस साइट पर भरोसा मत कीजिए। नेटवर्क से पूछिए।',
  'Every number on Switched Off comes from one of the queries below. Run them yourself against Arkiv’s Tiramisu testnet: no key, no account, no Switched Off server in between.':
    'Switched Off का हर आँकड़ा नीचे दी गई किसी न किसी क्वेरी से आता है। इन्हें ख़ुद Arkiv के Tiramisu टेस्टनेट पर चलाइए: न कुंजी, न खाता, न बीच में Switched Off का कोई सर्वर।',
  Explorer: 'एक्सप्लोरर',
  '{records} records · {orders} in force · {reports} live reports': '{records} रिकॉर्ड · {orders} लागू · {reports} ताज़ा रिपोर्टें',
  'reading Arkiv…': 'Arkiv पढ़ा जा रहा है…',
  'Orders in force right now': 'इस समय लागू आदेश',
  'The map’s dark districts and “orders in force now”. An order entity exists only until its lapse block, so no date filter is needed: being alive is being in force.':
    'नक्शे के बंद ज़िले और “आदेश अभी लागू”। आदेश की एंटिटी सिर्फ़ अपने समाप्ति ब्लॉक तक रहती है, इसलिए तारीख़ के फ़िल्टर की ज़रूरत नहीं: मौजूद होना ही लागू होना है।',
  'The whole archive': 'पूरा संग्रह',
  'The register page and the year-by-year table. Readonly records anyone can extend.': 'रजिस्टर वाला पेज और साल-दर-साल की तालिका। केवल-पढ़ने वाले रिकॉर्ड, जिनकी अवधि कोई भी बढ़ा सकता है।',
  'Every order ever filed for Manipur': 'मणिपुर के लिए अब तक दर्ज हर आदेश',
  'Filter by state code on an attribute, not by reading payloads.': 'राज्य कोड से एट्रिब्यूट पर छाँटें, पेलोड पढ़कर नहीं।',
  'Live citizen reports': 'नागरिकों की ताज़ा रिपोर्टें',
  'Red districts. A report is alive only while someone keeps confirming it.': 'लाल ज़िले। रिपोर्ट तभी तक मौजूद रहती है जब तक कोई उसकी पुष्टि करता रहे।',
  'Orders issued after a date': 'किसी तारीख़ के बाद जारी आदेश',
  'Timestamps are u64 attributes, so ranges are a query, not a scan. Note the u64(…) tag: a bare number is read as i32 and silently matches nothing (see friction.md).':
    'टाइमस्टैम्प u64 एट्रिब्यूट हैं, इसलिए रेंज एक क्वेरी है, पूरा डेटा छानना नहीं। u64(…) टैग पर ध्यान दें: अकेली संख्या i32 मानी जाती है और चुपचाप किसी से मेल नहीं खाती (friction.md देखें)।',
  'Evidence that survives expiry': 'सबूत जो समाप्ति के बाद भी बचा रहता है',
  'Lapsed orders vanish from the present, not from history. On 11 Oct we filed a drill order that lived 30 blocks: entity {key}, created at block 437,835. Run the first query and it is gone; run the second, the same query at block 437,835, and it is there. The drill’s rewind slider and the CLI’s {at} command do exactly this.':
    'समाप्त आदेश वर्तमान से ग़ायब होते हैं, इतिहास से नहीं। 11 अक्टूबर को हमने एक अभ्यास आदेश दर्ज किया जो 30 ब्लॉक तक रहा: एंटिटी {key}, ब्लॉक 437,835 पर बनी। पहली क्वेरी चलाइए, वह नहीं मिलेगी; दूसरी चलाइए, यानी वही क्वेरी ब्लॉक 437,835 पर, और वह मौजूद है। अभ्यास का पीछे ले जाने वाला स्लाइडर और CLI का {at} कमांड ठीक यही करते हैं।',
  'Nobody can delete the archive': 'संग्रह को कोई नहीं मिटा सकता',
  'Every live record is owned by {dead}, an address nobody holds a key for, while its {creator} still shows who filed it. Only an owner can delete an entity, so these can only expire, and anyone can extend them. This query should return all of them:':
    'हर असली रिकॉर्ड का मालिक {dead} है, एक ऐसा पता जिसकी कुंजी किसी के पास नहीं, जबकि उसका {creator} अब भी दिखाता है कि उसे किसने दर्ज किया। एंटिटी को सिर्फ़ उसका मालिक मिटा सकता है, इसलिए ये सिर्फ़ समाप्त हो सकते हैं, और कोई भी इनकी अवधि बढ़ा सकता है। यह क्वेरी इन सबको लौटाएगी:',
  'Who filed it': 'किसने दर्ज किया',
  'Every entity carries its {creator} and {owner}. Orders from the Switched Off registrar come from these addresses; anything else is a community transcription, labelled as such.':
    'हर एंटिटी के साथ उसका {creator} और {owner} होता है। Switched Off रजिस्ट्रार के आदेश इन पतों से आते हैं; बाक़ी सब सामुदायिक प्रतिलिपि है, और ऐसा ही लिखा होता है।',
  'Mirrors and the command line': 'मिरर और कमांड लाइन',
  'If this site is blocked, the register isn’t. Three ways to read it without us:': 'यह साइट ब्लॉक हो जाए, तब भी रजिस्टर ब्लॉक नहीं होता। हमारे बिना इसे पढ़ने के तीन तरीक़े:',
  'One-file mirror': 'एक फ़ाइल वाला मिरर',
  'A single HTML file, about 10 KB, that reads orders and reports straight from Arkiv in the browser. Save it, put it on any host, send it on WhatsApp.':
    'लगभग 10 KB की एक HTML फ़ाइल, जो ब्राउज़र में सीधे Arkiv से आदेश और रिपोर्टें पढ़ती है। इसे सहेजें, किसी भी होस्ट पर डालें, WhatsApp पर भेजें।',
  'Download mirror.html': 'mirror.html डाउनलोड करें',
  'Open it here': 'इसे यहाँ खोलें',
  'Independent copy': 'स्वतंत्र कॉपी',
  'The same mirror, served by GitHub Pages from the repository, on a different company’s servers and domain.': 'वही मिरर, रिपॉज़िटरी से GitHub Pages पर, किसी दूसरी कंपनी के सर्वर और डोमेन पर।',
  'Open the GitHub Pages mirror': 'GitHub Pages वाला मिरर खोलें',
  'Command line': 'कमांड लाइन',
  'A zero-dependency Node script in the repo.': 'रिपॉज़िटरी में एक Node स्क्रिप्ट, जिसे किसी और पैकेज की ज़रूरत नहीं।',
  'Full entity schema: {schema}. What was hard: {friction}. {why}': 'पूरा एंटिटी स्कीमा: {schema}। क्या मुश्किल रहा: {friction}। {why}',
  'Why Arkiv, and what we keep off it.': 'Arkiv क्यों, और हम उससे क्या बाहर रखते हैं।',
  // network brands stay as they are
  Jio: 'Jio',
  Airtel: 'Airtel',
  Vi: 'Vi',
  BSNL: 'BSNL',
  // Gazette
  'Order: {state}, {districts}': 'आदेश: {state}, {districts}',
  'Drill Gazette': 'अभ्यास गज़ट',
  'Register of Suspension Orders': 'निलंबन आदेशों का रजिस्टर',
  'Issuing authority not recorded': 'जारी करने वाले प्राधिकारी का उल्लेख नहीं',
  'Unofficial transcription, not the Gazette of India': 'अनौपचारिक प्रतिलिपि, भारत का राजपत्र नहीं',
  LAPSED: 'समाप्त',
  EMERGENCY: 'आपात',
  'IN FORCE': 'लागू',
  '{list} and {n} more': '{list} और {n} अन्य',
  '{scope} suspended for {n} day': '{scope} {n} दिन के लिए निलंबित',
  '{scope} suspended for {n} days': '{scope} {n} दिन के लिए निलंबित',
  '{scope} suspended for {n} drill day': '{scope} {n} अभ्यास-दिन के लिए निलंबित',
  '{scope} suspended for {n} drill days': '{scope} {n} अभ्यास-दिन के लिए निलंबित',
  '{scope} suspended, with no end date stated': '{scope} निलंबित, कोई अंतिम तारीख़ नहीं बताई गई',
  ', renewal no. {n}': ', नवीनीकरण सं. {n}',
  'end not stated': 'अंत नहीं बताया गया',
  'Lapsed {date}': '{date} को समाप्त',
  Lapsed: 'समाप्त',
  'Lapses in {time}': '{time} में समाप्त',
  'Under: {basis}': 'आधार: {basis}',
  'Issued in an emergency: lapses at {time} unless the competent authority confirms it.': 'आपात स्थिति में जारी: सक्षम प्राधिकारी पुष्टि न करे तो {time} पर समाप्त।',
  'The order text was not published.': 'आदेश का पाठ प्रकाशित नहीं किया गया।',
  'Whether the order text was published: not known.': 'आदेश का पाठ प्रकाशित हुआ या नहीं: पता नहीं।',
  'This entry corrects an earlier record, which stays on Arkiv unchanged.': 'यह प्रविष्टि एक पुराने रिकॉर्ड का सुधार है, जो Arkiv पर बिना बदले रहता है।',
  'Sealed: owned by an address nobody holds a key for, so nobody can edit or delete it. Anyone can keep it alive.': 'सील: इसका मालिक एक ऐसा पता है जिसकी कुंजी किसी के पास नहीं, इसलिए इसे कोई बदल या मिटा नहीं सकता। कोई भी इसे जीवित रख सकता है।',
  'Not sealed yet: its filer can still delete it.': 'अभी सील नहीं: दर्ज करने वाला अब भी इसे मिटा सकता है।',
  'Note: {notes}': 'नोट: {notes}',
  'Filed by the Switched Off registrar': 'Switched Off रजिस्ट्रार द्वारा दर्ज',
  'Filed by a community transcriber': 'एक सामुदायिक प्रतिलिपिकार द्वारा दर्ज',
  'Source:': 'स्रोत:',
  // Cite and RTI
  'Copy': 'कॉपी करें',
  'Copied ✓': 'कॉपी हो गया ✓',
  'Copied.': 'कॉपी हो गया।',
  'Copied:': 'कॉपी हुआ:',
  'Couldn’t copy. Select the text and copy it yourself.': 'कॉपी नहीं हो सका। पाठ चुनकर ख़ुद कॉपी करें।',
  'Cite this order': 'इस आदेश का हवाला दें',
  'For a petition, a news story or a letter: the link, a citation that says where the record lives on Arkiv, and one command that reads it back from the network without this site.':
    'याचिका, ख़बर या पत्र के लिए: लिंक, एक हवाला जो बताता है कि रिकॉर्ड Arkiv पर कहाँ है, और एक कमांड जो इस साइट के बिना उसे सीधे नेटवर्क से दोबारा पढ़ती है।',
  'Permalink': 'स्थायी लिंक',
  'Citation': 'हवाला',
  'Re-read it from Arkiv': 'इसे Arkiv से दोबारा पढ़ें',
  'Runs in any shell with curl. Arkiv answers with the entity as stored: its payload comes back hex-encoded JSON, its owner, creator and expiry block as they are on the chain.':
    'curl वाले किसी भी शेल में चलती है। Arkiv एंटिटी को वैसे ही लौटाता है जैसे वह दर्ज है: उसका पेलोड हेक्स-एन्कोडेड JSON में, और उसका मालिक, बनाने वाला और समाप्ति ब्लॉक वैसे जैसे चेन पर हैं।',
  '{from} to {to}': '{from} से {to} तक',
  'from {from}, end not stated': '{from} से, समाप्ति नहीं बताई गई',
  'Internet suspension order: {state}, {districts}.': 'इंटरनेट निलंबन आदेश: {state}, {districts}।',
  'Issuing authority: {authority}.': 'जारी करने वाला प्राधिकारी: {authority}।',
  'not recorded': 'दर्ज नहीं',
  'districts not recorded': 'ज़िले दर्ज नहीं',
  'date not recorded': 'तारीख़ दर्ज नहीं',
  'Order: {id}.': 'आदेश: {id}।',
  'Register entry: {id} (the order’s own number is not recorded).': 'रजिस्टर प्रविष्टि: {id} (आदेश की अपनी संख्या दर्ज नहीं है)।',
  'In force: {when}; issued {issued}.': 'लागू: {when}; जारी {issued}।',
  'What was cut: {scope}.': 'क्या बंद किया गया: {scope}।',
  'Legal basis: {basis}.': 'क़ानूनी आधार: {basis}।',
  'Order text: published.': 'आदेश का पाठ: प्रकाशित।',
  'Order text: not published.': 'आदेश का पाठ: प्रकाशित नहीं।',
  'Order text: whether it was published is not known.': 'आदेश का पाठ: प्रकाशित हुआ या नहीं, पता नहीं।',
  'This is a drill entity, not the live register.': 'यह अभ्यास की एंटिटी है, असली रजिस्टर नहीं।',
  'Switched Off register, Arkiv Tiramisu entity {key}, created at block {block}, sealed.': 'Switched Off रजिस्टर, Arkiv Tiramisu एंटिटी {key}, ब्लॉक {block} पर बनी, सील।',
  'Switched Off register, Arkiv Tiramisu entity {key}, created at block {block}, not sealed.': 'Switched Off रजिस्टर, Arkiv Tiramisu एंटिटी {key}, ब्लॉक {block} पर बनी, सील नहीं।',
  'Filed by the Switched Off registrar ({creator}).': 'Switched Off रजिस्ट्रार ({creator}) द्वारा दर्ज।',
  'Filed by a community transcriber ({creator}), not the registrar.': 'एक सामुदायिक प्रतिलिपिकार ({creator}) द्वारा दर्ज, रजिस्ट्रार द्वारा नहीं।',
  'Sources:': 'स्रोत:',
  'Sources: none recorded.': 'स्रोत: कोई दर्ज नहीं।',
  'Download or cite this view': 'यह दृश्य डाउनलोड करें या उसका हवाला दें',
  'Download this {n} order': 'यह {n} आदेश डाउनलोड करें',
  'Download these {n} orders': 'ये {n} आदेश डाउनलोड करें',
  'CSV': 'CSV',
  'JSON': 'JSON',
  'Copy link to this view': 'इस दृश्य का लिंक कॉपी करें',
  'link to this view': 'इस दृश्य का लिंक',
  'Copy the query as curl': 'क्वेरी को curl के रूप में कॉपी करें',
  'the query as curl': 'curl के रूप में क्वेरी',
  'Made in your browser from what Arkiv returned, with your filters applied. Each row has the entity key, creator, owner, expiry block and source links; the first line says the exact query and the block it was read at.':
    'आपके ब्राउज़र में, Arkiv के लौटाए डेटा से, आपके फ़िल्टर लगाकर बनी। हर पंक्ति में एंटिटी कुंजी, बनाने वाला, मालिक, समाप्ति ब्लॉक और स्रोतों के लिंक हैं; पहली पंक्ति सटीक क्वेरी और वह ब्लॉक बताती है जिस पर इसे पढ़ा गया।',
  'Copy citation': 'हवाला कॉपी करें',
  'citation for {state}, {date}': '{state}, {date} का हवाला',
  'No copy of the order itself is on file: only reports about it.': 'आदेश की अपनी कोई प्रति दर्ज नहीं है: केवल उसके बारे में ख़बरें।',
  '{n} live report says {district} has no internet, and no order covering it is on the register.': '{n} ताज़ा रिपोर्ट कहती है कि {district} में इंटरनेट नहीं है, और रजिस्टर में उसे कवर करने वाला कोई आदेश नहीं है।',
  '{n} live reports say {district} has no internet, and no order covering it is on the register.': '{n} ताज़ा रिपोर्टें कहती हैं कि {district} में इंटरनेट नहीं है, और रजिस्टर में उसे कवर करने वाला कोई आदेश नहीं है।',
  'No order covering {district} is in force on the register.': 'रजिस्टर में {district} को कवर करने वाला कोई आदेश लागू नहीं है।',
  'Open a district to confirm what people see there, and to draft a Right to Information request that asks the state for the order: written in your browser, in English or Hindi, sent by nobody but you.':
    'किसी ज़िले को खोलकर वहाँ लोग जो देख रहे हैं उसकी पुष्टि करें, और राज्य से आदेश माँगने के लिए सूचना के अधिकार का आवेदन तैयार करें: आपके ब्राउज़र में, अंग्रेज़ी या हिंदी में लिखा, और आपके सिवा कोई उसे नहीं भेजता।',
  'Right to Information': 'सूचना का अधिकार',
  'Ask for the order': 'आदेश माँगें',
  'Anyone in India can ask the state for it under the Right to Information Act, 2005. This drafts the request: a copy of every suspension order, the review committee’s record of its review, and when each order was published.':
    'भारत का कोई भी नागरिक सूचना का अधिकार अधिनियम, 2005 के तहत राज्य से इसे माँग सकता है। यह आवेदन का मसौदा बनाता है: हर निलंबन आदेश की प्रति, समीक्षा समिति की समीक्षा का अभिलेख, और हर आदेश कब प्रकाशित हुआ।',
  'From': 'से',
  'To': 'तक',
  'Language of the letter': 'पत्र की भाषा',
  'The letter (edit it here or after you download it)': 'पत्र (यहाँ बदलें या डाउनलोड करने के बाद)',
  'Copy the letter': 'पत्र कॉपी करें',
  'the RTI letter': 'RTI पत्र',
  'Download as a text file': 'टेक्स्ट फ़ाइल के रूप में डाउनलोड करें',
  'Start the letter again': 'पत्र फिर से शुरू करें',
  'Rewrite the letter with this change? Your edits to it will be lost.': 'इस बदलाव के साथ पत्र फिर से लिखें? आपके किए बदलाव मिट जाएँगे।',
  'Written in your browser and never sent anywhere: not to Arkiv, not to this site. Add your name and address to the letter after you download it, and never put them in a report or a filing on Switched Off: everything on the register is public and permanent.':
    'आपके ब्राउज़र में लिखा गया और कहीं नहीं भेजा जाता: न Arkiv को, न इस साइट को। अपना नाम और पता पत्र डाउनलोड करने के बाद जोड़ें, और उन्हें Switched Off की किसी रिपोर्ट या दर्ज आदेश में कभी न डालें: रजिस्टर पर सब कुछ सार्वजनिक और स्थायी है।',
  'How to send it': 'इसे कैसे भेजें',
  'By post or by hand to the Public Information Officer of the Home Department, with the fee. Keep a copy and the postal receipt.': 'शुल्क के साथ, डाक से या हाथ से, गृह विभाग के लोक सूचना अधिकारी को। एक प्रति और डाक की रसीद अपने पास रखें।',
  'Online, on the state’s RTI portal:': 'ऑनलाइन, राज्य के RTI पोर्टल पर:',
  'This site doesn’t list an online RTI portal for this state that it has checked; post or hand delivery always works.': 'यह साइट इस राज्य का कोई जाँचा हुआ ऑनलाइन RTI पोर्टल नहीं बताती; डाक या हाथ से देना हमेशा काम करता है।',
  'If the order came from the Union Home Secretary, send the same request to the Ministry of Home Affairs:': 'यदि आदेश केंद्रीय गृह सचिव ने जारी किया था, तो यही आवेदन गृह मंत्रालय को भेजें:',
  'Where this comes from': 'यह कहाँ से आया',
  'Only the Union Home Secretary, or the State’s Secretary in charge of the Home Department, may order a suspension, in writing and with reasons. In unavoidable circumstances an officer of at least Joint Secretary rank in the Union government, authorised by them, may; that order lapses unless confirmed within 24 hours (rules 2 and 3).':
    'निलंबन का आदेश केवल केंद्रीय गृह सचिव, या राज्य सरकार के गृह विभाग के भारसाधक सचिव, लिखित रूप में और कारण दर्ज करके दे सकते हैं। अपरिहार्य परिस्थितियों में उनके द्वारा प्राधिकृत, केंद्र सरकार के संयुक्त सचिव से अन्यून पद का अधिकारी दे सकता है; 24 घंटे में पुष्टि न होने पर वह आदेश अस्तित्वहीन हो जाता है (नियम 2 और 3)।',
  'Telecommunications (Temporary Suspension of Services) Rules, 2024, G.S.R. 724(E), Gazette of India, 22 Nov 2024': 'दूरसंचार (सेवाओं का अस्थायी निलंबन) नियम, 2024, सा.का.नि. 724(अ), भारत का राजपत्र, 22 नवंबर 2024',
  'Every suspension order “shall be published”, must name its reasons, area and services, and may run at most 15 days (rule 3(2)). It goes to a review committee within 24 hours (rule 3(3)); the committee meets within five days and records whether the order is lawful, and may set it aside (rule 5).':
    'हर निलंबन आदेश “प्रकाशित किया जाएगा”, उसमें कारण, क्षेत्र और सेवाएँ स्पष्ट होंगी, और वह अधिकतम 15 दिन चल सकता है (नियम 3(2))। उसकी प्रति 24 घंटे में पुनर्विलोकन समिति को जाती है (नियम 3(3)); समिति पाँच दिन के भीतर बैठक करके दर्ज करती है कि आदेश क़ानून के अनुसार है या नहीं, और उसे अपास्त कर सकती है (नियम 5)।',
  'Rules, 2024': 'नियम, 2024',
  'In Anuradha Bhasin v. Union of India (2020) the Supreme Court directed the authorities to publish all suspension orders in force and every future one.': 'अनुराधा भसीन बनाम भारत संघ (2020) में सुप्रीम कोर्ट ने प्राधिकारियों को लागू सभी निलंबन आदेश और आगे के हर आदेश प्रकाशित करने का निर्देश दिया।',
  'Judgment of 10 Jan 2020, (2020) 3 SCC 637, para 152': '10 जनवरी 2020 का फ़ैसला, (2020) 3 SCC 637, पैरा 152',
  'Anyone can ask in writing or electronically, in English, Hindi or the official language of the area (section 6(1)), without giving a reason (section 6(2)). An office that doesn’t hold the information must pass the request on within five days (section 6(3)).':
    'कोई भी लिखित रूप में या इलेक्ट्रॉनिक माध्यम से, अंग्रेज़ी, हिंदी या उस क्षेत्र की राजभाषा में आवेदन कर सकता है (धारा 6(1)), बिना कोई कारण बताए (धारा 6(2))। जिस कार्यालय के पास सूचना नहीं है, उसे पाँच दिन में आवेदन आगे भेजना होता है (धारा 6(3))।',
  'Right to Information Act, 2005': 'सूचना का अधिकार अधिनियम, 2005',
  'The reply is due within 30 days. The 48-hour limit applies only where the information concerns the life or liberty of a person (section 7(1)); a late reply must be free of charge (section 7(6)).':
    'जवाब 30 दिन के भीतर देना होता है। 48 घंटे की सीमा केवल तब लागू होती है जब सूचना किसी व्यक्ति के जीवन या स्वतंत्रता से जुड़ी हो (धारा 7(1)); देर से दी गई सूचना निःशुल्क देनी होती है (धारा 7(6))।',
  'The fee is Rs 10 for Union government offices; each state sets its own in its RTI rules, so check before paying. People below the poverty line pay no fee (proviso to section 7(5)).':
    'केंद्र सरकार के कार्यालयों के लिए शुल्क ₹10 है; हर राज्य अपने RTI नियमों में अपना शुल्क तय करता है, इसलिए भुगतान से पहले देख लें। गरीबी रेखा से नीचे के लोगों से कोई शुल्क नहीं लिया जाता (धारा 7(5) का परंतुक)।',
  'RTI Rules, 2012, G.S.R. 603(E), rules 3 and 5': 'सूचना का अधिकार नियम, 2012, सा.का.नि. 603(अ), नियम 3 और 5',
  'In 2023 the Supreme Court directed every state and union territory to run an online RTI portal. Not all of them do yet; the portals listed here were opened and checked.':
    '2023 में सुप्रीम कोर्ट ने हर राज्य और केंद्र शासित प्रदेश को ऑनलाइन RTI पोर्टल चलाने का निर्देश दिया। अभी सबने ऐसा नहीं किया है; यहाँ दिए गए पोर्टल खोलकर जाँचे गए हैं।',
  'Pravasi Legal Cell v. Union of India, order of 20 Mar 2023': 'प्रवासी लीगल सेल बनाम भारत संघ, 20 मार्च 2023 का आदेश',
  'This is a draft, not legal advice. Fees, payment methods and portals differ by state; check the state’s RTI rules before sending.': 'यह एक मसौदा है, क़ानूनी सलाह नहीं। शुल्क, भुगतान के तरीक़े और पोर्टल हर राज्य में अलग हैं; भेजने से पहले राज्य के RTI नियम देख लें।',
  // LiveWire
  'Drill: ': 'अभ्यास: ',
  "Order lapsed on Arkiv's clock: {state}, {place} relit. Nobody deleted it; its expiry block arrived.": 'Arkiv की घड़ी पर आदेश समाप्त: {state}, {place} में फिर रोशनी। किसी ने इसे मिटाया नहीं; बस इसका समाप्ति ब्लॉक आ गया।',
  'An entity on the register was kept alive': 'रजिस्टर की एक एंटिटी को जीवित रखा गया',
  'A register entity changed': 'रजिस्टर की एक एंटिटी बदली',
  '{what} reported in {where} ({carrier})': '{where} से रिपोर्ट: {what} ({carrier})',
  'Internet crawling': 'इंटरनेट बहुत धीमा',
  'Someone confirmed the report from {where}': 'किसी ने {where} की रिपोर्ट की पुष्टि की',
  'Suspension order filed: {where}, {places}': 'निलंबन आदेश दर्ज: {where}, {places}',
  'Emergency order confirmed: {where}': 'आपात आदेश की पुष्टि: {where}',
  'Record written to the archive: {where}': 'संग्रह में रिकॉर्ड लिखा गया: {where}',
  'Someone paid to keep the record for {where} alive': 'किसी ने {where} का रिकॉर्ड जीवित रखने के लिए भुगतान किया',
  created: 'बनाया गया',
  extended: 'अवधि बढ़ाई गई',
  deleted: 'हटाया गया',
  patched: 'बदला गया',
  transferred: 'सौंपा गया',
  expired: 'समाप्त',
  'Live changes to the register': 'रजिस्टर में ताज़ा बदलाव',
  'Listening to Arkiv… New orders, reports and confirmations appear here the moment they land in a block. {link} to see it move.':
    'Arkiv को सुन रहे हैं… नए आदेश, रिपोर्टें और पुष्टियाँ ब्लॉक में आते ही यहाँ दिखती हैं। इसे चलता देखने के लिए {link}।',
  'Start a drill': 'अभ्यास शुरू करें',
  '· block {n}': '· ब्लॉक {n}',
  // NightMap
  'Community-filed order (unverified)': 'समुदाय द्वारा दर्ज आदेश (असत्यापित)',
  '{place}: switched off by order': '{place}: आदेश से बंद',
  '{place}: switched off by a community-filed order (unverified)': '{place}: समुदाय द्वारा दर्ज आदेश से बंद (असत्यापित)',
  ' (emergency, unconfirmed)': ' (आपात, पुष्टि नहीं हुई)',
  '{place}: {n} report of no internet, and no published order': '{place}: इंटरनेट न होने की {n} रिपोर्ट, और कोई प्रकाशित आदेश नहीं',
  '{place}: {n} reports of no internet, and no published order': '{place}: इंटरनेट न होने की {n} रिपोर्टें, और कोई प्रकाशित आदेश नहीं',
  '{place}: lights on': '{place}: बत्तियाँ जल रही हैं',
  "Map of India's districts at night.": 'रात में भारत के ज़िलों का नक्शा।',
  '{n} district switched off by an order in force;': '{n} ज़िला लागू आदेश से बंद;',
  '{n} districts switched off by an order in force;': '{n} ज़िले लागू आदेश से बंद;',
  '{n} district with reports of no internet but no published order.': '{n} ज़िले से इंटरनेट न होने की रिपोर्ट, पर कोई प्रकाशित आदेश नहीं।',
  '{n} districts with reports of no internet but no published order.': '{n} ज़िलों से इंटरनेट न होने की रिपोर्टें, पर कोई प्रकाशित आदेश नहीं।',
  // Rewind
  'Suspension orders on file, by state and year': 'राज्य और साल के हिसाब से दर्ज निलंबन आदेश',
  '{state}, {year}: {n} order on file': '{state}, {year}: {n} आदेश दर्ज',
  '{state}, {year}: {n} orders on file': '{state}, {year}: {n} आदेश दर्ज',
  'Each order counted in the year it began; every renewal is its own order. Brighter is more. Click a state to open its orders.':
    'हर आदेश उसी साल में गिना गया है जिसमें वह शुरू हुआ; हर नवीनीकरण अपना अलग आदेश है। रंग जितना चमकीला, आदेश उतने ज़्यादा। किसी राज्य के आदेश खोलने के लिए उस पर क्लिक करें।',
  // Home, the record first
  'On the register': 'रजिस्टर में',
  'districts switched off at least once': 'ज़िले कम से कम एक बार बंद',
  'renewals on file': 'नवीनीकरण दर्ज',
  'Right now: no order on the register is in force, {n}. Latest on file:': 'इस समय: रजिस्टर का कोई आदेश लागू नहीं है, {n}। सबसे ताज़ा दर्ज आदेश:',
  '{n} live report of no internet': 'इंटरनेट न होने की {n} ताज़ा रिपोर्ट',
  '{n} live reports of no internet': 'इंटरनेट न होने की {n} ताज़ा रिपोर्टें',
  'The archive above is a copy read from Arkiv at block {n}; checking Arkiv live now.': 'ऊपर का संग्रह Arkiv से ब्लॉक {n} पर पढ़ी गई एक प्रति है; अब Arkiv को सीधे जाँच रहे हैं।',
  // Proof
  'Proof': 'सबूत',
  'Proof: check every claim live': 'सबूत: हर दावा अभी जाँचें',
  'Don’t take our word for it. Ask Arkiv.': 'हमारी बात मत मानिए। Arkiv से पूछिए।',
  'Each button below asks the network, from your browser, whether something this site claims is true right now. The write checks are simulations: Arkiv runs the transaction as that address and answers, but nothing is signed or sent, so press them all.': 'नीचे का हर बटन आपके ब्राउज़र से नेटवर्क से पूछता है कि इस साइट का कोई दावा अभी सच है या नहीं। लिखने वाली जाँचें सिमुलेशन हैं: Arkiv उस पते की ओर से लेन-देन चलाकर जवाब देता है, पर न कुछ साइन होता है न भेजा जाता है, इसलिए सब दबाइए।',
  'Run every check': 'हर जाँच चलाएँ',
  '{passed} of {n} checks hold': '{n} में से {passed} जाँचें सही',
  'Record under test: {state}, {date}': 'जाँच में रिकॉर्ड: {state}, {date}',
  'The register is still loading from Arkiv. Try again in a moment.': 'रजिस्टर अभी Arkiv से लोड हो रहा है। थोड़ी देर में फिर कोशिश करें।',
  'Nobody can delete the archive, not even us.': 'संग्रह को कोई नहीं मिटा सकता, हम भी नहीं।',
  'Our registrar filed this record. We ask Arkiv to let the registrar delete it.': 'यह रिकॉर्ड हमारे रजिस्ट्रार ने दर्ज किया। हम Arkiv से पूछते हैं कि क्या रजिस्ट्रार इसे मिटा सकता है।',
  'Nobody can cut a record’s life short.': 'किसी रिकॉर्ड की उम्र कोई घटा नहीं सकता।',
  'We ask Arkiv to bring the record’s expiry a day forward.': 'हम Arkiv से रिकॉर्ड की समाप्ति एक दिन पहले करने को कहते हैं।',
  'Anyone can keep it alive.': 'कोई भी इसे जीवित रख सकता है।',
  'A brand-new address, with no link to us, asks to extend the record by a day.': 'एक बिल्कुल नया पता, जिसका हमसे कोई संबंध नहीं, रिकॉर्ड को एक दिन बढ़ाने को कहता है।',
  'Every record is readonly, open to extension and sealed.': 'हर रिकॉर्ड केवल-पठनीय है, अवधि बढ़ाने के लिए खुला है और सील है।',
  'The flags and owner of every record in the archive, as Arkiv returns them.': 'संग्रह के हर रिकॉर्ड के फ़्लैग और मालिक, जैसे Arkiv बताता है।',
  'A lapsed order is gone now and on record at its own block.': 'समाप्त आदेश अब नहीं है, पर अपने ब्लॉक पर दर्ज है।',
  'A drill order filed on 11 Oct to live 30 blocks. We ask for it today, and at the block it was filed.': '11 अक्टूबर को 30 ब्लॉक जीने के लिए दर्ज एक अभ्यास आदेश। हम उसे आज माँगते हैं, और उस ब्लॉक पर जब वह दर्ज हुआ था।',
  'One transaction, many operations.': 'एक लेन-देन, कई काम।',
  'The nine name-free corrections were created and handed to 0x…dEaD in a single transaction. We read its receipt.': 'नौ बिना-नाम सुधार एक ही लेन-देन में बनाए गए और 0x…dEaD को सौंपे गए। हम उसकी रसीद पढ़ते हैं।',
  'Arkiv pushes changes as they happen.': 'Arkiv बदलाव होते ही भेजता है।',
  'We open Arkiv’s WebSocket for eight seconds and count the entity events it sends.': 'हम आठ सेकंड के लिए Arkiv का WebSocket खोलते हैं और उसके भेजे एंटिटी इवेंट गिनते हैं।',
  'Asking Arkiv…': 'Arkiv से पूछ रहे हैं…',
  'Check again': 'फिर जाँचें',
  'Check now': 'अभी जाँचें',
  'Couldn’t check just now: {error}': 'अभी जाँच नहीं हो सकी: {error}',
  'Holds': 'सही',
  'Does not hold': 'सही नहीं',
  'Every Arkiv feature, and what it changes for the person using it': 'Arkiv की हर सुविधा, और उपयोग करने वाले के लिए उससे क्या बदलता है',
  'No feature is here for show: each row is something a reader, a reporter or a filer sees on this site.': 'कोई सुविधा दिखावे के लिए नहीं: हर पंक्ति वह है जो पाठक, रिपोर्ट करने वाला या दर्ज करने वाला इस साइट पर देखता है।',
  'Arkiv feature': 'Arkiv सुविधा',
  'What you see': 'आप क्या देखते हैं',
  'Code': 'कोड',
  'Typed attributes vs payload': 'टाइप वाले गुण बनाम पेलोड',
  'Queries (equality, u64 ranges)': 'क्वेरी (बराबरी, u64 सीमाएँ)',
  'WebSocket entity events': 'WebSocket एंटिटी इवेंट',
  'An order disappears from the map at the block its legal deadline falls on; a report fades after six hours.': 'आदेश उसी ब्लॉक पर नक्शे से हट जाता है जिस पर उसकी क़ानूनी समय-सीमा पड़ती है; रिपोर्ट छह घंटे बाद फीकी पड़ जाती है।',
  'Confirming an emergency order, a neighbour confirming a report, anyone keeping a lapsed record alive.': 'आपात आदेश की पुष्टि, पड़ोसी का रिपोर्ट की पुष्टि करना, कोई भी समाप्त रिकॉर्ड को जीवित रखे।',
  'Records are readonly (text never changes) and open to anyone’s extension; orders can only be confirmed by their filer.': 'रिकॉर्ड केवल-पठनीय हैं (पाठ कभी नहीं बदलता) और कोई भी उनकी अवधि बढ़ा सकता है; आदेश की पुष्टि केवल उसे दर्ज करने वाला कर सकता है।',
  'The archive is handed to 0x…dEaD: nobody can delete it, us included. The ARCHIVED stamp on every record.': 'संग्रह 0x…dEaD को सौंपा गया: इसे कोई नहीं मिटा सकता, हम भी नहीं। हर रिकॉर्ड पर ARCHIVED की मुहर।',
  'An order and its permanent record are filed and sealed in one transaction; corrections went in nine at a time.': 'आदेश और उसका स्थायी रिकॉर्ड एक ही लेन-देन में दर्ज और सील होते हैं; सुधार नौ-नौ करके गए।',
  'Filters by state, type and date run on Arkiv; the order’s reason, authority and sources ride in the payload.': 'राज्य, प्रकार और तारीख़ के फ़िल्टर Arkiv पर चलते हैं; आदेश का कारण, प्राधिकारी और स्रोत पेलोड में रहते हैं।',
  'The register’s state and year filters, “issued after”, and the exact query printed under each view.': 'रजिस्टर के राज्य और साल फ़िल्टर, “इसके बाद जारी”, और हर दृश्य के नीचे छपी सटीक क्वेरी।',
  '“Filed by the registrar” vs “community transcription”; a stranger’s correction can’t hide a record.': '“रजिस्ट्रार द्वारा दर्ज” बनाम “सामुदायिक प्रतिलिपि”; किसी अजनबी का सुधार किसी रिकॉर्ड को छिपा नहीं सकता।',
  'The drill’s rewind and the evidence that a lapsed order existed at its own block.': 'अभ्यास का रिवाइंड और यह सबूत कि समाप्त आदेश अपने ब्लॉक पर मौजूद था।',
  'The Live wire: a filing, a report or a confirmation shows for everyone within seconds.': 'लाइव वायर: कोई दर्ज आदेश, रिपोर्ट या पुष्टि कुछ ही सेकंड में सबको दिखती है।',
  'Transactions to look at yourself: the batch {batch}; the lapsed drill order {lapse}. More in {data} and {friction}.': 'ख़ुद देखने के लिए लेन-देन: एक साथ लेखन {batch}; समाप्त अभ्यास आदेश {lapse}। और {data} व {friction} में।',
}
