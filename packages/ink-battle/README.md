# @statebeats/ink-battle

Ink-Battle × StateBeats: Between the Lines. An original 3:20 rhythm map inside
Ink-Battle's procedural sketchbook, across six recorded ages of actual combat.

Primary exports: `inkBattleMap`, `inkEncounters`, `sampleInkBattle`, `inkChapterAt`,
`inkChapters`, `inkLaunches`, `inkHeading`, `inkSoundtrack`, `battleSource`.
The primary entry is headless; `./visuals` separately exports the original Three.js
book and army models. `./audio/between-the-lines.mp3` contains the original score.
`./upstream/src/sdk/session.js` exposes the pinned, unmodified battle Session.

Install this package alongside the matching StateBeats core and SDK tarballs,
or use the monorepo with Node 24. Three.js is an optional peer for visuals only.

These are six deterministic excerpts, not a continuous evolving match. Neutral
player encounters are StateBeats choreography; parrying does not change the
recorded armies' outcome. All actual interactions use normal StateBeats poses,
collisions, clocks and replays.

[Design, reproduction and live integration](https://github.com/RONITERVO/StateBeats/blob/main/docs/INK_BATTLE.md)

Apache-2.0. See LICENSE, NOTICE and PROVENANCE.json. This package and the exported
collaboration map are excluded from StateBeats' CC0 content dedication.
