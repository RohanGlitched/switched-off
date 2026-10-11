# Building on Arkiv: friction report

Switched Off, 9–18 October 2026. `@arkiv-network/sdk` **0.8.1**, `viem` 2.x, Node 21.7, Tiramisu testnet (chain 7738577),
public RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.

Every item below was hit while building, and items 1–8 are re-run by **`npx tsx scripts/friction-repro.ts`**, whose output
(11 Oct 2026, around block 0x6acb1) is quoted. The raw notes as they happened are in [`friction-log.md`](friction-log.md).
What went smoothly is documented with the same care at the end, because a lot of it did.

---

## 1. The SDK accepts attribute names the node rejects

- **Expected:** if `createEntity` accepts an attribute name client-side, the node accepts it; or the SDK rejects it before sending.
- **Actual:** `src/attr/names.ts:13` validates names with `/^[A-Za-z][A-Za-z0-9._-]*$/`, so `orderId` passes. The node then fails it:
  `EntityMutationError: Transaction failed: an attribute name holds "I" (0x49) at byte 5, which is outside the name charset ("A"-"Z", "a"-"z", "0"-"9", ".", "-" and "_", with a letter first)`.
  The message lists `A`–`Z` as allowed while rejecting a capital `I`.
- **Repro:** `createEntity({ attributes: { orderId: 'x' }, … })`. Script item 1.
- **Cost to us:** the first drill order silently failed in the browser; we lost about 30 minutes finding it.
- **Fix:** align the SDK regex with the node (lowercase only?), and make the node's message state the real charset.

## 2. Lifetimes must be whole blocks, which computed deadlines never are

- **Expected:** `ExpirationTime.fromSeconds(n)` for "until this order lapses" (a deadline minus now).
- **Actual:** `InvalidExpiryError: Invalid expiry: a lifetime must be a multiple of the 2s block time, got 299, which is 149.5 blocks. Try 298 or 300, or ExpirationTime.fromBlocks(n).`
- **Repro:** script item 2.
- **Note:** this is one of the best error messages we saw: it names the fix. But computed lifetimes are odd half the time, so every app
  that derives an expiry from a real-world deadline hits it. We now convert with `fromBlocks(Math.ceil(seconds / 2))`.
- **Fix:** round by default (or `fromSeconds(n, { round: 'up' })`), since a lifetime is already approximate.

## 3. The SDK refuses a query the RPC accepts

- **Expected:** `select().limit(1).fetch()` returns any entity, as raw RPC `*` does (the JSON-RPC docs list `*` as "matches everything").
- **Actual:** `InvalidPredicateError: A query needs at least one filter — the language has no spelling for 'match every entity". Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).`
  The raw RPC call with `"*"` returns a result (script item 3b). The message's quotes are also mismatched (`'…"`).
- **Workaround:** every entity carries `app = "switched-off"` and every query starts with `eq('app', …)`. That's good practice anyway, but
  the SDK and the RPC docs contradict each other.
- **Fix:** expose `where('*')` in the SDK, or say in the RPC docs that the SDK forbids it on purpose.

## 4. Raw query syntax isn't discoverable from the network page

- **Expected:** the Tiramisu page that lists the RPC URL links to the query grammar.
- **Actual:** our first raw call, `app = "switched-off"`, returned `{"code":-32001,"message":"unexpected character","data":{"position":6}}`.
  The grammar (typed literals `str('…')`, `AND`, `$owner`, `*`) is documented at docs.arkiv.network/json-rpc/querying-data/, but the
  network page doesn't link there. We found the syntax by printing `SelectQueryBuilder.toString()`.
- **Repro:** script item 4.
- **Fix:** link the grammar from the network page; on a parse error at a string, suggest `str('…')`.

## 5. The anonymous query budget is undocumented, and it runs out

- **Expected:** a stated budget for keyless reads (size, window, cost per method), so a public web app can plan for it.
- **Actual:** after about an hour of a development page polling, every `arkiv_query` from our IP returned
  `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`.
  The message is clear. What isn't written anywhere we could find: the budget's size and window, that each `arkiv_query` costs 100 units
  whatever it selects (`Arkiv-Cost: 100` response header), and the separate 600 requests/60 s per IP limit (`RateLimit` header).
  `eth_*` methods kept working, so writes were unaffected.
- **Design consequence:** the access-keys page rightly warns that a key in browser code can be read and spent by anyone. So a public site
  either puts every visitor on the keyless budget or runs a proxy. We run a small allowlisted relay with a 4-second shared cache, plus a
  "direct" switch so readers can bypass us. The mirror falls back to the relay when the keyless budget is spent.
- **Fix:** document the anonymous budget and per-method costs next to the RPC URL. A browser-safe, origin-locked read key would remove the
  need for proxies like ours.

## 6. `watchEntityEvents` has no filter, so apps hear the whole chain

- **Expected:** subscribe to entity events for my entities (by attribute, owner or creator).
- **Actual:** the watcher reports every entity event on Tiramisu. With the default polling interval of half a block (1 s), and a re-read
  each time an `EntityCreated` might be ours, our first build hit HTTP 429 within a minute; other teams write constantly.
  Separately, through an HTTP proxy the watcher needs `eth_newFilter`/`eth_getFilterChanges` (viem's `watchEvent`), which a relay has to allow.
- **Workaround:** `pollingInterval: 3000`; re-read at most every 8 s for strangers' creates, immediately for our own keys.
- **Fix:** an attribute or owner filter on `watchEntityEvents` (the node already indexes attributes).

## 7. `ExpiryExtended` doesn't say who extended

- **Documented** in the type comment (thank you), but for `permissionlessExtension` entities the extender *is* the interesting fact. For
  "confirmed by 3 people" we must fetch each transaction's `from`, which is one extra RPC call per event.
- **Fix:** include the sender in the event.

## 8. Expired, deleted and never-existed all look the same to `getEntity`

- **Actual:** `No live entity with key 0x4e58…f34a. It was never created, or it has been deleted or has expired.` (script item 8).
  The same entity is still returned by a query `.atBlock(creationBlock)`. That's excellent, and our "rewind" depends on it.
- **Fix:** say which case it is, or return the expiry block, so an app can show "lapsed at 14:02" instead of "not found".

## 9. Smaller things

- **Version drift:** the SDK README's install snippet shows `"@arkiv-network/sdk": "^0.6.0"`, the docs home says "SDK v0.6.0", the Python
  guide says v0.4.4, and npm installs 0.8.1.
- **Faucet:** hub.arkiv.network/faucet only works with a connected browser wallet. A server-generated project key can't be funded directly,
  so we claimed to a personal wallet and transferred.
- **Attributes read back tagged** (`{ "seen": { "type": "u64", "value": "1791724521" } }`, script item 7) while they're written bare
  (`seen: u64(…)` or a plain string). Reasonable, but the README's read example doesn't show the shape, and our first build rendered
  `[object Object]` and `NaN`.
- **No `orderBy`; `MAX_LIMIT = 200`:** we sort client-side after walking cursors. Fine at our size.

---

## What went smoothly (with the same rigour)

- **Expiry is exact and enforced.** A 40-second entity was gone from `select` and `getEntity` on time, and nothing in our code deletes
  anything. The law's deadlines (15 days, 24 hours) map one-to-one onto lifetimes.
- **History survives expiry.** `.atBlock(n)` returns entities as they were at block *n*, including since-expired ones. Our drill's rewind
  slider and the CLI's `at` command are built on it (script item 8: alive now 0, at creation block 1).
- **Creation flags are exactly the right primitives.** `readonly` plus `permissionlessExtension` gives "anyone may keep this alive, nobody
  may change it" in one line. Our two-person test proved a second key extends a report it can't edit.
- **`executeBatch` is atomic and cheap.** Order + archive record in one transaction; 111 records in 12 transactions; deleting 10 duplicates in one.
- **Lifetime isn't priced on Tiramisu (yet).** The same create costs the same gas for a 1-day or a 365-day lifetime: 90,656 gas for the
  repro entity (script item 6), 97,160 for our slightly larger registrar profile on day one (friction-log.md); about 0.0001 GLM at 1 gwei.
- **Ownership transfer closes the last gap.** `readonly` stops edits, but an owner can still delete. Transferring a record to
  `0x…dEaD` makes deletion impossible while `permissionlessExtension` still lets anyone extend it: the former owner's delete was refused
  ("owned by 0x…dEaD, not 0xA272…") and a fresh stranger key extended it (`scripts/seal.ts --test`). Worth a line in the docs as a pattern.
- **Client-side validation saves gas where it exists.** The 128-byte `str` limit is caught before sending, with a message telling you to
  move the long form to the payload (script item 5). That's the right design, and it shaped our schema (legal basis as a short code).
- **Errors are mostly excellent.** Items 2 and 5 name their own fixes.

## Timing

- `createEntity` round trip (send + receipt) from India over the public RPC: 7.3–9.8 s.
- Block time 2 s (`getBlockTiming`).
- The full archive (`arkiv_query`, 111 entities with attributes and payloads, one page): 0.54–0.65 s direct with a key, 0.42–1.0 s through our Vercel relay, measured from India on 11 Oct 2026.
