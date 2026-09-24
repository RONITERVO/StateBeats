# Musical choreography

`generateChoreography(music, options, adapters?)` returns `{ map, report }`. The map is an ordinary version-1 StateBeats map: it runs through the same compiler, simulation, replay, worker and text player. `generateMusicMap` remains a convenience entry point returning only the map. Existing saved maps retain their authored behavior; newly generated maps use `statebeats/choreography-v1`.

```js
import { analyzePcm, generateChoreography, inspectChoreography } from '@statebeats/sdk';

const music = analyzePcm({ samples: monoPcm, sampleRate: 48000 });
const { map, report } = generateChoreography(music, {
  seed: 17, bpm: 128, beatOffsetSeconds: 0.12,
  difficulty: 'flow', turnMode: 'full', turnDegrees: 30,
  playerHeight: 1.65, reach: 0.7, maxHandSpeed: 3,
  style: 'mixed', leadSeconds: 2.5, spawnDistance: 18,
  rails: true, pairs: true, crossovers: false, obstacles: 'none',
});
console.log(report.summary, report.omitted, inspectChoreography(map, report.settings));
```

Audio decoding belongs to the host. The analyzer and generator require no audio output, DOM, graphics or wall clock. Stored feature frames define where audio begins in simulation ticks. `beatOffsetSeconds` moves the musical beat grid relative to that audio start; positive values move the grid later. Device audio latency is a separate presentation setting. Neither control guesses a song's BPM. The 20 Hz feature analyzer is sufficient for broad energy/accent selection, not sample-accurate musical transcription.

## Controls

| Option | Behavior |
|---|---|
| `difficulty` | `gentle`, `flow`, `busy`, `master`: spacings of 2, 1, 0.5, 0.5 beats; master adds opposed high/low paired coordination |
| `rhythm` | `steady`, `accents`, `hybrid`; silence is excluded in every mode |
| `beatOffsetSeconds` | −10 to 30 seconds relative to the first stored audio frame |
| `turnMode` | `forward`, `bounded` (±60°), or `full` (unwrapped yaw); legacy `turning` maps to full/forward when turnMode is absent |
| `turnDegrees`, `maxTurnSpeed` | Desired phrase-to-phrase yaw step and its degrees-per-second cap |
| `turnStyle` | `rests` reserves two beats between phrases; `continuous` spreads turning through the phrase and keeps notes arriving |
| `movementRange` | `compact` or `wide`; wide gestures use up to 98% of the configured reach, including high/low and side extremes |
| `style` | Approaching, stationary or a mixture; held targets still trace their authored contact path |
| `leadSeconds`, `spawnDistance` | Preview/travel duration and emitter distance are independent |
| `playerHeight`, `reach` | Standing headset height and conservative reach radius in metres; the authoring check uses a center at 78% of height |
| `maxHandSpeed` | Maximum center-to-center transition or rail-segment speed in m/s |
| `rails`, `pairs`, `crossovers` | Enable phrase vocabulary elements independently |
| `obstacles` | `none` by default; `duck` adds occasional head-only hazards requiring physical review |
| `seed`, `theme`, `id`, `title` | Reproducible variation and presentation/identity controls |

In `rests` mode, an eight-beat phrase uses its first six beats for interactions and leaves recovery time for the next facing direction. In `continuous` mode, notes can fill all eight beats and contact positions follow an interpolated facing plan. There is no mandatory spawning timeout at a phrase boundary. Both modes retain explicit timing, hand-conflict and speed checks; musical silence or failed constraints can still omit events. Musical selection removes inaudible events and, depending on mode, weak accents. Energy regions are estimates, not named song sections. This release does not infer stems, vocals or tempo changes.

The generator enforces the existing 10,000-interaction limit. Scene tracks permit at most 4,096 keys and use logarithmic key lookup. Generated paths retain all hold/turn boundaries, including on long songs; dropping alternate boundaries would change actual emission positions. A distant source is not a distant required hand position.

## Replaceable stages

`GenerationAdapters` accepts trusted `MusicalSelector`, `PhraseComposer` and `FacingPlanner` implementations. Each has a versioned `id`, recorded in map provenance and the report. The interfaces are exported from the SDK. `dancePhrases`, `phraseRhythm` and `phraseFacing` are the reference implementations.

A composer receives a phrase, normalized settings, and a `place(x, y, z?, beat?)` helper. Pass each note/waypoint's absolute beat to follow continuous facing; omitted beat uses the phrase start. It returns at most 128 ordinary `NoteInput` values per phrase and must respect the selected interaction/recovery interval. A selector receives a candidate note, sampled music features, phrase and settings. A facing planner returns one unwrapped yaw per phrase; range and turn budget are validated. JSON cannot execute arbitrary code; only the host supplies implementations.

`inspectChoreography(map, profile)` checks non-hazard contact centers, held paths, overlapping same-hand reservations and transition/rail speeds. Unspecified hands are conservatively treated as needing both hands. The check works in authored coordinates, before actor transforms. It does not resolve room boundaries, shoulder anatomy, visibility, head clearance, collision with another hand, or every possible runtime policy. The generator removes the later candidate involved in an invalid hand transition and records its reason; read the report, since removing too many events can harm musical intent.

The map stores `generation.version`, `generation.algorithm` and `generation.settings`. This is provenance, not a promise that any future generator recreates identical output. Saved notes and paths are the playback authority. Export the separate report to retain phrase choices, statistics and omission reasons. Custom adapter code is required to regenerate its recipe, but never to play the baked standard map.

## Tools and perception

CLI JSON-lines and MCP expose `music.compose` with `{ music, options }`, returning `{ map, report }` and storing the map. It is an administrator operation and supports request-ID retry semantics. Existing `music.generate` returns the map alone. `choreography.inspect` accepts `{ map, options }` or `{ mapId, options }`, is read-only, and never advances simulation time.

```json
{"op":"choreography.inspect","args":{"mapId":"choreography-journey","options":{"reach":0.7}}}
```

Held entities expose a bounded `contactPath` through their actual end tick, including valid late contact. These world-space points use authoritative motion; restoring regenerates the preview. Non-emitted generated rails include their hit-time start point. Emission compilation accepts post-hit motion within the entity lifetime; explicit motion keys at the implicit hit time or after expiry are invalid.

## Simple tuning and personal dimensions

The browser offers Beginner, Normal, Hard and Master quick setups. They change coordination,
turning and movement range without changing a song's BPM or beat offset. Master opts into
continuous full turns, wide gestures, crossovers and a higher hand-speed limit. These are
StateBeats presets, not calibrated equivalents of another game's named difficulty.

Under Settings, **Your height** and **Room scale** apply to all maps at the next start/restart.
For a 1.65 m player wanting wider reaches, try height 1.65 and room scale 1.20. Here room scale
multiplies horizontal X/Z positions; height rescales vertical positions from the floor.
Collision sizes remain authored. This definition is explicit and does not claim to reproduce
Synth Riders' scaling formula. The generator's wide movement option independently expands
high/low gestures. Existing maps retain their authored timing and choreography.

`fitMapToPlayer(map, { height: 1.65, roomScale: 1.2 })` performs the same adaptation in the SDK,
baking positions into standard data and recording `playerProfile`. Applying the same profile
twice is idempotent. Saved replays therefore contain the adapted geometry and dimensions;
future leaderboards must distinguish differing profiles and assistance settings.
Hosts with custom rules can pass interaction policies and rule extensions as the third and
fourth arguments, just as they do when compiling their maps.

Opening a saved standard recipe restores all supported generation controls and preserves
unexposed settings. Recipes needing custom adapters or variable tempo remain playable, but
the reference player disables rebuilding them with a different generator.

Run `node examples/choreography.mjs` after building for a complete generation, inspection, pose-play and replay example. The browser's **Phrases in orbit** map demonstrates original choreography with procedural audio. Imported tracks can be rebuilt from their stored analysis using the controls under **Shape your movement**.
