# Wallets

Every Tiramisu address that writes to or owns Switched Off entities, what it does, and where to look it up. Chain ID `7738577`.
Every entity also names its own writer: `$creator` is on every read, and the site prints it on each entity page.

| Address | Role | Writes entities? | Explorer |
|---|---|---|---|
| `0xA2724EA69eA093677D8426E7FE20644EE90a0E3e` | **Registrar.** Filed the 111 archive records (12 batch transactions, 11 Oct; before sealing it deleted 10 duplicate copies of its own in one batch, `scripts/dedupe.ts`), sealed them in 5 batches, filed 13 corrections (1 for a wrong date, 12 to remove names, see [schema.md](schema.md#personal-data-what-went-wrong-and-what-we-did)), the registrar profile, and the pinned expiry evidence (a drill order that lived 30 blocks). It is the only address in [`src/lib/registrars.ts`](../src/lib/registrars.ts): readers trust a correction only from it or from the original's own filer. | Yes: 124 live `record` entities today (111 + 13), all now owned by `0x…dEaD` | [address](https://tiramisu.explorer.arkiv.network/address/0xA2724EA69eA093677D8426E7FE20644EE90a0E3e) |
| `0xFe54502be8aA581d79D0e13A26D00afa61dd6DF4` | **Gas tap** ([`api/drip.ts`](../api/drip.ts)). Sends 0.002 testnet GLM (about twenty writes) to a visitor's in-browser key when it holds less than 0.001, at most once a minute per key, six per ten minutes per IP, 80 an hour per server instance. | No. It only sends plain value transfers (`sendTransaction`); it never calls the Arkiv entity contract | [address](https://tiramisu.explorer.arkiv.network/address/0xFe54502be8aA581d79D0e13A26D00afa61dd6DF4) |
| Visitors' throwaway keys | **Reporters, confirmers and transcribers.** Generated in the browser on first visit ([`src/lib/wallet.ts`](../src/lib/wallet.ts)), kept in that browser's `localStorage`, never sent to our server (the gas tap gets the address only). They file reports, confirm (extend) reports and emergency orders, keep records alive, withdraw their own reports, file community orders on the File page and run drills. "Forget this browser’s key" on the Report page drops it. | Yes: `report`, community `order` + `record`, and the drill’s `net = drill` entities | One per browser; each entity page links its `$creator` to the explorer |
| `0x000000000000000000000000000000000000dEaD` | **Owner of every sealed entity.** Nobody holds its key, so nobody can delete, shorten or transfer what it owns; `permissionlessExtension` still lets anyone extend it. | No. It only owns: entities are handed to it by `changeOwnership` or a batch's `ownershipChanges` | [address](https://tiramisu.explorer.arkiv.network/address/0x000000000000000000000000000000000000dEaD) |

Two scripts write with other keys, outside the app's namespace or without creating entities:

- `scripts/seal.ts --test` funds a freshly generated stranger key from the registrar, and that key **extends** a sealed drill record
  (an extension, not a new entity) to show that anyone can keep a sealed record alive.
- `npm run friction -- --write` writes short-lived check entities under `app = "switched-off-friction"` (not the register's `app`)
  with `FRICTION_KEY` or the registrar's key, and deletes them again. Readers never see them.

Check the registrar's records yourself (one keyless call; it costs 100 units of the keyless budget):

```bash
curl -s -X POST https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"app = str('switched-off') AND type = str('record') AND net = str('live') AND \$creator = addr(0xA2724EA69eA093677D8426E7FE20644EE90a0E3e)\",{\"select\":{\"key\":true,\"owner\":true,\"expiresAt\":true},\"limit\":\"0xc8\"}]}"
```

On 18 Oct 2026 (block 726,460) this returned 124 entities, every one owned by `0x…dead`.
