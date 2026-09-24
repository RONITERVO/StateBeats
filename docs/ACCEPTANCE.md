# Release acceptance evidence

StateBeats 0.3.0 is a development release candidate built on the verified 0.2.0 foundation. The owner
deferred Quest 3 testing. Device verification remains necessary for hardware performance,
comfort or accessibility usability claims.

## Readiness review fixes, 2026-09-25

All four PR #5 findings were reproduced with failing tests. Text output now announces each
readiness phase within a single second without repeating stable frames. Desktop assistance
rejects hidden targets at its shared geometry entry point, covering spheres, boxes and
capsules while retaining legacy behavior. Manual next-cue stepping includes preview,
preparation and first eligibility, including the beginning of early strike windows.

The published map JSON Schema now describes authoring input rather than normalized output.
An independent JSON Schema validator accepts empty/partial readiness settings and every
bundled map, and rejects malformed readiness values consistently with runtime validation.
The same generation fix also makes other runtime-defaulted map fields optional in editors.

`npm run check` passed **145 tests in 22 files**, strict types, formatting, core boundaries
and production build. All **nine targeted browser cases** passed: six manual-readiness cases
across Chromium, Firefox and WebKit, plus three desktop input/worker/replay cases. Fresh
installation and smoke checks passed for all six package archives. The earlier
full feature checks are recorded below; no core scoring or trajectory code changed here.

## Staged note readiness, 2026-09-25

Event Horizon's stationary holds opt into a shared readiness schedule: hidden until two
beats before first eligible contact, a faint hollow waiting cue, then preparation during
the last beat. At 150 BPM this is an 800 ms preview with 400 ms of brightening. Artwork,
semantic solids and bounded path guidance use the same preparation progress. Other maps
can opt in per note with beat or millisecond windows; appearance adapters can interpret
readiness independently of their existing presence/release effects.

`npm run check` passed **133 tests in 21 files**, strict types, formatting, core boundaries
and production build. New regressions cover tempo changes, short/zero lead time, early
strike contact, restored checkpoints, metadata integrity and unchanged gameplay. All
**26 browser cases** passed, including Node/Chromium/Firefox/WebKit conformance. The two new
WebGL cases exercise actual Event Horizon phases, repeated/rewound frames, high contrast,
reduced motion, nested material envelopes and adapter-owned visibility/readiness. Rendered
waiting, preparing and eligible frames were also inspected visually.
All **three production Pages cases** passed, including automatic soundtrack loading,
pause/resume synchronization, full Event Horizon playback and a verified zero-miss replay.
All six package archives installed and exercised successfully in a fresh project. The clean
source archive passed installation, the full `check` command, CLI operations and all examples;
its complete Event Horizon example recorded 620 hits and zero misses.

The saved pre-change 19,200-tick Event Horizon recording still verifies. Rebinding its map
to the new presentation policy also verifies with the same compiled program, final state
hash and event digest. The presentation hash changes as intended: visual anticipation can
affect practical difficulty even though collision timing and scoring are unchanged.
Maps without readiness retain their previous presentation identity and behavior.

These are desktop software checks. Quest 3 readability, reaction comfort and performance
remain unverified; the owner deferred physical testing. No comparative play-quality claim
is established by the scripted player. Authoring and adapter contracts are documented in
[NOTE_PRESENTATION.md](NOTE_PRESENTATION.md).

## Recording binding review fix, 2026-09-24

The new PR #4 finding was reproduced: deleting both `presentationHash` and all optional
note presentation settings allowed checkpoint restore and replay verification to accept
substituted defaults. Default-only maps also accepted missing binding values. Both APIs now
require a well-formed hash before reconstruction and compare it unconditionally afterwards.
The TypeScript recording contracts require the field. Every committed 0.2/0.3 exporter
already writes it, so valid version-1 exports require no migration; unhashed files fail.

`npm run check` passed **124 tests in 20 files**, strict types, formatting, core boundaries
and production build. Seven new Node regression cases cover metadata/hash stripping,
default-only maps, malformed/mismatched hashes and intact export compatibility. All three
new browser cases passed in Chromium, Firefox and WebKit, exercising both recording APIs.
A pre-fix 19,200-tick Event Horizon replay still verifies with identical state/event hashes.
Hashes establish content consistency; score hosts must compare presentation identity with
an independently trusted map, since portable unsigned recordings do not prove authorship.

## Additional presentation review fixes, 2026-09-24

Three further PR #4 findings were reproduced with failing regression tests, then corrected.
Finished sessions clear earlier release tails and targets resolved on the terminal tick;
hit, miss, hazard expiry, checkpoint restore and repeated post-finish advances are covered.
The browser test keeps rendering the results scene and verifies that no target remains.
Legacy observations allocate no fallback guide buffers, while explicitly supplied custom
guides still update and dispose normally.

Shared trajectory lookup now uses binary search with the original interpolation arithmetic.
Property tests compare exact values against the prior sequential algorithm at keys, between
keys, outside the motion interval and in reverse query order. A legal 256-key full guide
producing 288 points fell from 39,037 to 4,724 motion-key reads per sample. A deterministic
read-count limit guards the scaling independently of machine timing; this is not an FPS claim.
The pre-fix 19,200-tick Event Horizon recording still verifies with identical state/event hashes.

`npm run check` passed **117 tests in 19 files**, strict types, formatting, core boundaries and
the production build. All **seven targeted browser cases** passed: four Chromium presentation
cases and three Node/Chromium/Firefox/WebKit conformance cases. All **three production Pages
cases** passed, including complete bundled soundtrack playback and verified zero-miss replay.
The previous commit's GitHub CI was green; subsequent commits require their own remote checks.

## Note presentation review fixes, 2026-09-24

All five PR #4 findings were reproduced and corrected. Core transitions now expose detached
final states for removed entities, so release effects receive completed strikes/holds and the
final reset state of failed holds. World state, events and scoring rules are unchanged. A full
19,200-tick Event Horizon recording captured before these fixes verifies afterwards with the
same state hash and event digest.

The player fades semantic rings, cores and labels along with artwork, including particles.
The default envelope restores unfaded material opacity before adapter updates, preserving
animation across repeated frames and zero visibility. Labels share textures without sharing
opacity. Suppressed custom guides remain owned by the scene and are disposed exactly once.

`npm run check` passed **112 tests in 18 files**, strict types, formatting, core boundaries and
the production build. Two targeted Chromium presentation cases passed with actual WebGL
rendering, independent simultaneous labels, animated particles and disposal counters. All
three Node/Chromium/Firefox/WebKit conformance cases passed. All three production Pages cases
passed, including complete bundled Event Horizon playback, synchronized resume, zero misses
and verified replay. Physical Quest testing remains deferred.

## Note presentation revision, 2026-09-24

The SDK projects authoritative trajectories into versioned appearance, arrival, reveal and
release cues. Event Horizon's holds use a 0.75-beat leading window and 0.5-beat trail, with
stationary emergence and 65 authored motion samples. Scoring rules remain unchanged. Full-route
previews remain available to authoring capabilities; player cues use the map's reveal policy.

The clean source archive passed **106 tests in 16 files**, strict type checking, formatting,
kernel boundaries, production build and CLI/examples. Target-presentation coverage includes
tempo changes, exact transformed trajectory alignment, no pre-spawn revelation, dense paths,
zero-length timing at rounded offsets, appearance before contact, release/restore/replay,
same-tick director spawns, metadata integrity and bounded disposable guide geometry.

All **18 browser cases** passed, including Node/Chromium/Firefox/WebKit presentation and replay
conformance and actual WebGL guide rendering/disposal. All **three production Pages cases**
passed across the suite and one isolated rerun. The first 4x Event Horizon run entered the
timing-resync pause while package preparation was also running; the unchanged isolated run
completed, decoded its bundled MP3, resumed in sync and exported a verified zero-miss replay.
No timing guard or scoring assertion was weakened. All six package archives installed in a
fresh project and exercised the new presentation API. The clean source's full Event Horizon
example recorded 620 hits and zero misses; tracked-head clearance remains covered by the suite.

These are desktop software checks. Quest 3 frame timing, human reaction/readability and the
preferred musical lookahead still require headset playtesting. Contracts and migration notes
are in [NOTE_PRESENTATION.md](NOTE_PRESENTATION.md).

## Musical turn revision, 2026-09-24

The shared turn planner replaces Event Horizon's long section rotations with 82 turn events
and 27 reversals, including a score-authored sustained sweep. Peak planned rates at normal
speed stay below 78 degrees/second and 220 degrees/second². All 620 targets remain; authored
hand inspection reports no issues and a 5.030 m/s peak. The room-scale-1.20 tracked-head test
completes with zero misses/hazard contacts and matching checkpoint/replay continuation.

93 tests in 15 files passed with strict types, formatting, core boundaries and production
build. Browser coverage includes saved musical controls, recipe reconstruction, actual audio
decoding and Node/Chromium/Firefox/WebKit replay conformance. All 17 browser cases passed
across the main run and one focused rerun: a rebuild during the first run caused Vite to
reload the imported-song test; the unchanged-build rerun passed. All three production Pages
cases passed, including bundled soundtrack playback and musical Master generation under
the project path. Turn/shape properties, invalid adapter output and real CLI/MCP parity are
covered. The planner has constant-tempo authoring limits described in [TURNS.md](TURNS.md).

These checks establish software behavior, not Quest comfort or musical preference. Hardware
playtesting remains the next acceptance step.

## Original Event Horizon showcase, 2026-09-24

The complete original 150 BPM/160-second composition ships as a 3.8 MB MP3 with SHA-256
identity and analysed music features. It has 620 scoring targets, 52 held paths, 84 linked
chords and seven avoidance volumes. At the authored profile, held-lifetime inspection reports
no conflicts/reach/speed issues and a 5.105 m/s peak hand-center speed. Ordinary hand poses
plus a tracked duck/lean head trace complete at room scale 1.20 with no missed targets or
hazard contacts; a standing tracked head is penalized. Checkpoint continuation and replay agree.

**86 tests in 14 files** passed, along with strict types, dependency boundaries, formatting
and production build. Audio measurement on the final distributed MP3: about -14.38 LUFS,
-1.15 dB true peak, 5 LU loudness range; decoded samples are non-silent and unclipped.
Full Node/Chromium/Firefox/WebKit recording conformance includes the new map. The expanded
fixture needed a larger test time limit in Firefox/WebKit; conformance assertions remain intact.
All three production Pages tests passed, exercising actual soundtrack download/decode,
pause/resume offsets, map-specific report controls and complete playback under the project path.
The stage compiles and renders once before starting the simulation clock, so initial shader
preparation cannot consume the opening or trigger a startup timing pause.
All nine desktop/experience browser cases also passed after that startup change. Fresh
installation of all six package archives resolves and verifies the bundled audio. A clean
source archive passed all 86 tests, the full build/check and CLI/examples, including the
complete Event Horizon headless replay (620 hits, zero misses).
Linux CI exposed a desktop gesture begun before stage preparation finished being dropped.
A delayed real-worker regression reproduced it; retaining held input through preparation
fixed it, and all three desktop gameplay tests passed again without weakening score checks.
Hardware Quest performance and human musical/readability judgments remain unmeasured.

## Choreography verification on Windows, 2026-09-24

The pre-merge review follow-up adds ten regression/profile tests: **78 tests in 13 files**.
They cover long-song emission holds, stationary starts, expiry bounds, late previews,
moving/box/capsule desktop aiming, continuous wide expert movement and shared service/replay
verification of personal layout. All **16 browser cases** passed, including saved recipe
restoration; one case was rerun after simultaneous Playwright suites collided in their output
directory. The Pages suite now has a separate output directory. Both production Pages tests
passed under `/StateBeats/`, exercising gameplay/replay, personal room scale, authoring-worker
rebuild, the guide and text player. These are local results; see the PR checks for the current
commit's remote status. The table below records the earlier 0.3.0 baseline.

Node 24.13.0 x64. Results below apply to the 0.3.0 choreography work; the older baseline
and performance measurements remain separately dated below.

| Evidence | Actual result |
|---|---|
| `npm run check` | Strict types, core boundaries, formatting and production build; 68 tests passed in 12 files |
| Generation contracts | Seed reproducibility, input immutability, supplied beat offsets, time-based anticipation, silence rejection and malformed adapter rejection |
| Movement checks | Property cases across seeds, tempos, tick rates and conservative reach/speed profiles; impossible hand reservations and out-of-reach paths detected |
| Rail/turn separation | Both arrival styles, mixed placement and 500-metre sources; late rail completion cannot use the reserved turn interval |
| Pose play | Generated holds and strikes played through ordinary commands with no misses; checkpoint previews restore and recordings verify |
| Tool service | Composition and inspection use shared SDK operations; observer permissions and mutation retry semantics checked |
| Browser suite | 15 passed: Chromium player/input/import/rebuild/export/preferences/text/audio/conformance; Firefox audio/conformance; WebKit conformance |
| Cross-runtime replay | All seven original sequences, including Phrases in orbit, agree with Node through replay and checkpoint continuation |
| Imported audio | Real WAV decode, cached-analysis rebuild and recipe/report export; positive and negative device offsets verified with rendered audio samples |
| Reference player | New choreography finishes with zero missed notes in scripted play; real mouse poses hit a target at a different depth; remaining held paths render from observations |
| Packaged install | All six 0.3.0 tarballs installed together in a fresh temporary directory; CLI demo/replay and installed SDK scene/music/choreography APIs passed |
| Clean source | Source archive extracted outside the checkout; npm ci, all 68 tests, strict checks, build, CLI operations and headless/scene/choreography examples passed |
| Static release player | Two production-browser checks passed: actual song decode, cached-analysis rebuild and report export; Phrases in orbit completed with no misses |

The original choreography example produced 176 note heads, six held paths and 36 paired
moments. Ordinary pose commands earned all 176 hits with zero misses and a verified replay.
The packaged player was served locally on port 4183 for the production checks. Release
archives and checksums are under `artifacts/release/0.3.0/`; packages remain unpublished.

The movement inspector covers authored hand centers and nominal hand reservations. It does
not establish shoulder anatomy, full-body clearance, physical fatigue, perceptual readability,
or room safety. Scripted completion does not establish human playability. The current 20 Hz
music analysis and supplied tempo/offset do not perform musical transcription.

See [the product direction](DIRECTION.md), [choreography contracts](CHOREOGRAPHY.md) and
[the Quest playtest](QUEST_PLAYTEST.md) for the next gates. No claim of superior play quality
to Synth Riders follows from the automated results.

## Earlier 0.2.0 baseline on Windows, 2026-09-08

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
