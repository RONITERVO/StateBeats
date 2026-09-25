# SDK and compatibility

StateBeats 0.3 adds [musical choreography](CHOREOGRAPHY.md): replaceable phrase, rhythm and
facing adapters, saved generation provenance, authoring diagnostics and held-path observations.
The version-1 kernel recording contract is unchanged. Maps containing generation metadata need
the 0.3 SDK or newer; previously saved maps and their presentation hashes remain valid.

Checkpoint and replay `presentationHash` is required, including for default-only maps.
The committed 0.2/0.3 exporters already write it; valid version-1 exports remain compatible.
Restore/verification rejects missing, malformed or mismatched hashes with
`PRESENTATION_MISMATCH`, without inferring a legacy exception from stripped map fields.
This verifies content consistency, not authorship. Score hosts must compare the recording's
identity against an independently trusted map/presentation identity.

## Domain contract

`transition(previous, commands, program)` returns the next immutable mathematical state and ordered
events. It imports no host runtime, renderer or third-party library. Core callers supply a validated
compiled program and typed commands; the public SDK is the untrusted-data validation boundary.
State/program invariant failures and broken trusted policies throw. Domain rejections emit
`command.rejected` without applying that command. SDK invalid batches fail atomically before queuing.

Time starts at tick 0. Commands target positive integer ticks. A step visits every intermediate tick.
`advance(n)` returns all emitted events and stops when the session ends; it never advances an ended
world. `advance(0)` is an explicit no-op. Maximum per call is 100,000 ticks. Ended sessions reject new
commands. Reading observations/events/checkpoints never moves time.

Positions are metres, +Y up and -Z forward, right-handed. Quaternions are xyzw, normalized with a
canonical sign. Spherical map positions use azimuth/elevation in degrees, radius and height.
Azimuth 0 and 360 compile identically. Optional grids are represented by choosing angle increments
in the builder; runtime geometry stays continuous. Stage anchor is an actor ID; its transform is
captured when the entity spawns. Head motion cannot move that anchor. Recalibration clears tracking
continuity; it affects subsequent spawns and does not drag already spawned targets.

## Map authoring and compilation

Optional `audio` theme and per-note `sound` metadata drive the
[spatial audio projection](SPATIAL_AUDIO.md). `MapBuilder.setAudio` and CLI/MCP `map.edit`
share validation; `sampleSpatialAudio` / `perception.audio` return bounded, tick-derived
sound sources. These fields affect presentation identity, never the core scoring program.

`MapBuilder` imports, adds/replaces/removes notes, exports and compiles. Removing a group member
removes the group and clears surviving references. `generateMap({seed,count,style,turning})` uses a
seeded integer PRNG. Style is `anchored`, `approaching` or `mixed`. Edits create new map data; a running
session retains its immutable compiled program until reset/recreation.

See `schemas/map.schema.json`, `command.schema.json`, `compiled.schema.json` and the four actual
JSON maps in `packages/content/maps`. JSON Schema covers structure; runtime validation additionally
checks duplicate IDs, exact time order, groups, capacities, policy configs and quaternion norms.
Schema version is 1; unknown versions fail. No asset URL or executable-code fields exist.

Musical beats are quarter notes, as a finite number or exact `{n,d}` fraction. Tempo integrates each
piecewise segment using BigInt rational arithmetic, then rounds to the nearest integer tick with
ties to even. Duration fractions also add exactly. Tempo must start at beat zero and increase.
Meter is metadata for musical accents; it does not change beat length. Offset seconds apply before
tick rounding. A note cannot resolve at tick zero. Tick rate is 60, 120 or 240, default 120.

Geometry is quantized to micrometres when compiling spherical coordinates. `Session.create` compiles
once. `programDescriptor` emits portable compiled data and `programIdentity` hashes the descriptor
with its self ID omitted. `Session.fromCompiled(compiled, sourceMap, actors, policies, extensions)`
validates its content hash and resolves trusted implementations without recomputing geometry.
An alternative compiler can produce this same descriptor contract. The authoring map retained beside
a replay is provenance only; the embedded compiled descriptor governs simulation.

## Requirements, motion and policies

`describeHandGuidance` / `perception.hands` project the same observations into per-hand contact
guidance for sound, haptics, text and agents. Geometry, readiness and engine participant bindings
are shared; sensory expression stays in adapters. See [the nonvisual contract](NONVISUAL_PLAY.md).

Built-in presets are `left`, `right`, `any`, `combined`, `shared`, `hazard` and `hold`.
Slots can bind a semantic, actor ID or effector ID; up to four slots are supported. `sameActor` and
`distinctActors` are independent constraints. Combined needs two different effectors from one actor;
shared needs different actors. Multiple actors competing for a single slot are a separate case,
resolved by the arbitration policy. Linked groups give each member its normal base award and a
single additional group bonus if all members complete within the link interval; a broken group
keeps earned member awards. A partially completed multi-slot entity has no base award until complete.

Strike windows include both endpoints. Contact wins on the final expiry tick. Optional speed and
direction tests use the effector's actual world movement; holds do not inherit those speed gates.
Holds require continuous eligible endpoint contact with a configured break tolerance. Hazards use
swept entry/exit, periodic penalties and head sensing. Built-in contact excludes the head from
ordinary hand notes unless a slot explicitly requests it; this convention lives in a swappable policy.

Effectors are spheres. Targets are spheres, boxes/oriented boxes or capsules with fixed orientation
and piecewise linear translation. Relative sweeps account for moving targets and moving effectors.
The sphere/box test minimizes true segment-to-box distance instead of using an inflated AABB.
Predicates use binary64 and a squared-distance epsilon of 1e-10. There is no first-contact-time
claim: simultaneous claims use stable actor-registration then effector order by default. Rotating
elongated sweeps, meshes, general rigid-body physics and arbitrary deforming shapes are outside v1.

Register `InteractionPolicy` values through `Session.create`'s policy argument. Policies have an
ID/version, config validator and pure contact/memory evaluation. Their serializable memory is part
of state. They may filter genuine contacts; they cannot fabricate contact identity or force scores.
Scoring and arbitration are supplied in the fourth `RuleExtensions` argument. Results are validated.
All execution code is host-provided; replay JSON contains only versioned references. Refer to
`examples/extensions.mjs` and `tests/extensions.test.ts` for complete substitutions.

## Sessions, time, actors and senses

The trusted host owns `Session`. Give a caller a bound `SessionClient` (`player`, `director`,
`observer` or `admin`). A player sees spawned entities, scores and its own actor; no RNG,
unspawned notes, other actor poses or checkpoint internals. Director may spawn validated entities
with no compiled group; IDs cannot be reused and capacity is reserved through their lifetime.
Default maximum is 16 actors and 2,000 active entities, with 16 director spawns per tick.

`submit(requestId, commands)` accepts 1–1,024 future commands atomically. IDs are stable and unique
within a session. Reusing a request with the same payload returns its original result; different
payload fails `RETRY_CONFLICT`. Multiple poses for the same actor/effector/tick coalesce to the
lexically greatest command ID. This rule is explicit and does not depend on arrival cadence.
Use padded sequence numbers if IDs should sort numerically. Lost tracking freezes position and
disables interaction; reacquisition produces zero-length hand motion rather than a gap-spanning sweep.

`ManualClock` and `RealtimeClock` wrap the same stepping contract. Only one mode owns advancement.
Realtime uses explicit monotonic pump timestamps, retains backlog under a bounded catch-up limit,
and pauses on a large stall. Resume rebases audio. It never skips a simulation tick to catch up.
Rendering cadence and playback speed do not change tick rate or recorded input timing.

`attachActor(capability, source)` calls `poll(nextTick, observation)` for bounded synchronous bots.
External LLM calls submit to the queue between ticks; simulation never awaits the LLM.
`attachSink(capability, sink)` provides copied `frame` and `events` data. Unsubscribe/dispose detaches
the adapter; repeated faults quarantine it. Same-thread callbacks must be trusted and fast.
The reference player places simulation in a Worker to isolate rendering work. SDK event cursors
retain 4,096 events and return explicit `overflow` if a consumer falls behind; resync observation
and use the new cursor. Full authoritative event history is retained for replay within session limits.

Map and replay stores are async interfaces. In-memory stores are default; `@statebeats/adapters-node`
adds hashed-filename atomic filesystem stores for built-in-policy sessions. Custom-policy hosts can
implement the same `ReplayStore` contract with their registered verifier.

## Replay, persistence and limits

Checkpoint stores complete world, compiled program, source metadata, future inbox, accepted command
timeline, command-ID registry, retries, event cursor/history and manual advance retries. Restore
reconstructs from accepted commands and verifies all continuation state before returning a session.
Restore work is proportional to elapsed ticks; checkpoints are correctness-oriented, not fast-seek
archives. Replays store initial actors, compiled configuration, accepted timeline and final state/event
SHA-256 digests. Verification rejects altered geometry, unknown policy versions or divergent outcomes.

The guarantee is identical compiled artifact, engine/policy versions, seed and ordered accepted
commands on the tested runtime matrix. Stored numeric geometry avoids recompiling trig at replay.
This is not an untested claim for every possible engine/platform. Node 24 is supported; CI matrix
and locally tested browser versions are recorded separately. Version 0.x APIs can change with
documented migration; v1 replay/schema changes must fail loudly or provide explicit migration.

Limits: 10,000 map notes, 256 motion keys/note, 4 slots, 500,000 logged commands, 100,000 submitted
request records and 100,000 clock-retry records. JSON depth is 64. Typical request/compiled limit is
16 MB; checkpoint/replay validation allows 64 MB. Segment very long agent sessions by exporting and
resetting. `EngineService` serializes operations; host setup retries with a request ID are retained for
its process lifetime (10,000 records), while session command/clock retries survive checkpoint restore.

## Audio and perception limits

The reference audio adapter renders oscillators through Web Audio HRTF panners. Left/right use
different timbres and pitches, paired notes use a chord, holds use a longer cue, hazards use a low
rough tone, height shifts pitch and rear targets add a second knock. Hits/misses have distinct feedback.
Beat scheduling follows the compiled tempo map with a short look-ahead. Audio offset affects sound
only; negative offsets apply to scheduled cues, while immediate feedback cannot play in the past.
Pausing stops voices and resume rebases from the current tick. These are synthesized original sounds.
Offline rendering is tested in Chromium and Firefox on Windows; the Windows WebKit runner lacks
OfflineAudioContext and only its engine conformance is verified. Human audio-only usefulness and Quest audio latency
are unverified until actual playtesting.

## StateBeats 0.2 extensions

Personal layout adaptation is available as `fitMapToPlayer(map, { height, roomScale })` and
the CLI/MCP `map.fit` operation. It bakes standard map coordinates, records `playerProfile`,
preserves timing and collision sizes, and is idempotent for the same profile. Room scale is
horizontal X/Z spread; height scales vertical layout from the floor. See CHOREOGRAPHY.md.

The package namespace is now `@statebeats/*`; the CLI is `statebeats`, and MCP host settings
use `STATEBEATS_ROLE`, `STATEBEATS_ACTOR`, `STATEBEATS_MAP` and `STATEBEATS_ALLOW_ADVANCE`.
Kernel recording version 0.1.0 remains unchanged: existing pure transition semantics and
compiled recording format are retained. Package version and kernel replay version serve
different purposes.

Maps can carry versioned scene and music data, and notes can refer to moving emission
sources and presentation labels/appearances. Compiled emissions become ordinary paths in
the existing kernel. New recordings protect scene/music metadata with a separate integrity
hash. Public observations include current scene/music frames and active-target destinations.
See [the scene, music and access contract](SCENES_MUSIC_ACCESS.md) and `examples/scenes.mjs`.
