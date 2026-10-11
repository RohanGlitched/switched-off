<p align="center"><img src="docs/cover.png" alt="Switched Off: India at night as thousands of lights; districts under a shutdown order are dark" width="100%"></p>

# Switched Off

**India's register of internet shutdowns, kept on Arkiv so that the record of a shutdown can't itself be switched off.**

Live: **https://switched-off.vercel.app** · Mirror: **https://rohanglitched.github.io/switched-off/** · Track: Arkiv Global Tour Stop, **Best Indian Use Case**

India led the world in internet shutdowns six years running (Access Now: 134, 121, 109, 106, 84 and 116 from 2018 to 2023), and
in 2021 Parliament's IT committee recommended a central database of every shutdown, with its duration, reasons and authority.
The Union government later told the committee it is "not aware of the number of internet shutdowns imposed by the States".
There is still no official register. Volunteer trackers such as SFLC.in's do careful work, on one team's server.
Switched Off is an open register on Arkiv that anyone can add to, nobody can quietly edit or delete, and anyone can keep alive.

## What it does

- **A live map of India at night.** About 4,000 lights, one cluster per district. A suspension order in force switches its
  districts off. A district people report as dark with no published order behind it burns red.
- **The register.** 111 sourced orders from 2019 to 2026 (Manipur, Jammu and Kashmir, Haryana, Punjab, Rajasthan, Delhi and
  more), each printed as a page of the Gazette with its authority, stated reason, renewal chain and sources.
- **Reports from the ground.** Anyone can say "no internet here" in one tap: no sign-up, no name, a throwaway key in the
  browser. Reports fade in six hours unless a neighbour confirms them. Made offline, they wait on the phone and go out when
  the signal returns, marked late.
- **A drill.** The same rules at one legal day per minute: issue an order, watch its districts go dark and relight on time,
  watch an unconfirmed emergency order die after a day, rewind to any past block.
- **Play the history.** Replay every order on file from 2019 to today on the map.
- **Sealed archive.** Every record is readonly and then handed to an address nobody holds a key for: nobody can edit or delete
  it, not even us, and anyone can extend it. Mistakes get a correction entity that names the record it corrects.
- **Anyone can file.** A form for transcribing a published order (source link required, designations not names), labelled as a
  community transcription.
- **Can't be switched off.** A one-file mirror, an independent GitHub Pages copy and a zero-dependency CLI all read Arkiv
  directly, and take any Arkiv endpoint. Block this site and the register is still there.

## How the law becomes the database

| The rule (Telecommunications (Temporary Suspension of Services) Rules, 2024) | On Arkiv |
|---|---|
| An order runs for a specified duration, at most 15 days | The `order` entity expires at its lapse block; nothing can stretch it. A renewal is a new entity linked with `renews` and `seq`, so every renewal is counted |
| An emergency order lapses in 24 hours unless confirmed | Filed to expire 24 h after issue; confirming it is extending it, and only the filer's key can |
| Orders must be published, with reasons | Readonly entities with the stated reason and sources; a correction is a new entity |
| (no rule) The record should outlive the order | A `record` written in the same batch, readonly, that anyone may extend |
| (citizens) "It's dark here" | A `report` that lives 6 h and that anyone may extend (confirm) but nobody may edit |

Full schema, attributes, lifetimes and exact queries: [`arkiv/schema.md`](arkiv/schema.md).
What was hard, with versions and reproductions: [`arkiv/friction.md`](arkiv/friction.md).

## Run it

```bash
npm install
cp .env.example .env.local   # FAUCET_KEY, ARKIV_KEY (optional for reading)
npm run dev                  # http://localhost:5190
```

Read the register without the site:

```bash
node cli/switched-off.mjs active      # orders in force now
node cli/switched-off.mjs state MN    # every order on file for Manipur
node cli/switched-off.mjs reports     # live citizen reports
```

Rebuild the archive import (needs a funded key in `.env.local`): `npx tsx scripts/seed-archive.ts --dry`, then without `--dry`.
Rebuild the map: `python scripts/build-map.py` (Datameet shapefiles, see credits).

## Reproducible evidence

- Registrar: `0xA2724EA69eA093677D8426E7FE20644EE90a0E3e` (archive import, 12 batch transactions, 11 Oct 2026; keys in `scripts/seeded.json`)
- Visitors' gas tap: `0xFe54502be8aA581d79D0e13A26D00afa61dd6DF4`
- Every number on the site maps to a query listed on the [Data page](https://switched-off.vercel.app/data) and in `arkiv/schema.md`.

## Built during the challenge

All code, data and design were made between 9 and 18 October 2026 for the Arkiv Global Tour Stop. There is no pre-existing
work; the baseline is the first commit of this repository. Libraries: React, Vite, viem, `@arkiv-network/sdk` 0.8.1.

## Credits and sources

- District boundaries: [Datameet](https://github.com/datameet/maps) Census 2011 districts, CC BY 2.5 India. India outline: Datameet `india-composite`, CC0.
- Every order carries its own sources; the research notes are in [`research/`](research/). Headline facts: Access Now #KeepItOn,
  SFLC.in, the Supreme Court in *Anuradha Bhasin v. Union of India* (2020), the Parliamentary Standing Committee on Communications
  and IT (26th Report, 2021), Top10VPN, ICRIER.

MIT licensed.
