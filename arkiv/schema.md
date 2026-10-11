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
  `0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e` (the pairs are in `scripts/corrections.json`).
- Archive import: 111 `record` entities in 12 `executeBatch` transactions on 11 Oct 2026, e.g.
  `0xb329d2e099e06b37160c5fa7222b66f997a00733d588b3ca717fbd3d8e9cab51`. All keys are in `scripts/seeded.json`.
