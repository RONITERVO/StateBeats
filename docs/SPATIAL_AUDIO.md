# Spatial sound themes

StateBeats separates three audio layers: music, gameplay guidance, and world effects.
The Settings panel has independent toggles and saved volume controls for each. Guidance
announces contact destinations, required hands, height and timing. World effects follow
the actual moving target; they do not tell the player that an early contact will count.
Effects soften while guidance is playing. Head position and facing drive HRTF spatialization.

Ink-Battle — Between the Lines uses procedural projectile whistles, approaching troop
pulses, falling meteor noise, heavy fire and energy tones. Event Horizon — Master uses
filtered streams, materializing tones and sustained orbital charges. These are original
synthesized interpretations, not recorded Ink-Battle sound assets. Neither map needs an import.

## Authoring

Audio is optional map presentation data, independent of visual appearance and scoring:

```js
map.audio = { version: 1, theme: 'ink-battle/battlefield-v1' };
map.notes[0].sound = { effect: 'ink-battle/meteor', gain: 0.8 };
// Explicitly silence this note's decorative effect; guidance still works.
map.notes[1].sound = { effect: 'statebeats/silent' };
```

`sound.gain` defaults to 1 and is limited to 0–1. It cannot override the player's mixer.
An omitted note sound lets the selected theme choose by role: approach, materialize,
active hold, or hazard. An explicit effect stays selected throughout that note's lifetime.
The visual theme can be replaced without replacing the sound theme, and vice versa.

| Theme | Effects |
| --- | --- |
| `statebeats/neutral-v1` | `statebeats/air`, `statebeats/shimmer`, `statebeats/charge`, `statebeats/rumble` |
| `statebeats/orbital-v1` | `orbital/stream`, `orbital/appear`, `orbital/arc`; neutral rumble for hazards |
| `ink-battle/battlefield-v1` | `ink-battle/whistle`, `ink-battle/steps`, `ink-battle/meteor`, `ink-battle/heavy`, `ink-battle/energy` |

Old maps without audio metadata keep their guidance sounds and have no new world effects.
A per-note effect can opt in without a map theme. Unknown themes fall back to the neutral
theme; unknown effect IDs fall back to the selected theme's role. No ID triggers a network
request or executes map-provided code. `statebeats/silent` always suppresses world effects.

`new MapBuilder(map).setAudio({...})` authors the map setting; `setAudio(undefined)` removes
it. The shared CLI/MCP `map.edit` operation accepts `audio` (`null` removes it) and note
edits accept `sound`. Exported JSON Schema includes both. Existing strict SDK versions need
updating before loading maps that use these fields.

## Portable contract

```js
import { sampleSpatialAudio } from '@statebeats/sdk';
const frame = sampleSpatialAudio(session.observe(capability), { maxSources: 8 });
// frame.sources: id, role, optional effect, position, intensity, progress, elapsedSeconds
```

This pure function uses simulation ticks. Repeating it or reading `perception.audio` through
CLI/MCP never advances a session. It returns current world coordinates after calibration,
stage transforms and recentering. An active hold uses its moving head, not its old start
point. It does not mutate the observation or use wall time, Web Audio, random devices or Three.js.
`frame.theme` carries the authored theme ID and `omitted` reports capacity filtering.

Hidden, waiting and resolved readiness phases are silent. Preparing targets rise with
their readiness; effects also respect appearance visibility. Approaches enter a two-second
effect window, while active holds and hazards continue along their paths. Late strike effects fade
within 150 ms. Resolved visual ghosts never become sound sources. A stable priority order
protects active holds and imminent hazards, then prioritizes targets nearest their hit time.
The default limit is 8 (callers may request 1–32). Guidance is a separate stream and isn't
evicted by the world-effect budget. Decorative sounds are not an authoritative readiness signal.

Sound metadata is bound to presentation hashes in checkpoints/replays. Changing it does
not change the compiled collision/scoring identity; replay presentation tampering is rejected.
Maps that omit these optional fields retain their prior presentation identity.

## Reference browser adapter

`packages/player/src/sound-themes.ts` exports `registerSoundTheme` for trusted host code.
See the complete [community sound theme example](../examples/community-sound-theme.ts).
Register an ID, four role defaults and named `SoundPatch` definitions, then select the ID
from a map. Patches specify a sine/triangle/noise source, pitch range, filter, bounded gain
and optional tick-driven pulses. Registration validates the patches and copies/freezes
them. For noise patches the pitch range sweeps the filter center; for tonal patches it
sweeps the oscillator while `filterHz` controls brightness. Registration's returned function removes
that theme's own definitions. Register the theme
once when the host starts, not from map JSON. The same `SpatialAudioFrame` can drive a
different backend with samples, ambisonics, a native spatializer or device-specific output.

`SpatialSounds` maintains at most eight active HRTF voices plus eight short release tails.
Positions and levels are smoothed; deterministic noise offsets avoid correlated crowds.
Dense frames share a normalized gain budget. Effects are reduced to 32% while audible
guidance plays. Master mute, effect mute, zero effect volume, pause, reset, map changes
and disposal release voices. Resuming reconstructs the current state rather than replaying
old launches. Playback speed changes the rate of tick-driven effects. Audio output offset
applies to scheduled music/guidance; continuous effects follow the currently displayed position.

The player's guidance slider now controls guidance independently of bundled soundtrack
mix metadata. `RhythmAudio.setSong(..., { cueVolume })` remains available to custom hosts
as an optional legacy trim; the reference player does not apply the old quiet soundtrack trims.

The current backend covers moving gameplay targets. Background army chatter, environmental
ambience, custom recorded sound uploads, acoustic occlusion and physical Doppler are not
implemented. The public frame/adapter boundary leaves room for those without changing the core.

## Verification and limits

SDK tests cover readiness, trajectories, calibration, capacity, deterministic reads,
authoring, fallback behavior, unchanged gameplay identity and replay protection. Real offline
Web Audio tests verify left/right positions, head rotation, independent guidance/effects,
silence, pause/resume and voice limits. Chromium also verifies continuous movement in one
offline render; Firefox uses independent trajectory snapshots because its offline context
has no suspend/resume API. Browser settings tests cover persistence and muted play.
HRTF playback and the mix still need listening feedback on physical Quest hardware; these
tests do not establish audio-only Master playability or accessibility certification.
