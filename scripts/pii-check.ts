import { personalData } from '../src/lib/pii'
const cases: [string, boolean][] = [
  ['Call me on 98765 43210', true],
  ['+91-98765-43210', true],
  ['98765/43210', true],
  ['९८७६५४३२१०', true],
  ['mail a@b.in', true],
  ['raju (at) gmail (dot) com', true],
  ['raju@gmail.भारत', true],
  ['pay me at rohan@okaxis', true],
  ['Shri Ramesh Kumar, District Magistrate', true],
  ['Justice Fatehdeep Singh issued notice', true],
  ['Ashlesh Biradar v. State of WB', true],
  ['Bhuyan and Saikia JJ ordered restoration', true],
  ['Mobile data gone since 9 am, broadband still on', false],
  ['down since 10:40 on 11 Oct 2026', false],
  ['1234 5678 9012', true],
  ['Order no. 12/2023-Home dated 03.05.2023', false],
  ['Home Department, Government of Manipur', false],
  ['High Court stayed the order on 10 Mar 2022', false],
]
let bad = 0
for (const [t, expect] of cases) {
  const got = personalData(t)
  const ok = !!got === expect
  if (!ok) bad++
  console.log(ok ? 'ok  ' : 'FAIL', JSON.stringify(t), '->', got)
}
if (bad) process.exit(1)
