# Scenes, music and perception

These are SDK capabilities. The browser, text player, CLI and MCP share the same compiled
gameplay and observations. No renderer, audio device, FFT callback or screen reader awards hits.
Packages use `@statebeats/*` at version 0.2.0. The pure kernel recording version remains
0.1.0 because existing gameplay transition semantics are unchanged.

## Scene authoring

Map version 1 now accepts optional `scene`, `music`, note `appearance`, `label` and `emission`
fields. Scene and music have their own version 1 contracts. Older SDK releases reject these
new fields rather than silently removing their meaning. An emission compiles into an ordinary
kernel entity; the core has no sun, bird, black hole, theme or music dependency.

```js
const map = {
  version: 1, id: 'my-sky', title: 'My sky', durationBeats: 16,
  tempo: [{ beat: 0, bpm: 120 }],
  scene: {
    version: 1, theme: 'statebeats/space', label: 'Stars around a moving black hole',
    objects: [{
      id: 'emitter', appearance: 'statebeats/black-hole', label: 'Black hole',
      position: [0, 8, -24], anchor: 'player', trailSeconds: 4,
      motion: [
        { beat: 0, position: [0, 8, -24] },
        { beat: 16, position: [24, 8, 0] },
      ],
      react: [{ channel: 'bass', property: 'brightness', amount: 1 }],
    }],
  },
  notes: [{
    id: 'star', beat: 8, preset: 'left', position: [-0.3, 1.4, -0.8],
    label: 'Left star', appearance: 'statebeats/star',
    emission: { source: 'emitter', beat: 2 },
  }],
};
```

`compile(map)` returns the ordinary `program` plus a compiled `scene`. The source's
position is sampled at the explicit release beat using the same linear path sampler as the
kernel. That position becomes the star's first motion key and spawn tick. Its hit position is
the note's `position`. Optional note motion keys are intermediate points strictly between
release and hit; a maximum of 254 leaves space for those two compiled endpoints.
Emission replaces `leadMs`; it must precede the early interaction window. Normal notes keep
their existing lead-time and arbitrary motion behavior.

An emitted note inherits its source's actor-stage anchor. An explicitly conflicting anchor
is rejected. The kernel captures that stage at spawn: a later recalibration or emitter move
does not drag an already released star. Scene objects follow current stage calibration.
Missing stage anchors use the identity transform, matching the kernel. Trails move with
the scene object's current stage and represent its recent authored path, not historic stage
calibrations.

Trails are reconstructed from explicit ticks, with at most 64 samples per object and a
30-second maximum. Backward seeking needs no particle history. Scene objects are bounded
at 128 and motion tracks at 256 keys. They are distinct from the 2,000-active-entity gameplay
limit. A renderer should use instancing/particles for large decorative fields.

`appearance` is a namespaced visual identifier, not an interaction policy. `label` describes
the object through text/speech. Unknown appearances retain a generic visible representation
in the reference player. Unknown themes retain scene objects and gameplay with no specialized
environment. Trusted hosts register environment implementations with the reference player's
`registerTheme(id, factory)` API; map JSON never executes code. Environment adapters get
copied observations and a group they own, and must dispose their GPU resources.
`registerAppearance(id, factory)` adds target meshes and cosmetic animation. The reference
player keeps its collision-volume outline, semantic glyph and timing ring alongside the
appearance. `examples/community-appearance.ts` demonstrates a rising ground mole without
editing the core, SDK or reference scene class; import it from the player's entry to enable it.

`Observation.scene` contains only the current scene frame, with world positions, bounded
trails and reaction values. `Observation.music` contains the current interpolated features.
Active entities expose optional `label`, `appearance` and `targetPosition`. The last field is
the compiled position at the hit tick, transformed through the captured spawn calibration;
spatial guidance should announce this reachable destination rather than the faraway release.
Native observations also expose same-player/different-player constraints, timing windows,
link intervals and minimum movement speed so a perception adapter can explain compound rules.

## Music

`analyzePcm({samples, sampleRate, tickRate, startTick})` accepts normalized mono Float32 PCM.
It uses a bounded offline 2,048-point FFT and produces a 20 Hz tick-stamped feature timeline:
energy, sub-bass, bass, low-mid, mid, presence, air, RMS, flux, transient and beat envelope.
Values are finite in [0,1]. Silence stays silent. The analysis is an authoring tool, with an
algorithm ID; it is not a musical beat-tracking guarantee. Save the output for playback.

The SDK accepts 8–96 kHz PCM up to 30 minutes; JSON timelines have at most 36,001 frames.
The reference browser importer uses a smaller 40 MB / ten-minute file budget. Audio decoding
belongs to the host adapter and depends on browser codec support. A file's SHA-256 identity,
display name and duration are stored; the audio bytes remain local and are not embedded in a
map or replay. These fields do not instruct the engine to fetch or open any path.

`generateMusicMap(timeline, {bpm, difficulty, turning, seed})` builds a reproducible chart on
an explicitly supplied beat grid, suppresses silent intervals, alternates hands and bounds
destination radius/elevation. The default is gentle. Tempo estimation and editor-grade
musical transcription are not claimed. Changing the seed changes placement; exporting
the result fixes the authoritative geometry and timing. The imported song can be replaced
only with matching bytes if its saved source identity is to be preserved.

The bundled sun/space maps use original, authored beat envelopes for their procedural score;
imported songs use measured PCM features. Both feed the same music-feature interface.
Visual brightness and scale bindings have no effect on collision volumes.

The player aligns imported audio's start with the first feature tick, pauses the source with
the simulation, and recreates it at the current song offset on resume. Speed changes rebase
the source and cues. Manual replay needs neither the audio bytes nor the analyzer. Replays
and checkpoints protect presentation metadata with a separate `presentationHash`; changing
a theme need not change gameplay identity, but changing an exported replay's presentation
without updating/re-exporting it is detected. Legacy recordings without scene/music data
can still be checked without a presentation hash.

## Perception and access

`describeObservation(view, {position, orientation, maxTargets})` produces stable IDs, action,
effector requirement, destination, clock-face bearing, elevation, distance, due tick, countdown
and hold duration. It reads the supplied observation without advancing time. `textPerception`
is a change-driven SDK sink for human-readable output. `perception.describe` exposes the
same description through CLI/MCP. `music.generate` uses the same headless music generator;
`map.edit` accepts `scene` or `music` (null removes that field), and the native builder provides
`setScene` / `setMusic`.

- Visual play includes L/R/2/H/! glyphs, timing rings, captions, outcomes and optional increased
  target contrast. Music and interaction sounds can be switched separately. VR has text cues
  in its scene HUD and controller feedback. Color is redundant with other cues.
- Audio practice hides targets and uses spatial destination sounds, hand-specific timbres,
  front/back patterns, pitch for height, timing stages and outcome sounds. This is an audio
  perception implementation; it still needs headset/listener usability testing.
- `/text.html` is a separate entry with no Three.js/WebGL dependency. Keyboard and screen-reader
  controls expose manual time, target choices, both-hand actions, holds, ducking, arbitrary
  effector coordinates, outcomes and replay export. Reading never advances time. Reaching at
  a beat submits ordinary pose commands and evaluates every intermediate tick. It is explicitly
  assisted manual practice; it is not represented as an unassisted timed performance.
- Reduced motion stops cosmetic drift/wing flapping and hides trails while gameplay paths
  remain readable. OS reduced-motion preferences initialize the control. Lower playback speed
  and text/manual play offer additional choices for motion or timing preferences.

Sound, music, cues, captions, contrast, reduced motion, hand swap, audio-only practice, speed
and audio offset persist in optional local browser storage. Unavailable storage does not
prevent play. Muted play does not initialize an audio context. Imported audio is not persisted.

Manual ducking is a spatial action, not automatic success against every hazard. Use the direct
pose controls for arbitrary custom shapes. Sustained moving holds and directional-strike maps
may require custom actor controls. The built-in text conveniences do not replace the SDK's
general pose interface. Neither browser automation nor audio sample tests establish blind/deaf
usability or accessibility certification. Real Quest hardware and user feedback remain pending.

## Verification

`tests/scene-music.test.ts` checks release coordinates, simultaneous approaches, stage rotation,
independent flight, trails, invalid references/timing, frequency discrimination, silence,
stored feature sampling, chart generation and replay protection. Browser experience tests
exercise keyboard-only text completion, real local audio decode + map generation + worker
playback, and the full sun journey. Offline AudioContext tests check actual rendered samples
for lead-in, resume offset and pause behavior. See ACCEPTANCE.md for verified release scope.
`node examples/scenes.mjs` runs the sun map headlessly and saves a music-generated map and
verified replay in `artifacts/`.
