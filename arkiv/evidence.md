# Evidence

Each Arkiv feature the register relies on, a transaction or entity that shows it, and how to check it yourself. Transactions and
`atBlock` reads stay checkable after the entities expire. Explorer: `https://tiramisu.explorer.arkiv.network/tx/<hash>`. Entity pages:
`https://switched-off.vercel.app/e/<key>`. The [/proof](https://switched-off.vercel.app/proof) page runs seven of these checks from
your browser; its write checks are `eth_call` simulations, so nothing is signed or sent.

| Feature | Transaction or entity | Re-check |
|---|---|---|
| Expiration | Drill order `0x0bd2969f5a238f263e2846426c6c0cfb2bb9466fd28aae57954a68c30b57302c`, created in tx `0xa601fee06f9faa65d32411932dff7d793a926f2a98483a505fc9e8e22c46c206` at block 437,835 (11 Oct, 19:00 IST) with a 30-block life | /proof: "A lapsed order is gone now and on record at its own block"; or query 1 below (0 now) |
| History after expiry (`atBlock`) | The same order, at block 437,835 (`0x6ae4b`) | Query 1 with `atBlock` (1 entity); `scripts/evidence.json` holds the original run |
| Batch writes | Archive import, e.g. tx `0xb329d2e099e06b37160c5fa7222b66f997a00733d588b3ca717fbd3d8e9cab51`: 10 `EntityCreated` (111 records in 12 such transactions; every key in `scripts/seeded.json`) | Query 2 (124 registrar records: 111 + 13 corrections), or the receipt (query 4) |
| Create and seal in one transaction (`ownershipChanges` + `predictEntityKeys`) | tx `0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e`: 9 `EntityCreated` + 9 `OwnershipTransferred`; tx `0xdda960768b79430526cf9169233854162a676682fc836f0250ba0808601ddf70`: 3 + 3 | /proof: "One transaction, many operations"; or query 4 |
| Ownership transfer (sealing) | tx `0xf7bde6fe470afc11c7f22dce4530fc78c78879db3811ae99a810497a041c2420`: 25 `OwnershipTransferred` to `0x…dEaD` (one of 5 sealing batches, 11 Oct) | Query 3 (owner `0x…dead` on every record) |
| Nobody can delete a sealed record | Any sealed record; the registrar that filed it is the caller | /proof: "Nobody can delete the archive" (reverts `NotOwner`, owner `0x…dEaD`) |
| Lifetimes only grow | Any sealed record | /proof: "Nobody can cut a record's life short" (reverts `ExpiryNotExtended`) |
| Permissionless extension | Any sealed record, extended by a fresh random address | /proof: "Anyone can keep it alive" (accepted); a real stranger extension: `npx tsx scripts/seal.ts --test` (needs a funded key) |
| Creation flags | All 124 registrar records: `readonly` + `permissionlessExtension` | /proof: "Every record is readonly, open to extension and sealed" |
| Corrections and `$creator` trust | `0x3f268a4203917f33e963bffa50ab10f3ad9faad5bd2f03c179ba14c4f543736a` corrects the Udaipur record `0x5a55754bbdecb77c144c621695221cb8060bf552e7cf5eb7c724e0d050667a0e`; the 12 name corrections are listed in [schema.md](schema.md#personal-data-what-went-wrong-and-what-we-did) | Open the original's entity page: it says "Superseded by a correction"; trust rules are in `test/trust.test.ts` |
| Typed range queries (`u64`) | `issued > u64(1688169600)` returns the records issued after 1 Jul 2023; the bare-number form returns 0 | Query 5, both forms (friction item 4a) |
| WebSocket entity events | No stored transaction: events are live | /proof: "Arkiv pushes changes as they happen" (counts events for 8 s) |
| Every friction item | `arkiv/friction-check.json` (18 Oct, block 726,088: 24 still, 3 changed) | `npm run friction` (read-only, no key) |

Every write above came from the registrar, `0xA2724EA69eA093677D8426E7FE20644EE90a0E3e` ([wallets.md](wallets.md)). The demo video,
which also outlives every entity in it: https://youtu.be/W042WqAoYN0 (2:52).

## Queries

Each keyless `arkiv_query` costs 100 units of a budget of about 100 queries an hour per IP (friction item 5). If it is spent, the
site's relay answers the same JSON-RPC at `https://switched-off.vercel.app/api/rpc`.

```bash
RPC=https://rpc.tiramisu.db-chain.testnet.arkiv.network
q() { curl -s -X POST "$RPC" -H 'content-type: application/json' -d "$1"; echo; }

# 1. The lapsed drill order: 0 now; add ,"atBlock":"0x6ae4b" to the options for its own block (1)
q "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND order_id = str('drill-evidence-lapse')\",{\"select\":{\"key\":true}}]}"

# 2 and 3. The registrar's records, with owner and expiry
q "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND type = str('record') AND net = str('live') AND \$creator = addr(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e)\",{\"select\":{\"key\":true,\"owner\":true,\"expiresAt\":true},\"limit\":\"0xc8\"}]}"

# 4. One batch's receipt (count the logs, or decode them with ENTITY_EVENTS_ABI from @arkiv-network/sdk)
q '{"jsonrpc":"2.0","id":4,"method":"eth_getTransactionReceipt","params":["0x131f819faa99ab79c1effc929608e8df88ca673a71bd1040bf2ff77beb55519e"]}'

# 5. A u64 range: typed, then bare (the bare number compares as i32 and matches nothing)
q "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND type = str('record') AND net = str('live') AND issued > u64(1688169600)\",{\"select\":{\"key\":true},\"limit\":\"0xc8\"}]}"
q "{\"jsonrpc\":\"2.0\",\"id\":6,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND type = str('record') AND net = str('live') AND issued > 1688169600\",{\"select\":{\"key\":true},\"limit\":\"0xc8\"}]}"
```
