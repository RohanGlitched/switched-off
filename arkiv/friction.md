# Building on Arkiv: friction report

[![Friction re-check](https://github.com/RohanGlitched/switched-off/actions/workflows/friction.yml/badge.svg)](https://github.com/RohanGlitched/switched-off/actions/workflows/friction.yml)

Switched Off, 9–18 October 2026. `@arkiv-network/sdk` **0.8.1**, `viem` 2.x, Node 21.7, Tiramisu testnet (chain 7738577),
public RPC `https://rpc.tiramisu.db-chain.testnet.arkiv.network`.

Every item below was hit while building, and items 1–8 are re-run by **`npx tsx scripts/friction-repro.ts`**, whose output
(11 Oct 2026, around block 0x6acb1) is quoted. The raw notes as they happened are in [`friction-log.md`](friction-log.md).
What went smoothly is documented with the same care at the end, because a lot of it did.

**Versions:** `@arkiv-network/sdk` 0.8.1 · `viem` 2.57.4 (package-lock) · Node 21.7.0 locally, 22 in CI · Tiramisu, chain 7738577 ·
last full re-check 18 Oct 2026 at block 726088 ([`friction-check.json`](friction-check.json)).

**Re-check every item yourself:** `npm run friction` runs the read-only checks (no key, about 10 RPC requests of the keyless
budget, under 15 s); `npm run friction -- --write` adds the two write checks and needs a funded key (`FRICTION_KEY`, or
`REGISTRAR_KEY` in `.env.local` or the file given by `--key-file <path>`; small lifetimes, app `switched-off-friction`, deleted again). Each check prints
`STILL` (the behaviour below still happens), `CHANGED` (Arkiv fixed or changed it, which we then say in the item), `ERROR`
(could not check) or `SKIPPED`, and writes [`friction-check.json`](friction-check.json). A
[daily GitHub Action](../.github/workflows/friction.yml) runs the read-only set and keeps the JSON as an artifact.

### Ranked by what it cost a builder

| # | Item | Severity | Where | First hit | Status, 18 Oct check | Fix / workaround |
|---|---|---|---|---|---|---|
| [11](#11-a-429-with-a-long-retry-after-and-a-client-that-obeys-it-is-a-silent-hang) | A 429 with `retry-after: ~1000` plus viem's default retries is a silent hang | High | node + viem defaults | 11 Oct | STILL (`11-viem`, `11-logs`) | `retryCount: 0` and a timeout on every transport; one fallback path for every read |
| [5](#5-the-anonymous-query-budget-is-undocumented-and-it-runs-out) | Keyless query budget is undocumented and runs out | High | node + docs | 11 Oct | STILL (`5`, `5-docs`) | Relay with a shared cache, fall back when the budget is spent; Arkiv: document size, window and cost |
| [12](#12-a-keys-monthly-quota-runs-out-silently-and-its-refusal-is-not-json-rpc-shaped) | A key's monthly quota runs out silently; refusal not JSON-RPC shaped | High | node + Hub + docs | 12 Oct | Header STILL (`12-header`); docs CHANGED (`12-docs`: Hub Usage tab now documented) | Relay reshapes the refusal and goes keyless; Arkiv: JSON-RPC shaped errors, state the quota size |
| [4a](#4a-a-bare-number-silently-compares-as-i32-so-a-range-over-a-u64-attribute-returns-nothing) | A bare number compares as `i32`; a `u64` range silently returns nothing | High | node (query language) | 11 Oct | STILL (`4a`) | Always write `u64(…)`; Arkiv: reject or coerce mismatched literals |
| [1](#1-the-sdk-accepts-attribute-names-the-node-rejects) | SDK accepts attribute names the node rejects | Medium | SDK + node | 11 Oct | STILL (`1-sdk`, `1-node`) | Lowercase snake_case names; Arkiv: one charset in both |
| [6](#6-watchentityevents-has-no-filter-so-apps-hear-the-whole-chain) | `watchEntityEvents` has no filter | Medium | SDK | 11 Oct | STILL (`6`) | `pollingInterval: 3000`, throttle re-reads; Arkiv: owner or attribute filter |
| [10](#10-sealing-makes-a-privacy-mistake-permanent) | Sealing makes a privacy mistake permanent | Medium | by design; docs | 11 Oct | STILL (`10`), as designed | Name check before every write, correction entities; Arkiv: a docs note at `changeOwnership` |
| [4](#4-raw-query-syntax-isnt-discoverable-from-the-network-page) | Raw query syntax isn't discoverable from the network page | Medium | docs + node error | 11 Oct | STILL (`4`, `4-docs`) | Print `SelectQueryBuilder.toString()`; Arkiv: link the grammar, suggest `str('…')` |
| [2](#2-lifetimes-must-be-whole-blocks-which-computed-deadlines-never-are) | Lifetimes must be whole blocks | Low | SDK + docs | 11 Oct | Error STILL (`2`); docs CHANGED (`2-docs`: `atDate` now explained for deadlines) | `ExpirationTime.atDate(deadline)` |
| [3](#3-the-sdk-refuses-a-query-the-rpc-accepts) | SDK refuses a query the RPC accepts | Low | SDK vs RPC docs | 11 Oct | STILL (`3-sdk`, `3-rpc`, `3-docs`) | Every query starts with `eq('app', …)` |
| [8](#8-expired-deleted-and-never-existed-all-look-the-same-to-getentity) | Expired, deleted and never-existed look the same to `getEntity` | Low | SDK + node | 11 Oct | STILL (`8`) | Query `.atBlock(n)` to tell them apart |
| [7](#7-expiryextended-doesnt-say-who-extended) | `ExpiryExtended` doesn't say who extended | Low | node event | 11 Oct | STILL (`7`) | One `getTransaction` per event for `from` |
| [9](#9-smaller-things) | Smaller things (version drift, faucet, tagged reads, no `orderBy`) | Low | docs + SDK + Hub | 11 Oct | README STILL (`9-readme`), tagged reads STILL (`9-tagged`), limits STILL (`9-limits`); docs CHANGED (`9-docs`) | Read the SDK's own types; sort client-side |

The "what went smoothly" claims are checked too: the 128-byte `str` limit is still caught before sending (`ok-str128`), an
expired entity is still returned `.atBlock(n)` 288,000 blocks later (`ok-history`), and lifetime is still not priced, 95,656 gas
for a 1-day and a 365-day create alike (`ok-pricing`). Not checked by machine: the faucet (needs a browser wallet), the 429 and
`QUOTA_EXCEEDED` body shapes (need a spent budget; the script records the body if it meets a 429), and item 10's trade-off itself.

---

## 1. The SDK accepts attribute names the node rejects

- **Expected:** if `createEntity` accepts an attribute name client-side, the node accepts it; or the SDK rejects it before sending.
- **Actual:** `src/attr/names.ts:13` validates names with `/^[A-Za-z][A-Za-z0-9._-]*$/`, so `orderId` passes. The node then fails it:
  `EntityMutationError: Transaction failed: an attribute name holds "I" (0x49) at byte 5, which is outside the name charset ("A"-"Z", "a"-"z", "0"-"9", ".", "-" and "_", with a letter first)`.
  The message lists `A`–`Z` as allowed while rejecting a capital `I`.
- **Repro:** `createEntity({ attributes: { orderId: 'x' }, … })`. Script item 1.
- **Cost to us:** the first drill order silently failed in the browser; we lost about 30 minutes finding it.
- **Fix:** align the SDK regex with the node (lowercase only?), and make the node's message state the real charset.
- **Checked by:** friction-check `1-sdk` (offline: `isValidAttributeName('orderId')` is true and `createEntity` goes on to build
  the transaction) and `1-node` (write: the node's refusal above, word for word, on 18 Oct). STILL.

## 2. Lifetimes must be whole blocks, which computed deadlines never are

- **Expected:** `ExpirationTime.fromSeconds(n)` for "until this order lapses" (a deadline minus now).
- **Actual:** `InvalidExpiryError: Invalid expiry: a lifetime must be a multiple of the 2s block time, got 299, which is 149.5 blocks. Try 298 or 300, or ExpirationTime.fromBlocks(n).`
- **Repro:** script item 2.
- **Note:** this is one of the best error messages we saw: it names the fix. But computed lifetimes are odd half the time, so every app
  that derives an expiry from a real-world deadline hits it. We now convert with `fromBlocks(Math.ceil(seconds / 2))`.
- **Correction (11 Oct, evening):** the SDK already has the right tool for a deadline, `ExpirationTime.atDate(date)`, which rounds up to the
  next block (`utils/expirationTime.ts`), and `atBlock(n)`. We missed both because the docs and the error message steer you to `fromSeconds`
  and `fromBlocks`. So the friction is discoverability, not a missing feature.
- **Fix:** have `fromSeconds` round by default (a lifetime is already approximate), and have the `InvalidExpiryError` message and the
  quick-start mention `atDate` for deadlines.
- **Checked by:** friction-check `2` (the `InvalidExpiryError` above, unchanged, still without `atDate`) and `2-docs`.
  **Changed (18 Oct):** the SDK's mutating-data page now explains `atDate()` for deadlines (it "rounds up, so the entity lives until
  at least that instant"). We can't tell whether that went up after 11 Oct or we missed it; either way the docs half of this item
  no longer stands. The error-message half still does.

## 3. The SDK refuses a query the RPC accepts

- **Expected:** `select().limit(1).fetch()` returns any entity, as raw RPC `*` does (the JSON-RPC docs list `*` as "matches everything").
- **Actual:** `InvalidPredicateError: A query needs at least one filter — the language has no spelling for 'match every entity". Add a where(...) predicate, or narrow by ownedBy(...) / createdBy(...).`
  The raw RPC call with `"*"` returns a result (script item 3b). The message's quotes are also mismatched (`'…"`).
- **Workaround:** every entity carries `app = "switched-off"` and every query starts with `eq('app', …)`. That's good practice anyway, but
  the SDK and the RPC docs contradict each other.
- **Fix:** expose `where('*')` in the SDK, or say in the RPC docs that the SDK forbids it on purpose.
- **Checked by:** friction-check `3-sdk` (offline: the same `InvalidPredicateError`, quotes still mismatched, no request sent),
  `3-rpc` (raw `*` still answers) and `3-docs` (the RPC page still lists `*` under "Match everything"; the SDK querying page says
  "A query needs at least one filter.", but neither says the SDK refuses `*` on purpose). STILL.

## 4a. A bare number silently compares as `i32`, so a range over a `u64` attribute returns nothing

- **Expected:** `issued > 1688169600` against a `u64` attribute returns the records issued after that time, or fails with a type error.
- **Actual:** it returns **0** results and no error. `issued > u64(1688169600)` returns **76**. The grammar docs do say a bare number
  defaults to `i32`, but a type mismatch that turns a range into an empty set is easy to ship: our own Data page published the bare
  form until our QA pass ran every command.
- **Repro:** script item 4a (adds `net = str('live')`: bare 0, typed 64); the same two calls without the `net` filter returned 0 and 76 on 11 Oct 2026 (72 earlier that day, before the last imports).
- **Fix:** reject comparisons whose literal type can't match the attribute's type, or coerce integer literals to the attribute's type.
- **Checked by:** friction-check `4a`: `issued > 1` returns 0, `issued > u64(1)` returns 5 (limit 5), and no error. STILL.

## 4. Raw query syntax isn't discoverable from the network page

- **Expected:** the Tiramisu page that lists the RPC URL links to the query grammar.
- **Actual:** our first raw call, `app = "switched-off"`, returned `{"code":-32001,"message":"unexpected character","data":{"position":6}}`.
  The grammar (typed literals `str('…')`, `AND`, `$owner`, `*`) is documented at docs.arkiv.network/json-rpc/querying-data/, but the
  network page doesn't link there. We found the syntax by printing `SelectQueryBuilder.toString()`.
- **Repro:** script item 4.
- **Fix:** link the grammar from the network page; on a parse error at a string, suggest `str('…')`.
- **Checked by:** friction-check `4` (the same `-32001 unexpected character` at position 6, no hint of `str('…')`) and `4-docs`
  (the Tiramisu page body still has no link to the grammar; only the site-wide sidebar lists JSON-RPC "Querying data"). STILL.

## 5. The anonymous query budget is undocumented, and it runs out

- **Expected:** a stated budget for keyless reads (size, window, cost per method), so a public web app can plan for it.
- **Actual:** after about an hour of a development page polling, every `arkiv_query` from our IP returned
  `{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}`.
  The message is clear. What isn't written anywhere we could find: the budget's size and window, that each `arkiv_query` costs 100 units
  whatever it selects (`Arkiv-Cost: 100` response header), and the separate 600 requests/60 s per IP limit (`RateLimit` header).
  `eth_*` methods kept working, so writes were unaffected.
- **Measured later (11 Oct):** the 429 itself carries the answer in headers, `ratelimit: limit=10000, remaining=0, reset=3130` and
  `retry-after: 3130`, so the keyless budget is 10,000 units (100 queries) per network per roughly an hour. Three smaller things: the 429
  body is not JSON-RPC shaped (`{"error":"ANON_COST_LIMITED","message":…}`, no `jsonrpc` or `id`, so generic clients report "no result"
  instead of the message); `Arkiv-Quota-Used-Percent` is listed in the CORS-exposed headers but not sent on a keyless read (see item 12: keyed reads carry it); and because the budget is per
  network, a judge who runs our documented `curl` after we spent the hour's budget sees it fail. The site, mirror and CLI now fall back
  to the relay when a direct read hits the budget, and say so.
- **Design consequence:** the access-keys page rightly warns that a key in browser code can be read and spent by anyone. So a public site
  either puts every visitor on the keyless budget or runs a proxy. We run a small allowlisted relay with a 4-second shared cache, plus a
  "direct" switch so readers can bypass us. The mirror falls back to the relay when the keyless budget is spent.
- **Fix:** document the anonymous budget and per-method costs next to the RPC URL. A browser-safe, origin-locked read key would remove the
  need for proxies like ours.
- **Checked by:** friction-check `5` (a keyless `arkiv_query` still answers `arkiv-cost: 100` and `ratelimit: limit=600, …`) and
  `5-docs` (no budget size, window or per-call cost on the network, access-keys or querying pages; access-keys says only "at the
  default rate limit"). STILL.

## 6. `watchEntityEvents` has no filter, so apps hear the whole chain

- **Expected:** subscribe to entity events for my entities (by attribute, owner or creator).
- **Actual:** the watcher reports every entity event on Tiramisu. With the default polling interval of half a block (1 s), and a re-read
  each time an `EntityCreated` might be ours, our first build hit HTTP 429 within a minute; other teams write constantly.
  Separately, through an HTTP proxy the watcher needs `eth_newFilter`/`eth_getFilterChanges` (viem's `watchEvent`), which a relay has to allow.
- **Workaround:** `pollingInterval: 3000`; re-read at most every 8 s for strangers' creates, immediately for our own keys.
- **Fix:** an attribute or owner filter on `watchEntityEvents` (the node already indexes attributes).
- **Checked by:** friction-check `6` (offline: `WatchEntityEventsParameters` has the handlers, `fromBlock` and `pollingInterval`
  only; the filter the watcher installs names the Arkiv address and the five event topics, nothing narrower, even when an `owner`
  option is passed; polls 1,006 ms apart by default). STILL.

## 7. `ExpiryExtended` doesn't say who extended

- **Documented** in the type comment (thank you), but for `permissionlessExtension` entities the extender *is* the interesting fact. For
  "confirmed by 3 people" we must fetch each transaction's `from`, which is one extra RPC call per event.
- **Fix:** include the sender in the event.
- **Checked by:** friction-check `7` (offline: `ExpiryExtended(bytes32 entityKey, address owner, uint64 expiresAt)` in the SDK's
  event ABI). STILL.

## 8. Expired, deleted and never-existed all look the same to `getEntity`

- **Actual:** `No live entity with key 0x4e58…f34a. It was never created, or it has been deleted or has expired.` (script item 8).
  The same entity is still returned by a query `.atBlock(creationBlock)`. That's excellent, and our "rewind" depends on it.
- **Fix:** say which case it is, or return the expiry block, so an app can show "lapsed at 14:02" instead of "not found".
- **Checked by:** friction-check `8` (the expired evidence entity in `scripts/evidence.json` and a key nobody created get the
  identical `NoEntityFoundError`) and `ok-history` (the same entity is still returned `.atBlock(0x6ae4b)`). STILL.

## 9. Smaller things

- **Version drift:** the SDK README's install snippet shows `"@arkiv-network/sdk": "^0.6.0"`, the docs home says "SDK v0.6.0", the Python
  guide says v0.4.4, and npm installs 0.8.1.
- **Faucet:** hub.arkiv.network/faucet only works with a connected browser wallet. A server-generated project key can't be funded directly,
  so we claimed to a personal wallet and transferred.
- **Attributes read back tagged** (`{ "seen": { "type": "u64", "value": "1791724521" } }`, script item 7) while they're written bare
  (`seen: u64(…)` or a plain string). Reasonable, but the README's read example doesn't show the shape, and our first build rendered
  `[object Object]` and `NaN`.
- **No `orderBy`; `MAX_LIMIT = 200`:** we sort client-side after walking cursors. Fine at our size.
- **Checked by:** friction-check `9-readme` (the SDK README still shows `^0.6.0`; npm installs 0.8.1), `9-tagged` (`app` reads
  back as `{"type":"str","value":"switched-off"}`), `9-limits` (`MAX_LIMIT = 200`, no ordering method) and `9-docs`.
  **Changed (18 Oct):** the docs home no longer shows an SDK version string, and the docs sitemap lists no Python guide, so the
  "docs home says SDK v0.6.0" and "Python guide says v0.4.4" parts no longer stand. The README part does. The faucet is not
  checked by machine (it needs a browser wallet).

---

## 10. Sealing makes a privacy mistake permanent

- **Expected:** a readonly entity handed to `0x…dEaD` is the point of the design: nobody can rewrite history.
- **Actual:** it also means nobody can repair it. Nine of our 111 imported records quoted case titles and bench names in their `notes` or source titles
  (judges, petitioners, a person named in a police operation). They are public court records, but the challenge rules say no real
  personal data, and our own schema says designations only. The records are sealed, so the fix is a registrar `correction` entity per
  record with name-free notes (`scripts/correct-names.ts`, sealed in the same transaction as it is created), and readers show the
  correction. The originals stay readable until they expire in 2028.
- **Full account:** a second round (3 more corrections, tx `0xdda96076…ddf70`) brought it to 12 sealed entities with a name, all
  listed with their corrections and expiry dates in [schema.md](schema.md#personal-data-what-went-wrong-and-what-we-did).
- **Repro:** read any of the corrected records' originals by key (listed in `scripts/corrections.json` once filed) and compare.
- **Fix (for us):** a name check in the personal-data guard before every write, run over the import too (`scripts/pii-check.ts`).
- **Fix (for Arkiv):** none wanted; this is the trade-off working as designed. A note in the docs next to `changeOwnership` that a transfer
  to a burn address is irreversible for *content* as well as ownership would save someone else the lesson.
- **Checked by:** friction-check `10` (the first corrected original in `scripts/corrections.json` is live and owned by
  `0x…dEaD`, so only a correction entity can repair it). STILL, as designed.

## 11. A 429 with a long `retry-after`, and a client that obeys it, is a silent hang

- **Expected:** when the keyless budget is spent, a read fails fast with the message from item 5, and the app can fall back.
- **Actual:** the 429 arrives with `retry-after: 1013` (seconds). viem's `http` transport honours it: with its default `retryCount: 3`
  the page sat on skeletons for what would have been about 17 minutes, having sent four requests, with nothing in the console but
  two 429s. Our register in direct mode did exactly that until we set `retryCount: 0` and a 9 s timeout on every transport and
  moved every read (`arkiv_query`, `getBlockTiming`, `getEntity`, `getLogs`) behind one fallback that tries the other path.
- **Also measured:** `eth_getLogs` answers at most 100,000 blocks per query (`query exceeds max block range 100000`, about 55 hours),
  so "who kept this record alive since it was written" must be read in windows; and the relay's own `Retry-After: 30` had the same
  effect on a paced visitor until the same change.
- **Seen once more (12 Oct):** a visitor's map showed "Arkiv didn't answer just now (RPC Request failed. URL: … Request body: )".
  The relay's own fetch to the node had dropped (Node says only `fetch failed`; the cause code sits in `error.cause`), the relay
  passed that back as a JSON-RPC error, and two things on our side made it worse than it was: the fallback's word list knew the
  browser's "Failed to fetch" but not Node's "fetch failed", so the read did not go direct; and the banner showed the first 80
  characters of viem's message, which are the URL and "Request body:", never the reason viem keeps in `details`. Now the relay
  bounds each upstream call (8 s) and retries a dropped socket or a 5xx once, every "Relay error" sends the read to the other path,
  and banners show `details`.
- **Repro:** a viem `http` transport with default retries against the public RPC after the hour's budget is spent; watch the network tab.
- **Fix:** a `retry-after` that long is a "come back later", not a retry hint. Cap it (or say so in the docs next to the budget), and
  put the 100,000-block log cap in the JSON-RPC docs next to `eth_getLogs`.
- **Checked by:** friction-check `11-viem` (offline: against a local server that answers 429 with `retry-after: 1`, viem's
  default `http` transport sends 4 requests over 3.3 s, waiting the full retry-after each time; with `retryCount: 0` it sends one
  and fails at once) and `11-logs` (a 100,002-block `eth_getLogs` still answers `query exceeds max block range 100000`). STILL.

## 12. A key's monthly quota runs out silently, and its refusal is not JSON-RPC shaped

- **Expected:** a visible meter for an access key's monthly quota (used so far, resets when) on the Hub or in every response, and a
  refusal that a JSON-RPC client can read.
- **Actual (12 Oct):** three days after the key was made, every keyed `arkiv_query` answered HTTP 429 with
  `{"error":"QUOTA_EXCEEDED","message":"quota exhausted"}` and `arkiv-quota-used-percent: 100`. Nothing before that told us how
  much of the month was gone: the header is absent on a keyless read, our relay never looked at it on keyed ones (it is there: after a
  top-up it read `arkiv-quota-used-percent: 51`), the Hub does not show usage, and the quota's size and reset day are not written down.
  Measured from the top-up: the default quota is about 100,000 units a month, that is 1,000 queries, which one idle browser tab at our
  old cadence spent in under two hours. The body is the same non-JSON-RPC shape as item 5, so a
  JSON-RPC client that forwards `error` as it is (ours did) hands viem a string: no `message`, so the page said "RPC Request failed."
  and nothing else, and our fallback to a direct read never fired because the word "quota" was not in anything the client saw.
  `eth_*` methods kept working, so writes and the clock were unaffected; only reads died.
- **Repro:** read with a key until its quota is spent; compare the body with any `error` object the node sends for a bad query
  (those carry `code` and `message`).
- **Fix (for us):** the relay turns a string `error` into `{code, message}` naming the status and reason, goes keyless on its own
  anonymous budget while the key is out, and serves its last good answer for up to fifteen minutes when every path is refused; the
  page reads at most every 90 s when idle, never while hidden, and re-reads the drill net only during a drill. Idle cost fell from
  about 72,000 units an hour per open tab to about 8,000.
- **Fix (for Arkiv):** the meter we asked for here is now documented (the Hub's **Usage** tab, see the 18 Oct note below); what is left: state the quota's size and reset
  day on the access-keys page, and shape budget refusals as JSON-RPC errors (`{"error":{"code":…,"message":…}}`) so every client
  shows the reason.
- **Checked by:** friction-check `12-header` (a keyless read still carries no `arkiv-quota-used-percent`, though
  `access-control-expose-headers` lists it) and `12-docs`. **Changed (18 Oct):** the access-keys page now says the Hub's **Usage**
  tab shows the cost units used this month, the calls made and the date the quota resets, and that the Hub warns when the quota
  is reached. We can't tell from outside whether that was there on 12 Oct and we missed it, or was added since; either way "the Hub
  does not show usage" and "the reset day is not written down" no longer stand as written. Still true: the quota's size is not on
  the page, keyless reads carry no quota header, and the refusal's shape is not checked by machine (it needs a spent key).

## What went smoothly (with the same rigour)

- **Expiry is exact and enforced.** A 40-second entity was gone from `select` and `getEntity` on time, and nothing in our code deletes
  anything. The law's deadlines (15 days, 24 hours) map one-to-one onto lifetimes.
- **History survives expiry.** `.atBlock(n)` returns entities as they were at block *n*, including since-expired ones. Our drill's rewind
  slider and the CLI's `at` command are built on it (script item 8: alive now 0, at creation block 1).
  Re-checked 18 Oct (`ok-history`): the evidence entity is still returned `.atBlock(0x6ae4b)`, 288,000 blocks later.
- **Creation flags are exactly the right primitives.** `readonly` plus `permissionlessExtension` gives "anyone may keep this alive, nobody
  may change it" in one line. Our two-person test proved a second key extends a report it can't edit.
- **`executeBatch` is atomic and cheap.** Order + archive record in one transaction; 111 records in 12 transactions; deleting 10 duplicates in one.
- **Lifetime isn't priced on Tiramisu (yet).** The same create costs the same gas for a 1-day or a 365-day lifetime: 90,656 gas for the
  repro entity (script item 6), 97,160 for our slightly larger registrar profile on day one (friction-log.md); about 0.0001 GLM at 1 gwei.
  Re-checked 18 Oct (`ok-pricing`): 95,656 gas for the check entity at both 1 and 365 days.
- **Ownership transfer closes the last gap.** `readonly` stops edits, but an owner can still delete. Transferring a record to
  `0x…dEaD` makes deletion impossible while `permissionlessExtension` still lets anyone extend it: the former owner's delete was refused
  ("owned by 0x…dEaD, not 0xA272…") and a fresh stranger key extended it (`scripts/seal.ts --test`). Worth a line in the docs as a pattern.
- **Client-side validation saves gas where it exists.** The 128-byte `str` limit is caught before sending, with a message telling you to
  move the long form to the payload (script item 5). That's the right design, and it shaped our schema (legal basis as a short code).
  Re-checked 18 Oct (`ok-str128`): still refused with no transaction built.
- **Errors are mostly excellent.** Items 2 and 5 name their own fixes.

## Timing

- `createEntity` round trip (send + receipt) from India over the public RPC: 7.3–9.8 s.
- Block time 2 s (`getBlockTiming`).
- The full archive (`arkiv_query`, 111 entities with attributes and payloads, one page): 0.54–0.65 s direct with a key, 0.42–1.0 s through our Vercel relay, measured from India on 11 Oct 2026.
