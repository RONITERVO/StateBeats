# Event Horizon — Master

An original, complete 2:40 playable composition: 150 BPM, 96 bars, eight musical sections,
620 scoring targets, 52 held paths, 84 linked stereo chords and seven head-avoidance passages.
Select **Event Horizon — Master** in the library and press Play or Watch a bot. Its 3.8 MB
soundtrack loads automatically; no import, account, external service or runtime synthesis is
needed. The direct player link is `?map=event-horizon-master`.

This is intentionally an expert map. The tutorial remains the default. Height and room scale
still apply; the owner's 1.65 m / 1.20 profile is covered by deterministic playback tests.
Speed can be lowered in Settings without changing the authored sequence. Physical Quest 3
playtesting is pending; automated completion does not establish comparative play quality.

## Musical structure and movement

| Section | Bars | Choreography |
|---|---|---|
| Ignition | 1–8 | Bell melody, alternating hands, establishing the moving sources |
| Accretion | 9–24 | Repeated melodic phrases, syncopation and returning crossovers |
| Event horizon | 25–40 | Wide linked chords, one-hand rail plus other-hand counterpoint, double helices |
| Weightless | 41–48 | Stationary constellation ribbons, low catches and a gradual turn reversal |
| Escape velocity | 49–56 | Rising alternating snare staircases; sixteenth notes build anticipation |
| Binary stars | 57–72 | Continuous fast turns, asymmetric rails, high/low pairs and body movement |
| Supernova | 73–88 | Counter-rotation, octave answers, overhead/low opposition and chord pickups |
| Afterglow | 89–96 | Returning melody, slowing rotation and a final two-hand unison |

Turns ease between angular velocities and continue during scoring passages. Maximum authored
turn speed is 56.25 degrees/second. At the original 1.65 m / 1.0 profile, targets range from
0.49 m to 2.05 m high. Hand-center inspection uses a 1 m envelope and a 6 m/s transition
budget; measured peak is about 5.105 m/s, including full hold lifetimes. These are authoring
dimensions, not measured biomechanics. Room scale 1.20 widens horizontal distances by 20%.

Two traveling sources are roughly 40–50 metres away with five-second trails. Notes take
2.4 seconds to approach, so many are visible concurrently. The quieter section mixes fixed
targets and moving holds. Four ducking ribbons and three leaning gates overlap ordinary hand
requirements. A tracked standing head incurs penalties; an authored head-pose trace clears
them while the same hand-pose simulation completes all targets.

## Original soundtrack

`scripts/compose-event-horizon.py` composes and renders the score from oscillators and seeded
noise. It uses a recurring minor-key hook, extended chord voicings, detuned stereo leads,
FM bells, plucks, pads, a mono bass foundation, synthesized kick/snare/hat parts, arranged
fills and transitions, kick-driven ducking, musical delay and algorithmic reverb. The mix
is loudness processed with additional headroom for MP3 encoding. No samples, commercial
songs, model APIs or sound packs are used.

The checked-in audio is `packages/content/audio/event-horizon.mp3`. The generated score and
20 Hz features in `packages/content/src/event-horizon-score.ts` come from the distributed
audio itself. They also include exact melody and percussion timing. The map builder uses
that timing and authored movement phrases, rather than estimating a beat grid from arbitrary
audio. Its provenance has a separate authored-score version, so the generic music generator
does not offer a misleading rebuild button.

Normal builds need only Node 24 and `npm ci`. To recompose, optionally install Python 3.14,
numpy 2.4.6, scipy 1.18.1 and FFmpeg, then run:

```sh
python scripts/compose-event-horizon.py
npx prettier --write packages/content/src/event-horizon-score.ts
npm run build:lib
npm run content:export
npm run check
```

Run `node examples/event-horizon.mjs` after building to complete the full map through the
headless SDK and save a verified replay. Installed packages expose the soundtrack at
`@statebeats/content/audio/event-horizon.mp3`, so another player can bundle the same asset.

DSP uses a fixed seed. Encoder/library versions can affect compressed bytes; the script
regenerates the content hash and analysed features together. Review the new audio and map
as a pair. Composition, map data and audio are CC0; synthesis code is MIT.

## Building on it

- `packages/content/src/event-horizon.ts`: ordinary map authoring, facing, scene motion,
  hand requirements, hold paths, linked groups and avoidance volumes.
- `packages/player/src/soundtracks.ts`: trusted host registry and lazy, integrity-checked
  loading. Imported JSON cannot request arbitrary URLs. Decoded audio is reused on restart;
  failed downloads can be retried.
- `packages/player/src/event-horizon-theme.ts`: replaceable observation-only aurora,
  stars, orbital structures and music-reactive columns. It owns no scoring.
- `packages/player/src/appearances.ts`: replaceable prism appearance. Collision sizes
  remain the authored geometry.
- `tests/event-horizon.test.ts`: asset identity, authoring checks, tracked-head playback at
  room scale 1.20, checkpoint/replay continuation and standing-head penalties.
- `tests/pages/player.spec.ts`: real MP3 decode, non-silent PCM, automatic start, pause/resume
  offset, single-download caching and full scripted completion under a project URL.

The desktop bot uses a wider spectator viewpoint; headset play uses the tracked head. The
generic bot does not demonstrate tracked-head avoidance. The separate headless test does,
using ordinary poses without disabling collisions or awarding hits. Reduced-motion and
high-contrast preferences simplify decoration; they do not rewrite the authored turns.

This demonstrates expressive scope; it does not establish superiority to a commercial game.
The next evaluation is musical readability, tracking, latency and whether experienced
players want to replay it on Quest 3.
