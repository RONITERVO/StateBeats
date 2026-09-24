# Ink-Battle × StateBeats — Between the Lines

Stand between the teal and red armies, on the paper of Ink-Battle's enlarged
sketchbook. The included original **120 BPM, 3:20** score moves through Stone,
Castle, Renaissance, Modern, Future and Cosmic ages. The music progresses from
wood percussion and harp/flute to martial brass, electronic pulse and a shared
finale. No account, imported song, runtime AI or remote asset service is needed.

Open `?map=ink-battle-between-the-lines`, then Play or Watch a bot. Settings for
height, room scale and speed apply. The map is an advanced, turning experience;
start below normal speed if needed. Desktop uses the existing assisted hand aims;
Quest uses actual controllers. Physical Quest 3 testing is still pending.

## What to hit

- **42 melee diversions:** touch the marked head, or the Cosmic drone's front eye,
  with either hand. The scoring centre follows the depicted head exactly.
- **256 crossfire shots:** intercept the marked projectile with either hand.
- **44 falling specials:** block the marked rain coming down from above. The
  artwork changes from meteors and arrows to orbital energy as ages progress.
- **16 heavy shots:** the `2` marker means both hands must meet the same shot.

Faction paint is decorative: red and teal do not assign hands. Only outlined,
marked targets score; the unmarked war is scenery. No dodge obstacles are used
in this map. This avoids mixing “block this heavy projectile” and “avoid it” with
nearly identical artwork. The backend's normal obstacle support is unchanged.
Nothing waits brightly in reach for several beats: scored attacks approach, then
briefly retain their contact location through the late window. No hold rails.

## How much is the actual game?

The book, paper paint, pencil strokes, bases, troops, weapons and specials reuse
Ink-Battle's original procedural 3D art. The background armies come from its
**actual deterministic tabletop combat engine**, using legal SDK commands. The
engine files are unmodified, pinned to the commit in
`packages/ink-battle/PROVENANCE.json`, and hash-checked in tests.

This is a **six-chapter recorded battle montage**, not one match that naturally
earns six evolutions. Each age starts its own seeded match, warms up for 14 seconds,
and supplies a 32-second excerpt. Every full 46-second upstream replay is shipped
and verified. Background snapshots are taken at 4 Hz and positions interpolate
by stable ID. Units do not interpolate across births or deaths. These snapshots
are a presentation optimization, not the upstream authoritative state.

The neutral third person does not exist in upstream rules. StateBeats therefore
adds an explicit **rhythm director**. It samples real troops and shot origins,
retimes attacks onto the original melody, and redirects them toward reachable
contacts. Melee diversions use troops already on the visible side when available;
otherwise the director authors an incoming troop, with a null source ID. Shots
originally too close move outward before their approach. `sourceOrigin` retains
the recorded evidence separately from the adapted `origin`. Behind-the-player
shots travel around the clearance area into a visible approach corridor early;
they do not pass through the player on their way to a later scoring contact.
Falling specials are authored parry patterns based on each age's special, not
literal copies of the upstream special's area-damage hit tests. A small clearance
zone suppresses unmarked scenery around the player, and diverted troops are
temporarily hidden in the background recording to reduce visual duplication.

Your parries affect StateBeats scoring and visual deflections. They **do not change
the upstream war's outcome**. Two-handed heavy blocks likewise belong to this
adaptation; they are not an Ink-Battle rule. These boundaries keep the release
honest and make authored difficulty repeatable.

## Developer integration

`@statebeats/ink-battle` is a separate Apache-2.0 workspace package:

```js
import { inkBattleMap, inkEncounters, sampleInkBattle, inkChapters } from '@statebeats/ink-battle';
import { Session, standardActor, fitMapToPlayer } from '@statebeats/sdk';

const map = fitMapToPlayer(inkBattleMap(), { height: 1.65, roomScale: 1.2 });
const rhythm = await Session.create(map, [standardActor()]);
rhythm.advance(120); // one second; no wall clock is read
const war = sampleInkBattle((rhythm.tick / rhythm.map.tickRate) * 2);
// war.units / war.shots / war.sides are renderer-independent data.
// inkEncounters() exposes source IDs/ticks, exact paths and musical contact beats.
```

The primary export is headless: no Three.js or DOM dependency. The `./visuals`
entry is separate. All gameplay targets compile through the same StateBeats map
schema, poses, policies, collision, score, checkpoint and replay paths as other
maps. The CLI/MCP catalog and text player receive the same map. The extended
background trace is available through `sampleInkBattle`; it is not represented as
hundreds of fake scoring entities in an Observation.

The trace revision/hash and upstream replay digests are in the map's generation
metadata and therefore its presentation identity. Four semantic scene landmarks
define the book's basis. The SDK fits/recenters them alongside scored notes; the
theme uses that basis rather than guessing current player height or room scale.
`ThemeAdapter.handlesObjects` lets a registered theme render such scene objects
itself. An appearance may set `referenceBody: false` and `cueColor` while retaining
the reference timing/requirement cues. Maps only choose trusted registry IDs;
they cannot import code or request arbitrary network assets.

Regenerate/verify recordings from the pinned SDK with:

```sh
npm run content:ink-battle
node scripts/record-ink-battle.mjs --check
npm run build:lib
npm run content:export
node examples/ink-battle.mjs
```

Optional soundtrack authoring uses `python scripts/compose-ink-battle.py` with
NumPy, SciPy and FFmpeg, as documented in the script. Normal installs use its
checked-in MP3 and analyzed features. Changing the audio requires rebuilding
the libraries and exporting the map so the saved hash remains correct.

## Route toward a live collaboration

The vendored upstream `Session` is also usable directly. A host can advance it in
its native 60 Hz clock and issue legal `unit`, `guide`, `turret`, `special`, etc.
commands. See `examples/ink-battle.mjs`. A future live director should consume
these observations, reserve a readable anticipation interval, then submit bounded
StateBeats director spawns. It must record both command streams and source event
IDs so manual play, rewind and replay remain deterministic.

If parries are to change the war, implement a versioned neutral-player combat
contract in Ink-Battle first, or add an explicitly separate adapter rule set.
Do not silently edit the upstream snapshot, reinterpret a successful rhythm hit
as an upstream kill, or mix render-frame time into either simulator. The existing
recorded mode should remain available for fair authored charts.

The collaboration is Apache-2.0, including its map export, score and recordings.
It is **not** covered by StateBeats' CC0 dedication. Original upstream files keep
their license; NOTICE and SHA-256 provenance travel in packages and static builds.
See [Ink-Battle](https://github.com/RONITERVO/Ink-Battle) and
[content licensing](../CONTENT_LICENSE.md).

## Verification

The collaboration tests reproduce all six recordings from legal commands, verify
the upstream file hashes and soundtrack hash, check approach clearance and reach,
complete all 358 interactions at height 1.65 / room scale 1.2, restore a midpoint
checkpoint and verify the finished replay. A head-only actor cannot parry a shot.

Browser tests render every age, return to an earlier tick, check head/contact
alignment, confirm instance buffers do not overflow, and verify resource counts
return to the same baseline after repeated map switches. The sampled six-age
views used 33–46 draw calls; these desktop checks are not Quest benchmarks.
Production playback tests fetch the bundled MP3 under a GitHub Pages project
path, pause/resume the actual audio, finish with zero misses and export a verified
replay. Package smoke tests check the standalone upstream SDK, headless sampler,
audio bytes and Apache notices from freshly installed tarballs.
