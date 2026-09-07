# Release acceptance evidence

StateBeats 0.2.0 is a locally verified headless and desktop release candidate. The owner
deferred Quest 3 testing. Device verification remains necessary for hardware performance,
comfort or accessibility usability claims.

## Locally verified on Windows, 2026-09-08

| Evidence | Actual result |
|---|---|
| `npm run check` | Strict types, core boundaries, formatting and production build; 59 tests passed in 11 files |
| Pure transition | Frozen-state checks, host/random restrictions, 1,000 equal canonical repetitions |
| Geometry and requirements | Sphere/box/OBB/capsule relative sweeps, timing edges, tracking, ownership, combined/shared/hold/hazard, linked partial results and director capacity |
| Time and persistence | Manual batch/single equivalence, scheduler jitter/backlog/stalls, pending/retry checkpoint restoration, compiled replay and tamper rejection |
| Scenes | Simultaneous 500-metre approaches from six directions, moving emitters, captured stage rotation, independent flight, stationary ground targets, stateless trails and invalid-reference rejection |
| Music and presentation | Frequency discrimination, silence, interpolation, seeded chart generation and independent presentation-integrity hashes |
| Real tools | Actual CLI JSON-lines and MCP handshake/resource/tool calls match the shared service, including music generation and semantic perception |
| Extensions | External interaction/scoring/arbitration, observation bot, JSON/text perception, stores and a registered rising-mole appearance using real ground collision |
| Browser suite | 13 passed, none skipped: Chromium player/input/text/import/preferences/audio/conformance; Firefox audio/conformance; WebKit conformance |
| Portable recordings | The same Node-compiled recordings, including scene/music observations, replay and checkpoint continuation matched Chromium, Firefox and WebKit |
| Desktop play | Real mouse input earned a hit and completed the arena; bot play, pause/resume, export/restart and the 66-interaction sun journey passed |
| Text and muted play | Keyboard-only text completion earned 8 hits/800 points with canvas and audio unavailable; persisted muted preferences played and resumed without constructing an audio context |
| Imported audio | A real local WAV decoded, generated a saved scene map and played through the worker; exported replay verified headlessly |
| Audio output | Actual OfflineAudioContext samples proved non-silent stereo cues, song lead-in, correct resume offset and silence on pause in Chromium and Firefox |
| Synthetic XR | Source-order-independent handedness, normalized poses and tracking loss/reacquisition tested at the input adapter boundary |
| Bird avoidance | Standing head poses incur penalties; ducking poses clear the same authored paths through ordinary commands |
| Packaged install | Six npm tarballs installed together in a fresh OS-temp directory; CLI reproduced 8 hits/800 points and verified replay; installed SDK scene/music/cue APIs worked |
| Clean source | Archive extracted outside the working tree; npm ci, full check, demo, headless and scene/music examples, and CLI run/generate/validate/verify passed |
| Packaged static player | Six maps and the sun scene loaded; hashed audio-analysis worker generated a chart, the song completed and its replay verified; text entry earned a hit, guide served, development harness absent |

Runtime: Node 24.20.0 x64, Windows; AMD Ryzen 9 7950X. The graphical reference baseline
is Chromium. Fixtures: Chromium 153.0.8010.12, Firefox 155.0 and WebKit 26.6.
Windows Playwright WebKit does not supply OfflineAudioContext; that unsupported
audio fixture is excluded, not counted as passing. CI is configured for Node 24 on
Windows/Linux/macOS plus a Linux browser matrix; **remote CI has not run**.

Reports are produced in `artifacts/benchmark.json`, `package-smoke.json`, `source-smoke.json`, `player-smoke.json`
and the Playwright report. The release bundle includes copies of the local evidence.

## Performance measurement

Two actors/six effectors, 1,000 ticks per fixture, Node 24.20.0 on the desktop CPU above:

| Active entities | Median tick | p95 tick | p99 tick |
|---|---:|---:|---:|
| 32 | 0.183 ms | 0.276 ms | 0.359 ms |
| 128 | 0.626 ms | 0.836 ms | 0.960 ms |
| 512 | 2.522 ms | 3.024 ms | 3.278 ms |

The 120 Hz tick budget is 8.333 ms. The 18,218-tick showcase completed headlessly in
433 ms with 92 hits and no misses. The sun journey completed 8,160 ticks with 66 hits,
6,600 points and no misses. Simulating 4,080 observation frames with structured copying
took 732 ms total; p95 step/observe/copy cost was 0.216 ms, peak observation size 7,603 bytes.
Those figures exclude GPU rendering, browser/audio callbacks and physical input.
The scripted actor leaves its head untracked; separate standing/ducking tests prove bird
collision behavior. The bot's score alone is not evidence of physical avoidance.

Process memory at measurement end was about 200 MiB RSS / 64 MiB used heap, including
Node, the benchmark, compiled content and replay history. This is neither a peak nor a
per-session allocation. Exact values and timestamps are in `artifacts/benchmark.json`.
These are desktop CPU results, not Quest performance or end-to-end latency.

## Deferred checks and boundaries

- Actual Quest 3 entry, menus, physical reach/turning, tracking recovery and comfort.
- Quest sound alignment, understandable rear/hand cues, and blind/deaf user feedback.
- Quest frame/input latency, memory and sustained ten-minute play; see QUEST_PLAYTEST.md.
- Remote CI when the maintainer publishes the source.

No online multiplayer, accounts, marketplace, general rigid-body engine, mesh collision,
rotating elongated sweeps, APK, graphical map editor or model service is supplied. Local
multi-actor simulation, a director role, native headless building and standalone browser
execution are implemented. Host-registered adapters are trusted code, not sandboxed plugins.
Replay verification reconstructs history and can be expensive for long sessions. Generated
music charts use a supplied BPM grid, not automatic musical transcription. Browser file
decoding happens before the ten-minute duration check; compressed file size is checked first.

These checks were completed before the initial GitHub push. They do not establish deployment,
npm publication or remote CI success; current workflow results are available in GitHub Actions.
