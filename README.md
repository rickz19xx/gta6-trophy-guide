# GTA VI trophy guide

[![make.fun · gta6-trophy-guide-01](https://make.fun/badge/gta6-trophy-guide-01.svg)](https://make.fun/bounty/gta6-trophy-guide-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)
[![rank](https://make.fun/badge/gta6-trophy-guide-01/rickz19xx/gta6-trophy-guide/rank.svg)](https://make.fun/bounty/gta6-trophy-guide-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)
[![reward](https://make.fun/badge/gta6-trophy-guide-01/rickz19xx/gta6-trophy-guide/reward.svg)](https://make.fun/bounty/gta6-trophy-guide-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-guide-01)

Bounty and leaderboard: [make.fun · gta6-trophy-guide-01](https://make.fun/bounty/gta6-trophy-guide-01).

55 trophy write-ups — what each trophy wants, where and how to get it, and what can be missed along
the way — shipped as plain static files in `app/`, with a searchable, filterable list, a detail pane
per trophy and a roadmap to the platinum. No build step, and nothing is loaded from the network at
runtime.

Run it with `node serve.ts` and open http://localhost:8080. Ticked trophies, the filter chips and the
search box are all held in localStorage, so progress survives a reload; Export writes that state to
JSON and Import loads it back.

To build the hand-in, run `rm -rf out && MAKEFUN_OUTPUT_DIR=out node main.ts`: it copies `app/` and
`screenshots/` into `out/` and writes `out/dossier.json`.
