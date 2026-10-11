import { personalData } from '../src/lib/pii'
for (const t of ['Call me on 98765 43210', '+91-98765-43210', 'mail a@b.in', 'pay me at rohan@okaxis', 'Mobile data gone since 9 am, broadband still on', 'down since 10:40 on 11 Oct 2026', '1234 5678 9012', 'Order no. 12/2023-Home dated 03.05.2023'])
  console.log(JSON.stringify(t), '->', personalData(t))
