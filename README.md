# Leonida Ledger — a GTA VI trophy companion

[![make.fun · gta6-trophy-guide-01](https://make.fun/badge/gta6-trophy-guide-01.svg)](https://make.fun/bounty/gta6-trophy-guide-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)
[![rank](https://make.fun/badge/gta6-trophy-guide-01/rickz19xx/gta6-trophy-guide/rank.svg)](https://make.fun/bounty/gta6-trophy-guide-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)
[![reward](https://make.fun/badge/gta6-trophy-guide-01/rickz19xx/gta6-trophy-guide/reward.svg)](https://make.fun/bounty/gta6-trophy-guide-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)

A single-page, offline trophy tracker and platinum roadmap for the 55 GTA VI trophies.
No build step, no dependencies, no network at runtime: vanilla ES modules, hand-written CSS,
and one JSON data file fetched after first paint.

```
app/
  index.html            shell, three views, controls
  style.css             layout, grade colours, responsive down to 390 px
  app.js                state, filters, detail pane, roadmap, export/import
  data/trophies.json    55 trophies: name/description/grade verbatim from the kit,
                        plus guide, steps, checklist, sources, chapter, missable note
screenshots/            four 1280x800 captures (cover = 1-checklist.jpg)
shots.json              which view each capture was taken of
main.ts                 hands the entry in: copies app/ + screenshots/ to /output,
                        writes /output/dossier.json with the vendored make.fun library
vendor/                 make.fun frontend library (untouched)
serve.ts                tiny static server for local review
```

## Run it

```sh
node --experimental-strip-types serve.ts      # http://localhost:8080
# or any static server pointed at app/
```

## What it does

- **Tracker** — tick any of the 55 trophies; totals, per-grade counts and a progress bar update
  live. Counter trophies (stunts, kills, cash) clamp to the official total and earn themselves
  when full. Progress is saved to `localStorage['leonida-ledger/v1']`.
- **Filters** — category chips (story, missable, side, activity, collectible), grade select,
  missing-only switch and free-text search compose; the header reports `N of 55 shown`;
  one button clears them.
- **Detail** — where to find it, how to earn it in steps, what to check off, and two or more
  named sources per trophy, linked. Missables carry the chapter where they close.
- **Roadmap** — five ordered phases from prologue to platinum, collectible counts per phase,
  a "do not miss" board of the ten trophies that close for good, and the route's caveats.
- **Spoiler mode** — hides story trophy names and guides in list, detail and roadmap until
  earned or explicitly revealed; the preference persists.
- **Export / import** — download a JSON save, drop it back in (or shift-click Import to paste);
  import merges earned flags and takes the larger counter values.
- **Failure path** — if `data/trophies.json` cannot be read, the shell stays usable and says so.

Keyboard: `/` search · `g` grade · `s` spoiler · `e` export · `t` roadmap · `?` shortcuts ·
`j`/`k` move between rows · `x` tick · shift-click a counter's `+` to add ten.

## Data and sources

Trophy names, descriptions and grades are the kit's official list, unchanged. Guides, steps,
checklists and roadmap are written for this entry, with facts attributed to named sources
(PowerPyx, IGN, Game8, Rockstar's own Newswire and trophy list) linked per trophy.

## Hand-in

```sh
node --experimental-strip-types main.ts        # writes /output (MAKEFUN_OUTPUT_DIR to override)
```

Caps held: app text 152,004 B (< 163,840 B), first load 67 KB raw / 20 KB gzip-9,
four screenshots at 133–153 KB each (< 256 KB), `dossier.json` written by `main.ts` alone.
_Provenance: rebuilt under recording, 2026-11-21._
