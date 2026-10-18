# Timeline

Switched Off was built for the Arkiv Global Tour Stop between 9 and 18 October 2026. **There is no prior work. The baseline is
the first commit, [`254b8aa`](https://github.com/RohanGlitched/switched-off/commit/254b8aa9b11199ca58e0ad4217d1152d1701bfd8)
(11 Oct 2026, 18:16 IST).** Times are IST. Commit times come from `git log --format='%ad %s' --date=iso`; the times of the
test entity and the expiry evidence are their blocks' timestamps (`eth_getBlockByNumber`); the others are the `at` stamps the
scripts wrote into `scripts/seeded.json` and `scripts/corrections.json`.

## The first commit is one large commit

`254b8aa` adds 57 files (11,061 lines): the map, register, reports, drill, relay and the archive import. The app was written
locally from 9 Oct and committed for the first time on 11 Oct, in one go. The repository can't prove those uncommitted days;
what it can show is that nothing in it is older than the window:

- The newest order in the import (`dl-janpath-2026-10-09` in `research/orders-all.json`) is dated 9 Oct 2026, so the research
  that the first commit carries was finished on or after 9 Oct. `research/facts.md` says "Compiled 11 Oct 2026".
- The raw friction notes ([`arkiv/friction-log.md`](../arkiv/friction-log.md)), in the first commit, are all dated 11 Oct.
- The earliest Arkiv write the repository records is a 40-second test entity at block 435,522, **11 Oct, 17:43** (block timestamp
  12:13:16 UTC; `friction-log.md`). The registrar's archive import finished at 18:13 (`scripts/seeded.json`, `at`), three minutes
  before the first commit.

## Day by day

| Date | Commits | What happened |
|---|---|---|
| 9–10 Oct | 0 | Research and local development, not committed (see above). No Arkiv writes are recorded for these days. |
| 11 Oct | 22 (18:16–23:04) | 17:43 first test entity on Tiramisu. 18:13 archive import: 111 `record` entities in 12 batch transactions (e.g. `0xb329d2e0…ab51`, block 436,392). 18:16 first commit. Then: the GitHub Pages mirror, gas-tap limits, `friction.md` with a reproduction script, sealing of the archive to `0x…dEaD` in 5 batches (e.g. `0xf7bde6fe…2420`, block 437,666), the pinned expiry evidence (drill order created at block 437,835, 19:00), the cover image, a QA round that put the personal-data guard on every write, the logo, trust rules, 9 name-free corrections (`0x131f819f…519e`, block 442,578, 21:38), two review passes, full Hindi, and 3 more corrections (`0xdda96076…ddf70`, block 444,932, 22:56). |
| 12 Oct | 3 (13:50–14:13) | Reads survive a relay blip and a spent key; friction item 12 (the key's monthly quota). |
| 13–16 Oct | 0 | No commits. |
| 17 Oct | 1 (14:04) | Your own write shows on the next read (the browser skips the relay's shared cache after a transaction). |
| 18 Oct | over 40, from 11:07 (some of them merges) | Against the other India-track entries: the first screen led by the record and painted from a labelled snapshot; the `/proof` page (seven live checks); 294 unit tests and CI; `npm run friction`, its daily GitHub Action and a full re-check with the write checks; the rubric-shaped README, `arkiv/wallets.md`, `arkiv/evidence.md` and the personal-data account in `schema.md`; the report form in Urdu, Bengali, Assamese, Punjabi and Odia; citations, CSV/JSON downloads and RTI request drafts; 76 newer orders researched and sealed (187 on the register) and 36 corrections from better sources; friction item 13 (page two refused without the first page's block), found and fixed the same hour; the relay's share-and-budget rules; a review round by three independent reviewers and its fixes. Every transaction is listed in `arkiv/schema.md`. |

The submission closes on 19 Oct 2026, 04:29 IST.

## What outlives the entities

Archive records live two years and reports six hours; an order lives only while it is in force. The transactions above, the
`atBlock` reads in [`arkiv/evidence.md`](../arkiv/evidence.md) and the demo video (https://youtu.be/W042WqAoYN0, 2:52) stay
checkable after the entities expire.
