# Note presentation: timing belongs to the map, expression belongs to the adapter

The core continues to score only timed poses against authoritative geometry. The SDK
projects that trajectory into shared, deterministic presentation cues. A renderer can
express those cues as a ribbon, energy, emerging creatures, growing plants or something
else; an audio, text or agent adapter receives the same timing and path data.

## Authoring

Each note may include an optional `presentation` object:

```json
{
  "version": 1,
  "presence": "emerge",
  "appearMs": 320,
  "releaseMs": 260,
  "guide": "window",
  "ahead": { "beats": 0.75 },
  "behind": { "beats": 0.5 },
  "readiness": {
    "preview": { "beats": 2 },
    "prepare": { "beats": 1 }
  }
}
```

- `presence`: `fade`, `instant` or `emerge` is an artistic suggestion. It does not
  change spawn time, contact eligibility, collision shape or the note's actual position.
- `appearMs`: appearance duration, automatically shortened to finish before the first
  eligible contact tick. Zero lead time never leaves a hittable note invisible.
- `releaseMs`: non-interactive completion/miss/expiry duration; zero omits release effects.
- `guide`: `window` reveals the moving section; `none` omits the guide; `full` deliberately
  reveals the complete contact route for a map or practice experience that wants it.
- `ahead` and `behind`: each uses either `{ "ms": ... }` or `{ "beats": ... }`.
  Beat windows cross tempo changes using the map's tempo timeline and tick quantization.
- `readiness`: optional staged anticipation, useful for notes that materialize in reach.
  `preview` sets how long before first eligible contact the note becomes perceptible;
  `prepare` sets when preparation begins within that preview. Both accept milliseconds
  or beats. An empty object defaults to two beats of preview and one beat of preparation.
  Omit the object to preserve the earlier lifecycle without this extra policy.

`schemas/map.schema.json` describes authoring inputs, including omitted defaults such as
`readiness: {}` or an object with only `preview` or `prepare`. Runtime parsing fills the
defaults; compilation also checks semantic constraints that JSON Schema cannot express.

Existing maps need no migration: holds default to a 350 ms leading window and 180 ms
trail; other targets default to no guide. Default appearance and release times are
160 ms and 240 ms. An explicitly supplied presentation object defaults to a window,
which also lets authors give a moving strike an approach guide.

Guides begin no earlier than the note's actual spawn. Before arrival, the guide lies
on its approach trajectory; after arrival, the same window follows the held motion.
Stationary targets have no invented flight: they appear at their contact location and
reveal their upcoming held movement only as its time enters the window. Separate notes
are never automatically connected into a path that might imply a required hold.

### Waiting, preparation and contact

Staged anticipation separates existence in the simulation from a request to act. A note
can already exist at its future contact position while its presentation remains hidden.
At `previewTick` it starts appearing as a waiting cue. At `prepareTick` its preparation
progress begins, reaching one at `readyTick`. That last tick is the first time contact can
count: the start of a strike's early window, or the scheduled start of a hold or hazard.
It does not depend on when a trajectory starts moving, which might be earlier or later.

Preview cannot precede core spawn; preparation cannot precede preview or finish after
eligibility. Appearance begins at preview and is shortened to finish by eligibility.
Zero preview/lead time reveals the note immediately when eligible. These rules avoid a
fully transparent hittable target. Beats cross tempo changes using the shared timeline.
Guides remain absent during waiting, then their point strengths increase smoothly with
preparation. They still follow the same bounded, authoritative route.

The reference player uses a faint broken outline and subdued requirement label while
waiting. Solid artwork, the contact ring and guidance brighten together during preparation;
the outline disappears at eligibility. High contrast strengthens the waiting outline;
reduced motion keeps the same schedule without requiring flashing, shaking or color changes.
Artists may interpret the shared phases differently, such as a crack in the ground before
a creature emerges, or a charging source before an energy target activates. Keep anticipation
and active contact visually distinguishable. This is a per-note map policy, not a global
opacity rule or a change to collision geometry, scoring, hand acquisition or hold duration.

## Shared SDK contract

`createNotePresenter(parsedMap)` returns `sample(entity, tick, resolution?)` and
`releaseTicks(id, kind)`. Sampling uses the core's piecewise-linear `positionAt` and the
entity's stage transform captured at spawn. It needs no clock, random number, render
history or wall-time animation. Author actual curved gestures through motion keys;
do not render a smoothed shortcut that differs from the scored route.
The shared position lookup uses binary search over validated, increasing motion keys.
Each lookup takes logarithmic work and retains the original interpolation arithmetic,
including exact key boundaries; wide guides do not rescan every key for every point.

Every session target has `presentation` containing:

- phase: `hidden`, `appearing`, `approaching`, `waiting`, `ready`, `active` or `resolved`;
- arrival: `approach` or `materialize` (independent of strike/hold/hazard);
- normalized `appearanceProgress`, `releaseProgress`, and suggested `visibility`;
- `spawnTick`, `readyTick` (earliest eligible contact), and optional resolution tick/outcome;
- optional `readiness`: `phase` (`hidden`, `waiting`, `preparing`, `ready` or `resolved`),
  `previewTick`, `prepareTick`, and linear preparation `progress` from zero to one;
- a bounded world-space `path` with `{ tick, position, strength }` samples.

`active` means the scheduled hit time has arrived, not that a hand has acquired the
target. Use the ordinary interaction state/events to determine contact and completion.
All authored corners inside the window and the exact current head are retained; extra
samples support gradual tapering. At most 290 points are emitted per path. A reduced
motion renderer can omit decorative movement without changing the visible route.

`observe()` includes separate `resolvedEntities`. These cannot be hit and are excluded
from target selection and `describeObservation().targets`. The core transition returns
detached `resolvedEntities` containing the final interaction state after evaluation; this
additive output does not change world state, events, scoring or recording identity. The SDK
uses these exact states for release effects, including same-tick spawn/hit and director spawns,
regardless of how often anyone observes. Restoring a checkpoint reconstructs them from
its verified command timeline. A maximum of 256 releases is retained, oldest first
discarded if that cosmetic budget is exceeded. Resolution stops future-path revelation;
only the already travelled tail remains while it fades. At session end simulation time
stops, so the SDK clears all release effects, including those created on the terminal tick.
Finished observations contain no release artwork that could freeze behind a results view.
Pause/manual stepping still freezes ordinary releases at their current simulation tick.

`describeObservation()` carries the same presentation in each semantic target cue;
audio, speech, haptic and agent adapters can interpret it without importing Three.js.
CLI/MCP observations expose it through their existing session APIs.
The semantic description omits readiness-hidden targets and distinguishes upcoming,
preparing and actionable instructions. Reference audio cues and desktop direction/camera
selection respect the same hidden interval. Raw observations retain authoritative entities
for tooling; use their presentation cues when implementing a perception adapter.
Desktop pointer assistance also ignores readiness-hidden targets. The text output sink emits
readiness phase changes even within the same second while suppressing repeated stable frames.
The manual text player's next-cue action stops at preview, preparation and first eligible
contact, as well as ordinary spawn/hit ticks; short preparation and early hit windows are
not skipped.

### Compatibility and information policy

The legacy `contactPath` is retained as a complete remaining contact preview for
admin/director authoring tools. Player/observer clients receive only the forward
contact portion of the presentation window. New rendering code should always consume
`presentation.path`, including when its host uses an admin capability. This is an
information convention, not an anti-cheat boundary: portable maps are inspectable.

Reveal settings affect difficulty. They are covered by `presentationHash`, separately
from the core program hash, and checkpoint/replay metadata protects their map binding.
Both recording APIs require this hash even when a map uses only default cues; deleting
it and the optional map metadata does not turn a recording into a legacy exception.
Existing version-1 exports from the committed 0.2/0.3 releases already contain this hash
and remain compatible. Unhashed files cannot be restored or reported as verified.
This is a content-consistency check, not proof of authorship: a host comparing scores
must compare the bound hash with its independently trusted map/presentation identity.
Observations expose that hash and `presentationVersion` (`statebeats/note-presentation-v1`).
Hosts comparing scores should identify both the collision program and the presentation
policy/version, plus any host-provided assistance. Do not silently increase lookahead
when changing artwork. Older observations without presentation metadata remain usable;
the scene allocates no fallback guide without a presentation cue and never guesses the
timing of a legacy full route. An explicitly supplied custom guide is still supported.
Readiness is an optional extension of presentation version 1. Omission adds no defaults
to older maps and preserves their presentation hashes. Enabling it changes the presentation
hash while leaving the compiled collision program unchanged. Older SDKs may reject maps
containing this new field; upgrade the SDK to load newly authored readiness policies.

## Reference player extension

`registerAppearance` still registers trusted code selected by a portable appearance ID.
Map JSON never loads executable code. Its returned `TargetAppearance` can now supply:

- `object`: the target artwork;
- `guide`: a `TargetGuide` with `object`, `update`, and `dispose`, or `false` to omit it;
  leaving it undefined uses the reference guide when the cue policy calls for one;
- `handlesPresence: true`: interpret lifecycle progress in the adapter. Otherwise
  `applyPresence` supplies a default opacity envelope for ordinary materials;
- `handlesReadiness: true`: interpret preparation in the artwork itself. Otherwise the
  reference player adds its readiness envelope, including to existing presence-aware
  adapters. This option does not disable the reference semantic cues or change timing;
- the existing `update` and `dispose` methods.

The scene owns and disposes the guide separately, including a supplied guide suppressed
by the map's `guide: "none"` policy. Suppressed guides are neither attached nor updated.
An appearance's `dispose` must only dispose its own artwork.

The default envelope supports mesh, sprite, line and particle materials, including material
arrays. The scene restores each material's unfaded opacity before the adapter's `update`,
then multiplies the updated opacity by visibility. This preserves animated opacity and
recovers correctly from zero visibility. Standalone adapters can use
`applyPresence(object, visibility, update)` for the same ordering. The two-argument form
supports static opacity; put opacity animation in the callback to avoid ambiguous writes
that happen to equal the previous faded value. Materials should be owned per appearance
instance. Custom shaders should interpret lifecycle data themselves.
Readiness uses an independent outer envelope, so an existing presence-aware adapter can
continue calling `applyPresence` without compounding its opacity each frame. Artwork sits
inside a scene-owned wrapper; suppressing waiting artwork does not overwrite visibility
set by the artist on their own object. Adapters taking readiness ownership receive the
same linear progress and should preserve the distinction between waiting and eligible.

`createPathGuide(color, radius?)` is a reusable bounded, tapered tube following the exact
sampled geometry, with no random jitter or frame-time state. It also supports high contrast.
Semantic hand/hold/hazard cues follow the same visibility envelope alongside the artwork.
Labels share textures but have independent material opacity per target. Unknown appearance
IDs retain a generic visible target. Completion hides actionable rings, cores and labels.

Event Horizon demonstrates travelling arcs with 0.75 beat anticipation and a 0.5 beat
tail. Its stationary holds opt into two beats of preview and one beat of preparation:
at 150 BPM, an 800 ms preview with brightening during the last 400 ms. Approaching notes
retain their flight cues. Stationary crystals assemble at their contact positions. Its motion
curves now use 65 authored samples shared by scoring and drawing. The community mole
example uses the same lifecycle for ground emergence. These are replaceable examples,
not new engine interaction types or a mandatory visual language.
