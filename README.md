# GTA VI trophy guide

An offline trophy guide for GTA VI: 55 trophy write-ups (what it wants, where and how, what can
be missed) as plain static files in `app/`, with a searchable, filterable list, a detail pane
and a roadmap to the platinum. It loads nothing over the network — no fonts, no CDN, no build step.

Run it with `node serve.ts` (or `node --experimental-strip-types serve.ts --port 8123`) and open
http://localhost:8080. Ticking a trophy, the filter chips and the search are kept in localStorage,
so progress survives a reload; Export saves that progress as JSON and Import reads it back.

To build the hand-in, run `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`: it copies `app/`
and `screenshots/` into `out/` and writes `out/dossier.json`.
