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
| `difficulty` | `gentle`, `flow`, `busy`: nominal intra-phrase spacings of 2, 1, 0.5 beats; other controls remain independent |
| `rhythm` | `steady`, `accents`, `hybrid`; silence is excluded in every mode |
| `beatOffsetSeconds` | −10 to 30 seconds relative to the first stored audio frame |
| `turnMode` | `forward`, `bounded` (±60°), or `full` (unwrapped yaw); legacy `turning` maps to full/forward when turnMode is absent |
| `turnDegrees`, `maxTurnSpeed` | Desired phrase-to-phrase yaw step and its degrees-per-second cap |
| `style` | Approaching, stationary or a mixture; held targets still trace their authored contact path |
| `leadSeconds`, `spawnDistance` | Preview/travel duration and emitter distance are independent |
| `playerHeight`, `reach` | Standing headset height and conservative reach radius in metres; the authoring check uses a center at 78% of height |
| `maxHandSpeed` | Maximum center-to-center transition or rail-segment speed in m/s |
| `rails`, `pairs`, `crossovers` | Enable phrase vocabulary elements independently |
| `obstacles` | `none` by default; `duck` adds occasional head-only hazards requiring physical review |
| `seed`, `theme`, `id`, `title` | Reproducible variation and presentation/identity controls |

An eight-beat phrase uses up to its first six beats for interactions and leaves recovery time for the next facing direction. Built-in rails finish before that recovery interval. Musical selection removes inaudible events and, depending on mode, weak accents. The same small vocabulary returns with mirrored and vertical variations. Energy regions are descriptive estimates, not named musical sections. This release does not detect instrument stems, infer vocals, or automatically find tempo changes.

The generator enforces the existing 10,000-interaction and bounded map limits. Long-song visual emitter paths are bounded to at most 251 keys; contact geometry still comes from the saved compiled paths. A distant source is not a distant required hand position.

## Replaceable stages

`GenerationAdapters` accepts trusted `MusicalSelector`, `PhraseComposer` and `FacingPlanner` implementations. Each has a versioned `id`, recorded in map provenance and the report. The interfaces are exported from the SDK. `dancePhrases`, `phraseRhythm` and `phraseFacing` are the reference implementations.

A composer receives a phrase, normalized settings, and a `place(x, y, z?)` helper that converts local contact coordinates to that phrase's facing. It returns at most 128 ordinary `NoteInput` values per phrase. It must respect the phrase's interaction/recovery interval. A selector receives a candidate note, sampled music features, phrase and settings. A facing planner returns one unwrapped yaw per phrase; the requested range and turn budget are validated. JSON settings cannot name and execute arbitrary code; only the host supplies implementations.

`inspectChoreography(map, profile)` checks non-hazard contact centers, held paths, overlapping same-hand reservations and transition/rail speeds. Unspecified hands are conservatively treated as needing both hands. The check works in authored coordinates, before actor transforms. It does not resolve room boundaries, shoulder anatomy, visibility, head clearance, collision with another hand, or every possible runtime policy. The generator removes the later candidate involved in an invalid hand transition and records its reason; read the report, since removing too many events can harm musical intent.

The map stores `generation.version`, `generation.algorithm` and `generation.settings`. This is provenance, not a promise that any future generator recreates identical output. Saved notes and paths are the playback authority. Export the separate report to retain phrase choices, statistics and omission reasons. Custom adapter code is required to regenerate its recipe, but never to play the baked standard map.

## Tools and perception

CLI JSON-lines and MCP expose `music.compose` with `{ music, options }`, returning `{ map, report }` and storing the map. It is an administrator operation and supports request-ID retry semantics. Existing `music.generate` returns the map alone. `choreography.inspect` accepts `{ map, options }` or `{ mapId, options }`, is read-only, and never advances simulation time.

```json
{"op":"choreography.inspect","args":{"mapId":"choreography-journey","options":{"reach":0.7}}}
```

Held entities expose a bounded `contactPath` in observations. These are world-space points from the same authoritative motion used for contact; seeking/restoring regenerates the same preview. The reference renderer connects those points without changing collision or scoring. Emission compilation now permits motion keys after the implicit contact key, so an approaching target can continue as a rail. Explicit motion keys at the implicit hit time remain invalid.

Run `node examples/choreography.mjs` after building for a complete generation, inspection, pose-play and replay example. The browser's **Phrases in orbit** map demonstrates original choreography with procedural audio. Imported tracks can be rebuilt from their stored analysis using the controls under **Shape your movement**.
