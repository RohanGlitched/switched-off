# Switched Off on Arkiv: schema

Network: **Arkiv Tiramisu testnet**, chain ID `7738577`, RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.
SDK: `@arkiv-network/sdk` 0.8.1. Block time: 2 s (all lifetimes are whole blocks).

Every entity carries `app = "switched-off"`, a `type`, and a `net`. `net = "live"` is the real register; `net = "drill"` is the
sandbox where the law runs at one legal day per real minute. The two never mix in a query.

## Entity types

| type | What it is | Lives for | Flags | Created by |
|---|---|---|---|---|
| `order` | A suspension order **while it is in force** | Until the order lapses: its stated end, or for an unconfirmed emergency order 24 h after issue (drill: 1 min) | `readonly`; a non-emergency order filed on the site is also **sealed** (owner → `0x…dEaD`) in the same transaction, so its filer can't stretch or cut it | Registrar or any transcriber (their key) |
| `record` | The permanent archive copy of an order | 2 years (drill: 1 day), extendable by anyone | `readonly`, `permissionlessExtension`, **sealed** (owner → `0x…dEaD`) | Same transaction as the `order`, and sealed in it too: the batch's `ownershipChanges` name keys predicted with `predictEntityKeys` (the archive import of 11 Oct sealed in a second transaction) |
| `report` | A citizen's "no internet here" (or "it's back") | 6 hours (drill: 6 min), extendable by anyone | `readonly`, `permissionlessExtension` | The visitor's in-browser key |
| `registrar` | The registrar's public profile | 365 days | `readonly` | Registrar |

### `order` and `record`

Attributes (everything the app filters on):

| Attribute | Type | Example | Why it's an attribute |
|---|---|---|---|
| `app` | str | `switched-off` | Every query starts here (the SDK requires a filter) |
| `type` | str | `order` / `record` | |
| `net` | str | `live` / `drill` | Keeps the sandbox out of the register |
| `order_id` | str | `mn-2023-11-18` | Joins an `order` to its `record`; renewal links |
| `state` | str | `MN` (ISO 3166-2:IN suffix) | Map and register filter by state |
| `district` | str | `Imphal West` or `multiple` | Single-district lookups |
| `scope` | str | `mobile-data`, `broadband`, `all-internet`, `voice-sms-too`, `unknown` | Filter by what was cut |
| `issued`, `starts`, `ends` | u64 (unix seconds) | `1700332200` | Range queries (`issued > …`); `ends = 0` means no end date was published |
| `emergency` | bool | `false` | Emergency orders die in 24 h unless confirmed |
| `basis` | str (code) | `tsr-2024`, `tsr-2017`, `telegraph-5-2`, `crpc-144`, `not-stated` | Short and queryable; the full citation is in the payload (str attributes are capped at 128 bytes) |
| `renews` | str | `mn-2023-11-13` | The order this one renewed |
| `corrects` | str (entity key) | `0x5a55…7a0e` | Only on a correction: the record it replaces (which stays on Arkiv unchanged). Readers honour it only when the correction's `$creator` is the registrar or the original's own `$creator` |
| `seq` | i32 | `5` | Position in its renewal chain |

Payload (`application/json`, never queried, shown on the gazette page):
`{ authority, reason, districts[], sources[{title,url}], stateName, published, notes, basis, endStated }`.
`authority` is a designation ("Home Department, Government of Manipur"), never an official's name. `reason` is a short paraphrase.

### `report`

| Attribute | Type | Example |
|---|---|---|
| `app`, `type`, `net` | str | `switched-off`, `report`, `live` |
| `state` | str | `MN` |
| `district` | str | `Churachandpur` |
| `carrier` | str | `Jio`, `Airtel`, `Vi`, `BSNL`, `Broadband`, `All networks` |
| `status` | str | `down`, `slow`, `back` |
| `seen` | u64 | When the person saw it (may be earlier than the block, if it was queued offline) |
| `late` | bool | `true` if it was sent after the signal came back |

Payload: `{ note }`, at most 140 characters. The form refuses notes that look like a phone number, email or Aadhaar number.
No name, phone number, IP address or GPS position is ever written.

## Lifetimes and the operations that change them

| Operation | Who can | What the user sees |
|---|---|---|
| Create `order` + `record` (one `executeBatch`) | Any key | The districts go dark; a gazette page appears with its countdown |
| `order` expires (no operation) | Nobody: the block arrives | The districts light up again on time |
| Extend an emergency `order` to its stated end | Its owner only (readonly, not permissionless) | "Emergency" stamp becomes "In force" |
| Extend a `report` 6 h from now | Anyone (`permissionlessExtension`) | The report stays red; the live wire says someone confirmed it |
| Extend a `record` by a year | Anyone | "Keep this record alive" |
| Edit any `order`, `record`, `report` | Nobody (`readonly`) | A correction is a new entity with `corrects` |
| Transfer a `record` to `0x000000000000000000000000000000000000dEaD` (seal) | Its filer, once | “Sealed” on the gazette; `$owner` ≠ `$creator` from then on |
| Delete a sealed `record` | Nobody: only an owner can delete, and nobody holds the key for `0x…dEaD` | It can only expire, and anyone can extend it |
| Delete a `report` | Its author only | "Withdraw my report" on the entity page; nobody else can |
| Write a `record` with `corrects` from a stranger's key | Anyone (Arkiv has no schema owner) | Nothing: readers ignore it unless it comes from the registrar or the original's filer |
| File an `order` from a stranger's key with an end years ahead | Anyone | It appears in the register as a community transcription; it darkens the map only if it runs within the law's 15-day cap |

Renewal is never an extension: a renewed order is a new `order` + `record` with `renews` and `seq`, so every renewal is counted.

## Queries (exact)

Raw JSON-RPC (`arkiv_query`):

```text
Orders in force now:      app = str('switched-off') AND type = str('order') AND net = str('live')
The archive:              app = str('switched-off') AND type = str('record') AND net = str('live')
One state's history:      app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('MN')
Live reports:             app = str('switched-off') AND type = str('report') AND net = str('live')
Issued after 1 Jul 2023:  app = str('switched-off') AND type = str('record') AND net = str('live') AND issued > u64(1688169600)
In force at a past block: (any of the above) with options { "atBlock": "0x…" }
Filed by the registrar:   $creator = addr(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e) AND app = str('switched-off')
Sealed (undeletable):     $owner = addr(0x000000000000000000000000000000000000dEaD) AND app = str('switched-off') AND type = str('record')
Pinned expiry evidence:   app = str('switched-off') AND order_id = str('drill-evidence-lapse')   (0 at the head; 1 with atBlock 0x6ae4b)
```

```bash
curl -s -X POST https://rpc.tiramisu.db-chain.testnet.arkiv.network \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND type = str('record') AND net = str('live') AND state = str('MN') AND $creator = addr(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e)\",{\"select\":{\"key\":true,\"attributes\":true,\"payload\":true,\"expiresAt\":true,\"creator\":true}}]}"
```

SDK equivalents are in `src/lib/arkiv.ts` (`activeOrders`, `records`, `liveReports`, all with an optional `atBlock`).
Pages of 200 (`MAX_LIMIT`) are walked with the cursor.

## Live updates

`watchEntityEvents` (WebSocket in direct mode, polled through the relay otherwise) drives the live wire and map:
`EntityCreated` (a new order, record or report), `ExpiryExtended` (a confirmation or keep-alive). Expiry itself emits no
event, so the page also re-reads on a slow beat to drop lapsed orders on time.

## Kept off Arkiv on purpose

Reporter identity (keys are throwaway, generated in the browser), exact location (district only), the full text and PDF of
orders (paraphrase + source links), and the presentation layer. See the Why page for the reasoning.

## Personal data: what went wrong and what we did

**What went wrong.** The archive import of 11 Oct 2026 was sealed the same evening (readonly, owned by `0x…dEaD`). After that
we found that 10 of the 111 records quoted people's names in their notes, source titles or source links: case titles from
published judgments, which name petitioners and judges, and one person named in news reporting. Our first round of corrections
then missed a name in the source links of 2 of its own entities. So **12 sealed entities on Arkiv carry a real person's name**
(10 original records and 2 first-round corrections). Every name came from a public court record or a published article, but the
challenge says no real personal data, and our own rule is designations, never names. Neither held. The names are not repeated
in this repository's docs or code: the guard's list of names it has had to remove holds hashes (`knownName` in `src/lib/pii.ts`).

**Why it can't be undone.** A sealed entity can't be edited (`readonly`) or deleted (only an owner can delete, and nobody holds
the key for `0x…dEaD`), by us or anyone. This is friction item 10 ([friction.md](friction.md#10-sealing-makes-a-privacy-mistake-permanent)).

**What we did.**

1. **Name-free registrar corrections, sealed in the transaction that created them** (keys predicted with `predictEntityKeys`,
   [`scripts/correct-names.ts`](../scripts/correct-names.ts), pairs in [`scripts/corrections.json`](../scripts/corrections.json)):
   tx `0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e` with 9 corrections (11 Oct, 21:38 IST) and
   tx `0xdda960768b79430526cf9169233854162a676682fc836f0250ba0808601ddf70` with 3 (22:56 IST): one more original, found when the
   guard was widened to link slugs, and the 2 first-round corrections that still had a name in a source link.
2. **Every reader shows the correction instead.** The site ([`applyCorrections` in `src/lib/arkiv.ts`](../src/lib/arkiv.ts)),
   the mirror ([`docs/index.html`](../docs/index.html)) and the CLI ([`cli/switched-off.mjs`](../cli/switched-off.mjs)) hide every
   record that a trusted correction names in `corrects`, so after a correction of a correction only the last one shows. The entity page
   of an original says "Superseded by a correction" and links the correction; the site does not display the original's text at all
   (a page waits for the archive check, and a list of superseded keys built with the site covers the moment before it lands).
3. **A personal-data guard before every write.** [`src/lib/pii.ts`](../src/lib/pii.ts) refuses phone numbers (any spacing,
   `+91`, Devanagari and full-width digits), Aadhaar numbers and the word, emails (also spelled out) and UPI ids, honorifics,
   case titles, judge styles, a role followed by a name, names the register has already had to remove, and links whose slug
   carries a name. It runs in the forms and again inside `fileReport` and `fileOrder` right before the transaction is built
   ([`src/lib/write.ts`](../src/lib/write.ts)); [`scripts/pii-check.ts`](../scripts/pii-check.ts) runs it over every field and
   link of the archive import, and [`test/pii.test.ts`](../test/pii.test.ts) tests it.

**The 12 entities, and when they expire.** Each was created with a 2-year lifetime. Expiry blocks were read on 18 Oct 2026 with one
keyless `arkiv_query` (`app = str('switched-off') AND type = str('record') AND net = str('live') AND $creator = addr(0xA272…0E3e)`,
selecting `key` and `expiresAt`); dates are counted at 2 s a block from block 726,460 (05:51:40 UTC, 18 Oct 2026).

| Order | Entity carrying a name (sealed, readable by key) | Correction readers show now | Expires (block, ≈ IST) |
|---|---|---|---|
| `jk-2019-08-04` | `0xe27b2d373ccc263d0996d3855cd68f46965e5a981f7a5320849b19da3334a0ff` | `0xdddd61860460a25a9d71758d2203cda22067687ab95323956273f628891172bc` | 31,972,392 · 10 Oct 2028, 18:12 |
| `jk-2020-01-14` | `0xe06147c70511813e7ab9a5df570aa2ad2b1ea9af9c8b35c15f363929227742df` | `0x158b82b932ac069428e334252142cd80dd8f0221a98264984e02cc199030b8f4` | 31,972,395 · 10 Oct 2028, 18:12 |
| `as-caa-2019-12-11` | `0x6df9d884ed72b546ed204588bdb6369072ab4cf4a4b11a78a012e151779b8dd9` | `0x800901fa1853f716950a849e54e9a4b10db755be826e2194cde07b3b1984f783` | 31,972,392 · 10 Oct 2028, 18:12 |
| `as-caa-2019-12-11` (first correction) | `0x3da097c9262951503a0c14ddd70697a36283374dab6d85aca10a2248a5966928` | `0x800901fa1853f716950a849e54e9a4b10db755be826e2194cde07b3b1984f783` | 31,978,578 · 10 Oct 2028, 21:38 |
| `hr-farmers-2021-01-29` | `0x473eab727e77171697d9a02ee4608851352f9c596a5f689a1f98d30101e9ea13` | `0xf8ae2f1164fcc23389dff5c7de1720da81fe52aabb4e598a9a0f4ea9faa50817` | 31,972,397 · 10 Oct 2028, 18:12 |
| `jk-2021-09-01` | `0xdd8cdfb829db2006fed5a8235022d30842f2796a743df9e76a2b7f95195c8fdd` | `0x3dd10f5f96762bea5c0f63533a6072e078bfbddebe41ef3e4befb619200db34f` | 31,972,397 · 10 Oct 2028, 18:12 |
| `wb-madhyamik-2022-03-07` | `0x83856db4e34122265d4bc24b8a1ca7ec5fe73fe6a17b7866388bf3cd5f0029c9` | `0x00e667aace0196a1ab7c884f44712686c5d7c74a9073602710204bd768362963` | 31,972,400 · 10 Oct 2028, 18:13 |
| `pb-statewide-2023-03-18` | `0xe795d4d88187d9a3bf019bf905573e24436cdfd8330fceebe8c46fa78c08a7ff` | `0x5424a2beeae63952181973d5f40a05fd9016c1c1db922873a7a26e2b00e453f0` | 31,972,400 · 10 Oct 2028, 18:13 |
| `pb-statewide-2023-03-20` | `0xd439b64a215a9104397a798cacaf546d031eb4a6d8b80dc112be1776d9236107` | `0xd019fd2101b3fef27a9c2e7adb6392359b8098272e0b6a7912eb634f9a384e77` | 31,972,400 · 10 Oct 2028, 18:13 |
| `pb-statewide-2023-03-20` (first correction) | `0x3b2459aa9d30f387f145dc9b8d2e1516f7f1841811aa5381e22f611644f863aa` | `0xd019fd2101b3fef27a9c2e7adb6392359b8098272e0b6a7912eb634f9a384e77` | 31,978,578 · 10 Oct 2028, 21:38 |
| `hr-farmers-2024-02-11` | `0x38a605674827ceb89f970cdddc512c4f75c49ecee31d3cfda6dbe0fe33c79bd5` | `0x5dfbc58c8dfd3937abfedeb25ba0587cc61de891472861d9b6eb48501689a823` | 31,972,409 · 10 Oct 2028, 18:13 |
| `jh-jgglcce-2024-09-21` | `0x4d9f712d17cf49ca13c2eb563c79f51692068d2dca079dd236d756b7ca9762a7` | `0x27c87a50d5543caa909fe2ffa7af4acc6fa89b5187ec6ddd6709c83637b73710` | 31,972,412 · 10 Oct 2028, 18:13 |

These records also carry `permissionlessExtension`, so anyone can keep them alive past October 2028. We can't stop that, and we
will not extend them ourselves. (The thirteenth registrar correction, `0x3f268a42…736a`, fixes a missing date on the Udaipur
record and has nothing to do with names.)

**What we would do on mainnet.** Run the guard over every field and link, then have a second person read each record before it
is sealed; and seal only after a cooling-off period. Until it is sealed, a readonly record can still be deleted by its owner,
so a mistake found in that window is deleted and refiled instead of living on beside its correction.

## On-chain evidence

- Registrar (archive, registrar profile): `0xA2724EA69eA093677D8426E7FE20644EE90a0E3e`
- Gas tap for visitors' in-browser keys: `0xFe54502be8aA581d79D0e13A26D00afa61dd6DF4`
- Expiry evidence: drill order `0x0bd2969f5a238f263e2846426c6c0cfb2bb9466fd28aae57954a68c30b57302c`, created at block 437,835
  (tx `0xa601fee06f9faa65d32411932dff7d793a926f2a98483a505fc9e8e22c46c206`), 30-block lifetime: absent at the head, present at block
  437,835. Re-run with `npx tsx scripts/evidence.ts` (writes `scripts/evidence.json`).
- Sealing: all live records transferred to `0x…dEaD` in 5 batches on 11 Oct 2026, e.g. `0xf7bde6fe470afc11c7f22dce4530fc78c78879db3811ae99a810497a041c2420`;
  the former owner's delete was refused ("owned by 0x…dEaD, not 0xA272…") and a stranger's key extended a sealed record (`scripts/seal.ts --test`).
- Correction: `0x3f268a4203917f33e963bffa50ab10f3ad9faad5bd2f03c179ba14c4f543736a` corrects the Udaipur record `0x5a55754b…667a0e`.
- Nine name-free corrections created and sealed in one transaction, keys predicted with `predictEntityKeys`:
  `0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e`, and three more in
  `0xdda960768b79430526cf9169233854162a676682fc836f0250ba0808601ddf70` (the pairs are in `scripts/corrections.json`; why they
  were needed is in [Personal data](#personal-data-what-went-wrong-and-what-we-did)).
- Every address that writes entities, with its role: [`wallets.md`](wallets.md). Each claim with its transaction and how to re-check
  it: [`evidence.md`](evidence.md).
- Newer orders, 18 Oct 2026: 76 `record` entities from 2025–26, each batch created and sealed to `0x…dEaD` in one transaction (`scripts/add-orders.ts`, keys in `scripts/added.json`), in 10 transactions: `0x0d344ff085e90aeb992dcf5a18bd0d2d39f1eef853dcfdc7396e7f0b85d32569`, `0x157c114109c957ac8b791b41bf5dc4a4b6d8c576ed2455932de8a25828c4974a`, `0x1ee3e5679e689c119ef529f8f4b1c80b9a80a75a3d6f2582c673e7d8ad5c9427`, `0x352b444bb36ba635cb35644180e230d1ea61cc8bbba8452311f9dbc166b9784d`, `0x6c16341b53672b422e5cb7d04da398017a138440b5edeeca893ae759b1eab088`, `0x95fa455891ba4939c5f5555a7ad0bb6e9ded4c68d41ddf1248742a9cf2c63847`, `0xaff32254c51c54fa21b5bc8c9d447dee5ea99dcb502e47f83e7bc88a0c655b3e`, `0xcc6ec443426b4909f3ff572ccf3757993775bbeee4d70feba10dfef335fd04a8`, `0xd1d45d0defc36da8aa010d7ee225d03f4f614e575c3f65e4a6db3a4ff9b28aa0`, `0xecb406082c33e54a61f2bd84bc7baebc6c42a5906c5be0150644349b8cb44c61`. Then 36 registrar corrections from better sources and from review (order PDFs, exact times, Odisha's state code, a renewal link, notes on long orders), sealed the same way (`scripts/correct-orders.ts`, keys in `scripts/data-corrections.json`): `0x038e1af067f1d4426674ba86783ad37499d28d5cd1ef8909ed912448b660e622`, `0xefdeec4d1741420160e84589cf80e3c4aaab532cb1fd7da668e7b8fef051aa50`, `0x8f43932ce3685dff2094f2837c841f4bf2e6cf2117697c339984f4669549e908`, `0x965460519493b39ce348b1c0d9eb62c180b333df6f98ab25c581a92e70a827aa`.
- Archive import: 111 `record` entities in 12 `executeBatch` transactions on 11 Oct 2026, e.g.
  `0xb329d2e099e06b37160c5fa7222b66f997a00733d588b3ca717fbd3d8e9cab51`. All keys are in `scripts/seeded.json`.
