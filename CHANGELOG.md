# Changelog

## 0.3.0 — musical choreography (development release candidate)

Adds opt-in spatial sound themes and per-note effects, a pure SDK audio-frame projection
and CLI/MCP `perception.audio`, independent saved mix controls, and a bounded Web Audio
backend with head-relative moving sources. Ink-Battle and Event Horizon ship procedural
sound themes. Waiting targets remain quiet; effects yield to guidance and stop with the
transport. Audio metadata is protected by presentation identity without changing gameplay.
See [spatial sound themes](docs/SPATIAL_AUDIO.md).

Adds optional map-authored readiness cues: hidden, waiting, preparing and eligible, timed
from the first valid contact tick. Event Horizon's stationary holds now use a short hollow
preview and brighten into solid targets during the last beat before contact. The reference
player stages artwork, semantic cues and guides together; text and audio adapters share the
reveal timing. Artists can own readiness expression independently of appearance/release
effects. Maps that omit readiness retain their behavior and presentation identity; valid
recordings, collision timing and scoring remain compatible.

Readiness review fixes preserve short preparation announcements, keep desktop aim assistance
from locating hidden targets, and stop manual next-cue stepping at preview, preparation and
first eligible contact. The exported map JSON Schema now describes authoring inputs, so
omitted runtime defaults validate consistently in editors.

Adds versioned note presentation cues shared by graphical, text, audio and agent adapters:
tick-derived appearance, arrival, contact and release phases; beat/millisecond reveal windows;
and bounded trailing paths along authoritative movement. Target appearance adapters can own
their guides and transitions. Event Horizon uses travelling tapered arcs and distinct stationary
emergence instead of revealing complete future hold loops, with denser authored curves used by
both scoring and rendering. Release effects reconstruct on checkpoint restore and never remain
active collision targets. See [note presentation](docs/NOTE_PRESENTATION.md).

Presentation review fixes preserve the final interaction state in release effects through
an additive core transition result, with unchanged scoring and recording identity. The
reference player fades semantic cues and particles, composes adapter opacity animation
with lifecycle visibility, and disposes custom guides even when the map suppresses them.
Finished sessions finalize every remaining release effect. Dense trajectories use exact
binary position lookup, and legacy observations allocate no unused fallback guide buffers.
Checkpoint/replay verification now requires the presentation hash for every map, closing
the bypass where both optional cue settings and their binding were removed. Existing
version-1 exports containing their hash remain compatible.

Adds reusable musical turn planning with versioned tracks, explicit sweeps/continuations/answers,
quintic easing, peak speed/acceleration and directional-travel limits, explanation reports and
SDK/CLI/MCP operations. Event Horizon replaces section-wide rotation with score-authored turn
phrases, retaining all 620 scoring targets. Generated music maps derive turn cues from per-hand
movement. Normal/Hard/Master presets expose the new style; legacy baked maps remain playable.
New recipes identify choreography-v2.

Adds Event Horizon — Master: a bundled original 150 BPM/2:40 electronic score, 620 scoring
targets, 52 moving holds, 84 linked chords, seven duck/lean passages and a replaceable orbital
stage. Its soundtrack loads automatically through a trusted, hashed asset registry and keeps
the tick-based pause/resume transport. Adds a steadier desktop spectator viewpoint,
map selection links, reproducible synthesis source and headless/production tests.

Follow-up authoring fixes inspect the full hold lifetime, enforce explicit duration during
phrase recovery, allow supported long-song full turns, associate reports with their chart,
and distinguish recognized player-height recipes from arbitrary provenance.

Review follow-up fixes long-song emitter holds, stationary rail starts, late-path previews,
post-expiry motion validation, saved recipe restoration and shape-aware desktop aiming.
Adds Beginner/Normal/Hard/Master quick setups, continuous turns with incoming notes, wider
high/low gestures, and shared SDK/CLI/MCP personal height/room-scale adaptation. Adds a tested
GitHub Pages workflow that publishes verified merges to main.

Added original musical phrase generation with replaceable selector/composer/facing adapters,
song beat offsets, independent movement controls, recorded recipes and explanation reports.
Added conservative authored hand reach/speed/reservation checks and SDK/CLI/MCP composition
and inspection operations. Existing saved maps keep their authored behavior; newly generated
music maps use the versioned choreography algorithm.

Approaching holds can continue into moving contact paths. Observations and the reference player
show the same remaining rail path used by simulation. Added the original Phrases in orbit map,
browser rebuilding from cached music features, report export, drag/depth-assisted desktop input,
and imported-song support for the existing device audio offset control. Legacy recording version
0.1.0 is retained. Real Quest comfort/performance and comparative play quality remain unverified.

## 0.2.0 — StateBeats scenes, music and access

Renamed packages to `@statebeats/*`, CLI to `statebeats`, and MCP configuration to
`STATEBEATS_*`. Retained pure kernel recording version 0.1.0 for compatible older recordings.
Added versioned scene objects, motion/emitter paths, appearance and text descriptors,
bounded stateless trails, shared music features, offline PCM analysis and reproducible
music-grid chart generation. New recordings protect presentation metadata separately.

Added the original Chasing the sun and A sky full of stars maps, including moving sources,
paired approaches, firefly holds and actual bird avoidance. The reference player supports
local song/map import and map export, scene/appearance adapters, captions, semantic glyphs,
independent music/cue channels, contrast, reduced motion and desktop ducking. A separate
WebGL-free text player offers keyboard/manual play and the same pose/replay contracts.

See docs/SCENES_MUSIC_ACCESS.md for the new SDK/tool operations and extension example.
Physical Quest 3 and human audio-only usability checks remain deferred; no external
publication or accessibility certification is claimed.

## 0.1.0 — release candidate, 2026-09-07

First implementation: pure deterministic spatial rhythm core, rational tempo compiler and native
builder, six interaction presets plus holds, actor/group requirements, translating collision shapes,
capability-bound SDK, clocks, compiled replay/checkpoints, CLI/MCP, storage adapters and extension
examples. Includes four original maps, a worker-based desktop/WebXR player and procedural audio.

Standalone Quest 3 device verification remains pending. Public packages and repository release
are prepared locally; no external publication has occurred.
